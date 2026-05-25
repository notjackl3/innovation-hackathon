import { describe, it, expect } from "vitest";
import { computeDropTarget, moveBlock, type BlockSlot } from "./drag-utils";

const slots: BlockSlot[] = [
  { index: 0, top: 0, bottom: 80 },
  { index: 1, top: 100, bottom: 180 },
  { index: 2, top: 200, bottom: 280 },
  { index: 3, top: 300, bottom: 380 },
];

describe("computeDropTarget", () => {
  it("returns 0 when the cursor is above every block", () => {
    expect(computeDropTarget(-50, slots)).toBe(0);
  });

  it("returns 0 when the cursor is above the first midpoint", () => {
    // first midpoint = 40
    expect(computeDropTarget(20, slots)).toBe(0);
  });

  it("returns 1 when the cursor sits between the first block's mid and the second's mid", () => {
    // first mid = 40, second mid = 140
    expect(computeDropTarget(90, slots)).toBe(1);
    expect(computeDropTarget(120, slots)).toBe(1);
  });

  it("returns slots.length when the cursor is below the last midpoint", () => {
    // last midpoint = 340
    expect(computeDropTarget(500, slots)).toBe(4);
    expect(computeDropTarget(345, slots)).toBe(4);
  });

  it("returns 0 for an empty slot list", () => {
    expect(computeDropTarget(50, [])).toBe(0);
  });

  it("works when slots are passed out of order", () => {
    const shuffled = [slots[3], slots[1], slots[0], slots[2]];
    expect(computeDropTarget(120, shuffled)).toBe(1);
  });
});

describe("moveBlock", () => {
  const arr = ["a", "b", "c", "d"];

  it("moves an element down into a later slot", () => {
    // move index 0 to slot 3 → b,c,a,d
    expect(moveBlock(arr, 0, 3)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an element up into an earlier slot", () => {
    // move index 3 to slot 1 → a,d,b,c
    expect(moveBlock(arr, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("dropping into your own slot is a no-op", () => {
    expect(moveBlock(arr, 2, 2)).toEqual(arr);
  });

  it("dropping into the slot immediately after yourself is a no-op", () => {
    // moving index 1 to slot 2 means "stay where you are"
    expect(moveBlock(arr, 1, 2)).toEqual(arr);
  });

  it("dropping at the end works", () => {
    expect(moveBlock(arr, 0, arr.length)).toEqual(["b", "c", "d", "a"]);
  });

  it("dropping at the beginning works", () => {
    expect(moveBlock(arr, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...arr];
    moveBlock(arr, 0, 3);
    expect(arr).toEqual(copy);
  });

  it("clamps out-of-range insert positions", () => {
    expect(moveBlock(arr, 0, -5)).toEqual(["a", "b", "c", "d"]); // to=0 after clamp; from==to → no-op
    expect(moveBlock(arr, 0, 99)).toEqual(["b", "c", "d", "a"]); // to clamped to length
  });

  it("returns a copy when `from` is out of range", () => {
    const r = moveBlock(arr, 99, 0);
    expect(r).toEqual(arr);
    expect(r).not.toBe(arr);
  });

  it("when used with index arrays, produces a valid permutation", () => {
    const idx = [0, 1, 2, 3];
    const order = moveBlock(idx, 0, 3);
    expect(order).toEqual([1, 2, 0, 3]);
    // applying it to the original array reproduces moveBlock's other branch
    const arr2 = ["a", "b", "c", "d"];
    const reordered = order.map((i) => arr2[i]);
    expect(reordered).toEqual(["b", "c", "a", "d"]);
  });
});
