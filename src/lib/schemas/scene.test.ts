import { describe, it, expect } from "vitest";
import { ScenePlanSchema, SceneSchema } from "./scene";

describe("SceneSchema", () => {
  it("applies sensible defaults", () => {
    const r = SceneSchema.parse({
      index: 0,
      title: "Scene 1",
      imagePrompt: "a coffee shop at night",
      caption: "Begin",
      narration: "It's late.",
    });
    expect(r.durationSec).toBe(4);
    expect(r.transition).toBe("fade");
    expect(r.locked).toBe(false);
    expect(r.frameStorageKey).toBeNull();
    expect(r.audioStorageKey).toBeNull();
  });

  it("rejects bad transition", () => {
    expect(
      SceneSchema.safeParse({
        index: 0,
        title: "t",
        imagePrompt: "p",
        caption: "c",
        narration: "n",
        transition: "wormhole",
      }).success
    ).toBe(false);
  });
});

describe("ScenePlanSchema", () => {
  it("requires at least one scene", () => {
    expect(ScenePlanSchema.safeParse({ styleSummary: "x", scenes: [] }).success).toBe(false);
  });
});
