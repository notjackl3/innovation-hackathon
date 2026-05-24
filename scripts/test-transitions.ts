import { promises as fs } from "fs";
import path from "path";
import { renderSlideshow } from "../src/lib/ai/ffmpeg-runner";

(async () => {
  const keys: string[] = JSON.parse(await fs.readFile("/tmp/keys.json", "utf8"));
  const frames: Buffer[] = [];
  for (const k of keys) frames.push(await fs.readFile(path.join(process.cwd(), "storage", k)));

  for (const t of ["smoothleft", "slideleft", "dissolve", "fade"] as const) {
    const out = await renderSlideshow({
      frames,
      durations: frames.map(() => 4),
      captions: frames.map((_, i) => `Scene ${i + 1}`),
      transition: t,
      transitionSec: 0.8,
    });
    await fs.writeFile(`/tmp/out-${t}.mp4`, out);
    console.log(t, "bytes=", out.length);
  }
})().catch((e) => { console.error(e); process.exit(1); });
