import { prisma } from "@/lib/db";
import { registerHandler } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { renderSlideshow, renderMontage } from "@/lib/ai/ffmpeg-runner";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
}

interface Output {
  videoStorageKey: string;
  rendererUsed: "ffmpeg" | "ffmpeg-montage" | "renderer" | "manifest";
  framesUsed: number;
  durationSec: number;
}

/**
 * Assembles a slideshow MP4 from the scene plan's rendered frames.
 *
 * Priority order:
 *  1. If RENDERER_URL is set, post to the external renderer service.
 *  2. Otherwise, use bundled ffmpeg-static to produce an MP4 in-process.
 *  3. If no frames exist, write a JSON manifest as a last-resort artifact
 *     and tell the user to render frames first.
 */
registerHandler<Input, Output>("ASSEMBLE_VIDEO", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  const artifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact?.versions[0]?.contentJson) throw new Error("Scene plan missing");
  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(artifact.versions[0].contentJson));

  const storage = getStorage();
  const outKeyBase = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/videos/${input.scenePlanArtifactId}-${Date.now()}`;
  await ctx.setProgress(10);

  const scenesWithFrames = plan.scenes.filter((s) => s.frameStorageKey);
  const scenesWithVideos = plan.scenes.filter((s) => s.videoStorageKey);
  await ctx.log(
    `Scene plan has ${plan.scenes.length} scenes; ${scenesWithFrames.length} have stills, ${scenesWithVideos.length} have motion videos.`
  );

  // Preferred path: every scene has a per-scene Seedance MP4 → stitch real motion clips.
  if (scenesWithVideos.length === plan.scenes.length && scenesWithVideos.length > 0) {
    await ctx.log("Stitching motion clips (renderMontage)");
    const ordered = [...plan.scenes].sort((a, b) => a.index - b.index);
    const clips: Buffer[] = [];
    const durations: number[] = [];
    const captions: string[] = [];
    for (const scene of ordered) {
      try {
        const bytes = await storage.get(scene.videoStorageKey!);
        clips.push(bytes);
        durations.push(scene.durationSec ?? 5);
        captions.push(scene.caption ?? "");
      } catch (e) {
        await ctx.log(`Scene ${scene.index} video unreadable (${(e as Error).message}); falling back to still-image path.`);
        // Fall through to slideshow path by clearing clips
        clips.length = 0;
        break;
      }
    }
    if (clips.length > 0) {
      await ctx.setProgress(35);
      const mp4 = await renderMontage({ clips, durations, captions });
      await ctx.setProgress(85);
      const key = `${outKeyBase}.mp4`;
      await storage.put(key, mp4, "video/mp4");
      await persist(track.id, key, "ffmpeg-montage", input.scenePlanArtifactId, "video/mp4");
      await ctx.setProgress(100);
      return {
        videoStorageKey: key,
        rendererUsed: "ffmpeg-montage",
        framesUsed: clips.length,
        durationSec: durations.reduce((a, b) => a + b, 0) - 0.6 * Math.max(0, clips.length - 1),
      };
    }
  }

  // Fallback path: no frames at all → manifest
  if (scenesWithFrames.length === 0) {
    const manifestKey = `${outKeyBase}.json`;
    const bytes = Buffer.from(
      JSON.stringify({ plan, note: "Render all frames before assembling a video." }, null, 2),
      "utf8"
    );
    await storage.put(manifestKey, bytes, "application/json");
    const out = await persist(track.id, manifestKey, "manifest", input.scenePlanArtifactId, "application/json");
    await ctx.setProgress(100);
    return { videoStorageKey: manifestKey, rendererUsed: "manifest", framesUsed: 0, durationSec: 0, ...out };
  }

  // External renderer path
  if (process.env.RENDERER_URL) {
    await ctx.log("Using external renderer service");
    const res = await fetch(`${process.env.RENDERER_URL}/assemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes: plan.scenes, outputKey: `${outKeyBase}.mp4` }),
    });
    if (!res.ok) throw new Error(`Renderer error: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const key = `${outKeyBase}.mp4`;
    await storage.put(key, buf, "video/mp4");
    await ctx.setProgress(95);
    await persist(track.id, key, "renderer", input.scenePlanArtifactId, "video/mp4");
    return {
      videoStorageKey: key,
      rendererUsed: "renderer",
      framesUsed: scenesWithFrames.length,
      durationSec: scenesWithFrames.reduce((a, s) => a + (s.durationSec ?? 4), 0),
    };
  }

  // Local ffmpeg path
  await ctx.log(`Rendering MP4 in-process with ffmpeg (${scenesWithFrames.length} frames)`);
  const ordered = [...plan.scenes].sort((a, b) => a.index - b.index);
  const frames: Buffer[] = [];
  const durations: number[] = [];
  const captions: string[] = [];
  for (const scene of ordered) {
    if (!scene.frameStorageKey) continue;
    let bytes: Buffer;
    try {
      bytes = await storage.get(scene.frameStorageKey);
    } catch (e) {
      await ctx.log(`Skipping scene ${scene.index}: storage read failed (${(e as Error).message}).`);
      continue;
    }
    // Skip non-PNG frames (e.g. lingering SVG mock frames) — the encoder needs real images.
    if (bytes.length < 8 || bytes[0] === 0x3c /* '<' = SVG/XML */) {
      await ctx.log(`Skipping scene ${scene.index}: stored frame is not a raster image.`);
      continue;
    }
    frames.push(bytes);
    durations.push(scene.durationSec ?? 4);
    captions.push(scene.caption ?? "");
  }
  if (frames.length === 0) {
    throw new Error("No raster (PNG) frames available. Render all frames first (turn off MOCK_AI for real images).");
  }
  await ctx.setProgress(35);
  const mp4 = await renderSlideshow({ frames, durations, captions });
  await ctx.setProgress(85);

  const key = `${outKeyBase}.mp4`;
  await storage.put(key, mp4, "video/mp4");
  await persist(track.id, key, "ffmpeg", input.scenePlanArtifactId, "video/mp4");
  await ctx.setProgress(100);

  return {
    videoStorageKey: key,
    rendererUsed: "ffmpeg",
    framesUsed: frames.length,
    durationSec: durations.reduce((a, b) => a + b, 0),
  };
});

async function persist(
  trackId: string,
  storageKey: string,
  rendererUsed: string,
  scenePlanArtifactId: string,
  contentType: string,
) {
  let videoArtifact = await prisma.artifact.findFirst({
    where: { trackId, kind: "VIDEO" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!videoArtifact) {
    const created = await prisma.artifact.create({
      data: { trackId, kind: "VIDEO", label: rendererUsed === "manifest" ? "Service preview manifest" : "Service demo video" },
    });
    videoArtifact = { ...created, versions: [] };
  }
  const parentVersionId = videoArtifact.versions[0]?.id;
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: videoArtifact.id,
      parentVersionId: parentVersionId ?? null,
      storageKey,
      meta: JSON.stringify({ rendererUsed, contentType, scenePlanArtifactId }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: videoArtifact.id },
    data: { currentVersionId: version.id },
  });
  return {};
}
