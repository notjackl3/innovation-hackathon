import { describe, it, expect } from "vitest";
import { CompanyBriefSchema, EMPTY_BRIEF } from "./brief";

describe("CompanyBriefSchema", () => {
  it("accepts an empty object and fills defaults", () => {
    const parsed = CompanyBriefSchema.parse({});
    expect(parsed).toEqual(EMPTY_BRIEF);
    expect(parsed.brandVoice.adjectives).toEqual([]);
    expect(parsed.visualStyle.palette).toEqual([]);
  });

  it("preserves provided fields", () => {
    const parsed = CompanyBriefSchema.parse({
      industry: "Coffee",
      valueProps: ["warm", "fast"],
      visualStyle: { palette: ["#000"], sketchStyle: "line art" },
    });
    expect(parsed.industry).toBe("Coffee");
    expect(parsed.valueProps).toEqual(["warm", "fast"]);
    expect(parsed.visualStyle.palette).toEqual(["#000"]);
    expect(parsed.visualStyle.sketchStyle).toBe("line art");
  });
});
