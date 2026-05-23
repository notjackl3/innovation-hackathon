import { describe, it, expect } from "vitest";
import { TriageResultSchema, IdeaScoresSchema, IdeaTypeSchema } from "./idea";

describe("Idea schemas", () => {
  it("IdeaType is restricted", () => {
    expect(IdeaTypeSchema.safeParse("PRODUCT").success).toBe(true);
    expect(IdeaTypeSchema.safeParse("HARDWARE").success).toBe(false);
  });

  it("IdeaScores requires all four categories", () => {
    const valid = {
      marketFit: { score: 7, rationale: "ok" },
      feasibility: { score: 6, rationale: "ok" },
      novelty: { score: 5, rationale: "ok" },
      brandAlignment: { score: 8, rationale: "ok" },
    };
    expect(IdeaScoresSchema.safeParse(valid).success).toBe(true);
    // Missing one
    const invalid = { ...valid, brandAlignment: undefined };
    expect(IdeaScoresSchema.safeParse(invalid).success).toBe(false);
  });

  it("IdeaScores rejects scores out of range", () => {
    expect(
      IdeaScoresSchema.safeParse({
        marketFit: { score: 11, rationale: "x" },
        feasibility: { score: 6, rationale: "x" },
        novelty: { score: 5, rationale: "x" },
        brandAlignment: { score: 8, rationale: "x" },
      }).success
    ).toBe(false);
  });

  it("TriageResult composes brief + scores + type", () => {
    const r = TriageResultSchema.safeParse({
      primaryType: "SOFTWARE",
      alsoConsider: [],
      brief: { problem: "x", audience: "y", keyFeatures: [], successMetric: "z", risks: [] },
      scores: {
        marketFit: { score: 7, rationale: "ok" },
        feasibility: { score: 6, rationale: "ok" },
        novelty: { score: 5, rationale: "ok" },
        brandAlignment: { score: 8, rationale: "ok" },
        recommendation: "do it",
      },
    });
    expect(r.success).toBe(true);
  });
});
