import { describe, it, expect } from "vitest";
import { mockSketchPng, mockFramePng, mockGlb } from "./mock-assets";

describe("mockSketchPng", () => {
  it("returns deterministic bytes for the same seed", () => {
    const a = mockSketchPng("seed-1");
    const b = mockSketchPng("seed-1");
    expect(a.equals(b)).toBe(true);
  });

  it("varies for different seeds", () => {
    const a = mockSketchPng("seed-1");
    const b = mockSketchPng("seed-2");
    expect(a.equals(b)).toBe(false);
  });

  it("returns valid SVG content", () => {
    const a = mockSketchPng("any");
    const s = a.toString("utf8");
    expect(s.startsWith("<svg")).toBe(true);
    expect(s.includes("</svg>")).toBe(true);
  });

  it("mockFramePng works the same way", () => {
    expect(mockFramePng("x").length).toBeGreaterThan(0);
  });
});

describe("mockGlb", () => {
  it("starts with the glTF magic header", () => {
    const buf = mockGlb();
    expect(buf.toString("utf8", 0, 4)).toBe("glTF");
  });

  it("declares version 2", () => {
    const buf = mockGlb();
    expect(buf.readUInt32LE(4)).toBe(2);
  });

  it("has a length matching the buffer size", () => {
    const buf = mockGlb();
    expect(buf.readUInt32LE(8)).toBe(buf.length);
  });

  it("has a JSON chunk that parses to valid glTF metadata", () => {
    const buf = mockGlb();
    const jsonLen = buf.readUInt32LE(12);
    const chunkType = buf.toString("utf8", 16, 20);
    expect(chunkType).toBe("JSON");
    const json = buf.toString("utf8", 20, 20 + jsonLen).trim();
    const parsed = JSON.parse(json);
    expect(parsed.asset.version).toBe("2.0");
  });
});
