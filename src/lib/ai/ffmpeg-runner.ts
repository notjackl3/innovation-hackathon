import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);

export interface RenderInput {
  /** Per-scene PNG buffers, in display order. */
  frames: Buffer[];
  /** Per-scene duration in seconds, same order as frames. */
  durations: number[];
  /** Per-scene captions to burn into the bottom-third of the frame. */
  captions: string[];
  /** Output width / height. */
  width?: number;
  height?: number;
  /**
   * Transition duration in seconds. The two adjacent scenes overlap for this
   * long. Set to 0 to use hard cuts.
   */
  transitionSec?: number;
  /**
   * xfade transition name. "smoothleft" gives a flowing slide that feels
   * continuous; "slideleft" is more presentation-like; "dissolve" is a soft
   * pixel-mix; "fade" is the boring default we're moving away from.
   */
  transition?:
    | "smoothleft"
    | "smoothright"
    | "slideleft"
    | "slideright"
    | "dissolve"
    | "wipeleft"
    | "circleopen"
    | "fade";
}

/**
 * Escape a string for use in an ffmpeg drawtext filter value. drawtext is
 * notoriously fragile: backslash, colon, single-quote, percent and comma all
 * need careful handling. We sanitise aggressively and keep it short.
 */
function safeDrawtext(s: string): string {
  return s.replace(/\\/g, " ").replace(/[':,]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Renders a slideshow MP4 from per-scene PNGs using bundled ffmpeg-static.
 * All scenes are stitched in a single ffmpeg invocation via filter_complex so
 * there are no intermediate encodings (which previously caused duration drift
 * and the file ballooning to 15 minutes for ~10 seconds of content).
 *
 *  - Each input is held for its `durations[i]` seconds via `-loop 1 -t`.
 *  - Each input is scaled/cropped to W×H, captioned, and given a stable fps.
 *  - Adjacent inputs are joined with the chosen xfade transition.
 *  - Final output `-t` is clamped to the exact expected length so no
 *    trailing freeze-frame can pad the file.
 */
export async function renderSlideshow(input: RenderInput): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
  if (input.frames.length === 0) throw new Error("No frames to render");
  if (input.frames.length !== input.durations.length) {
    throw new Error("frames.length must equal durations.length");
  }

  const W = input.width ?? 1280;
  const H = input.height ?? 720;
  const transitionSec = input.transitionSec ?? 0.8;
  const transition = input.transition ?? "smoothleft";
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spark-render-"));

  // Total visible duration: sum of scene durations minus the overlap
  // each transition introduces.
  const totalDuration =
    input.durations.reduce((s, d) => s + d, 0) - transitionSec * Math.max(0, input.frames.length - 1);

  try {
    // 1) Write all frames to disk and register them as inputs.
    const args = ffmpeg();
    for (let i = 0; i < input.frames.length; i++) {
      const png = path.join(tmpRoot, `f-${i}.png`);
      await fs.writeFile(png, input.frames[i]);
      args.input(png).inputOptions(["-loop", "1", "-t", String(input.durations[i])]);
    }

    // 2) Per-input filter chain: scale/crop, fixed fps, caption overlay.
    let filter = "";
    for (let i = 0; i < input.frames.length; i++) {
      const cap = safeDrawtext(input.captions[i] ?? "");
      const drawtext = cap
        ? `,drawtext=text='${cap}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=h-180:shadowcolor=black@0.7:shadowx=2:shadowy=2:box=1:boxcolor=black@0.45:boxborderw=14`
        : "";
      filter +=
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,` +
        `crop=${W}:${H},setsar=1,fps=30,format=yuv420p${drawtext}[v${i}];`;
    }

    // 3) Chain xfade transitions across all clips.
    let lastLabel = "v0";
    if (input.frames.length === 1) {
      // single clip: still need a vout label
      filter += `[v0]null[vout];`;
      lastLabel = "vout";
    } else {
      let runningOffset = 0;
      for (let i = 0; i < input.frames.length - 1; i++) {
        runningOffset += input.durations[i] - transitionSec;
        const outLabel = i === input.frames.length - 2 ? "vout" : `mix${i}`;
        filter +=
          `[${lastLabel}][v${i + 1}]xfade=transition=${transition}:` +
          `duration=${transitionSec}:offset=${runningOffset.toFixed(3)}[${outLabel}];`;
        lastLabel = outLabel;
      }
    }

    const finalPath = path.join(tmpRoot, "final.mp4");
    args
      .complexFilter(filter.replace(/;$/, ""))
      .outputOptions([
        "-map", `[${lastLabel}]`,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-preset", "veryfast",
        "-crf", "22",
        "-movflags", "+faststart",
        // Hard-cap output duration so a stray padding frame can't extend the file.
        "-t", totalDuration.toFixed(3),
      ])
      .output(finalPath);

    await new Promise<void>((resolve, reject) => {
      args
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`ffmpeg: ${err.message}`)))
        .run();
    });

    return await fs.readFile(finalPath);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
