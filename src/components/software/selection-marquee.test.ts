import { describe, it, expect } from "vitest";
import { rectsIntersect, blocksInMarquee } from "./selection-marquee";

describe("rectsIntersect", () => {
  const a = { left: 0, top: 0, width: 100, height: 100 };

  it("returns true when rects overlap", () => {
    expect(rectsIntersect(a, { left: 50, top: 50, width: 100, height: 100 })).toBe(true);
  });

  it("returns true when one rect is fully inside the other", () => {
    expect(rectsIntersect(a, { left: 10, top: 10, width: 20, height: 20 })).toBe(true);
    expect(rectsIntersect({ left: 10, top: 10, width: 20, height: 20 }, a)).toBe(true);
  });

  it("returns false for fully disjoint rects", () => {
    expect(rectsIntersect(a, { left: 200, top: 0, width: 50, height: 50 })).toBe(false);
    expect(rectsIntersect(a, { left: 0, top: 200, width: 50, height: 50 })).toBe(false);
  });

  it("treats edge-touching rects as non-intersecting (open intervals)", () => {
    // Rect b starts exactly where a ends → no overlap area.
    expect(rectsIntersect(a, { left: 100, top: 0, width: 50, height: 50 })).toBe(false);
    expect(rectsIntersect(a, { left: 0, top: 100, width: 50, height: 50 })).toBe(false);
  });

  it("is symmetric", () => {
    const b = { left: 80, top: 80, width: 30, height: 30 };
    expect(rectsIntersect(a, b)).toBe(rectsIntersect(b, a));
  });

  it("treats a zero-area marquee inside a rect as intersecting (point-in-rect)", () => {
    // The marquee component never calls blocksInMarquee for sub-threshold
    // drags, but the helper should still behave sensibly: a point strictly
    // inside a rect counts as overlap, a point on the edge does not.
    const inside = { left: 50, top: 50, width: 0, height: 0 };
    const onEdge = { left: 100, top: 50, width: 0, height: 0 };
    expect(rectsIntersect(a, inside)).toBe(true);
    expect(rectsIntersect(a, onEdge)).toBe(false);
  });
});

describe("blocksInMarquee", () => {
  const blocks = [
    { index: 0, rect: { left: 0, top: 0, width: 200, height: 80 } },
    { index: 1, rect: { left: 0, top: 100, width: 200, height: 80 } },
    { index: 2, rect: { left: 0, top: 200, width: 200, height: 80 } },
    { index: 3, rect: { left: 0, top: 300, width: 200, height: 80 } },
  ];

  it("returns indices of overlapping blocks in input order", () => {
    const marquee = { left: 10, top: 50, width: 100, height: 200 };
    expect(blocksInMarquee(marquee, blocks)).toEqual([0, 1, 2]);
  });

  it("returns [] when marquee touches nothing", () => {
    const marquee = { left: 500, top: 500, width: 50, height: 50 };
    expect(blocksInMarquee(marquee, blocks)).toEqual([]);
  });

  it("picks a single block when marquee covers only that block", () => {
    const marquee = { left: 10, top: 110, width: 50, height: 50 };
    expect(blocksInMarquee(marquee, blocks)).toEqual([1]);
  });

  it("ignores blocks whose rects only graze the marquee edge", () => {
    const marquee = { left: 0, top: 80, width: 50, height: 20 };
    expect(blocksInMarquee(marquee, blocks)).toEqual([]);
  });

  it("supports out-of-order index values", () => {
    const odd = [
      { index: 7, rect: { left: 0, top: 0, width: 50, height: 50 } },
      { index: 3, rect: { left: 100, top: 0, width: 50, height: 50 } },
    ];
    const marquee = { left: 0, top: 0, width: 200, height: 50 };
    expect(blocksInMarquee(marquee, odd)).toEqual([7, 3]);
  });
});
