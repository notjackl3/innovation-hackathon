import { describe, it, expect } from "vitest";
import { BlockSchema, ScreenSpecSchema, safeParseBlocks, DemoBundleSchema } from "./screen";

describe("BlockSchema", () => {
  it("accepts a valid Hero block", () => {
    const r = BlockSchema.parse({ type: "Hero", headline: "Hi", ctaTo: "Detail" });
    expect(r.type).toBe("Hero");
  });
  it("rejects unknown block type", () => {
    expect(() => BlockSchema.parse({ type: "Marquee", text: "boo" })).toThrow();
  });
});

describe("safeParseBlocks", () => {
  it("drops invalid blocks, keeps valid ones", () => {
    const result = safeParseBlocks([
      { type: "Hero", headline: "Yo" },
      { type: "FakeBlock" },
      { type: "Stats", items: [{ label: "x", value: "1" }] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("Hero");
    expect(result[1].type).toBe("Stats");
  });
  it("returns [] for non-array input", () => {
    expect(safeParseBlocks(null)).toEqual([]);
    expect(safeParseBlocks(42)).toEqual([]);
  });
});

describe("ScreenSpec & DemoBundle", () => {
  it("ScreenSpec validates a complete screen", () => {
    const r = ScreenSpecSchema.parse({
      name: "Dashboard",
      title: "Dashboard",
      navLabel: "Home",
      blocks: [{ type: "Hero", headline: "Hi" }],
    });
    expect(r.blocks).toHaveLength(1);
  });
  it("DemoBundle requires at least one screen", () => {
    expect(() => DemoBundleSchema.parse({ appName: "X", tagline: "Y", screens: [], startScreen: "A" })).toThrow();
  });
});
