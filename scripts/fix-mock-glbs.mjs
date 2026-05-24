#!/usr/bin/env node
// Replaces any storage .glb file whose contents are the old mock SVG with a
// valid (empty-scene) GLB. Idempotent. Safe to run multiple times.

import { promises as fs } from "fs";
import path from "path";

function mockGlb() {
  const json = JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], scene: 0 });
  const padLen = (4 - (json.length % 4)) % 4;
  const jsonPadded = json + " ".repeat(padLen);
  const jsonBytes = Buffer.from(jsonPadded, "utf8");
  const total = 12 + 8 + jsonBytes.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt32LE(0x46546c67, 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(total, 8);
  buf.writeUInt32LE(jsonBytes.length, 12);
  buf.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(buf, 20);
  return buf;
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const ROOT = path.resolve(process.cwd(), "storage");
let fixed = 0;
let skipped = 0;
try {
  for await (const file of walk(ROOT)) {
    if (!file.endsWith(".glb")) continue;
    const fd = await fs.open(file, "r");
    const head = Buffer.alloc(5);
    await fd.read(head, 0, 5, 0);
    await fd.close();
    if (head.toString("utf8", 0, 5) === "<svg ") {
      await fs.writeFile(file, mockGlb());
      fixed++;
      console.log(`fixed: ${path.relative(process.cwd(), file)}`);
    } else {
      skipped++;
    }
  }
} catch (e) {
  if (e.code === "ENOENT") {
    console.log("No storage directory yet — nothing to fix.");
  } else {
    throw e;
  }
}
console.log(`Done. ${fixed} fixed, ${skipped} skipped.`);
