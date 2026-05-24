import { promises as fs } from "fs";
import path from "path";
import { renderSlideshow } from "../src/lib/ai/ffmpeg-runner";

(async () => {
  const keys: string[] = JSON.parse(await fs.readFile("/tmp/keys.json", "utf8"));
  console.log("Using", keys.length, "frames");
  const frames: Buffer[] = [];
  for (const k of keys) {
    const fp = path.join(process.cwd(), "storage", k);
    frames.push(await fs.readFile(fp));
  }
  const out = await renderSlideshow({
    frames,
    durations: frames.map(() => 4),
    captions: frames.map((_, i) => `Scene ${i + 1}`),
    transition: "smoothleft",
    transitionSec: 0.8,
  });
  await fs.writeFile("/tmp/out.mp4", out);
  console.log("wrote", out.length, "bytes");
})().catch((e) => { console.error(e); process.exit(1); });
