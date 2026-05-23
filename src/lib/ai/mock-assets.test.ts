import { describe, it, expect } from "vitest";
import { mockSketchPng, mockFramePng } from "./mock-assets";

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
