import { describe, it, expect } from "vitest";
import { toggleBlock, applyMarqueeHits } from "./selection-state";

describe("toggleBlock", () => {
  it("from empty, click selects just that index", () => {
    expect(toggleBlock([], 2, false)).toEqual([2]);
  });

  it("from a different selection, plain click replaces with the clicked index", () => {
    expect(toggleBlock([0, 1, 3], 5, false)).toEqual([5]);
  });

  it("plain click on the only selected block deselects it", () => {
    expect(toggleBlock([4], 4, false)).toEqual([]);
  });

  it("plain click on a block that's part of a multi-selection narrows down to it", () => {
    expect(toggleBlock([1, 2, 3], 2, false)).toEqual([2]);
  });

  it("shift-click on unselected adds and keeps sort order", () => {
    expect(toggleBlock([3, 1], 2, true)).toEqual([1, 2, 3]);
  });

  it("shift-click on selected removes it", () => {
    expect(toggleBlock([1, 2, 3], 2, true)).toEqual([1, 3]);
  });

  it("shift-click can deselect the last selected block down to []", () => {
    expect(toggleBlock([4], 4, true)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const prev = [1, 2];
    const frozen = [...prev];
    toggleBlock(prev, 3, true);
    expect(prev).toEqual(frozen);
  });
});

describe("applyMarqueeHits", () => {
  it("empty hits + non-additive clears the selection", () => {
    expect(applyMarqueeHits([1, 2], [], false)).toEqual([]);
  });

  it("empty hits + additive preserves the existing selection", () => {
    expect(applyMarqueeHits([1, 2], [], true)).toEqual([1, 2]);
  });

  it("non-additive replaces selection with hits and sorts", () => {
    expect(applyMarqueeHits([0], [3, 1, 2], false)).toEqual([1, 2, 3]);
  });

  it("additive unions and de-dupes, preserves sort order", () => {
    expect(applyMarqueeHits([1, 3], [2, 3, 4], true)).toEqual([1, 2, 3, 4]);
  });

  it("additive from empty == non-additive (same set)", () => {
    expect(applyMarqueeHits([], [2, 1], true)).toEqual([1, 2]);
    expect(applyMarqueeHits([], [2, 1], false)).toEqual([1, 2]);
  });

  it("does not mutate the input arrays", () => {
    const prev = [0];
    const hits = [2, 1];
    const frozenPrev = [...prev];
    const frozenHits = [...hits];
    applyMarqueeHits(prev, hits, true);
    expect(prev).toEqual(frozenPrev);
    expect(hits).toEqual(frozenHits);
  });
});
