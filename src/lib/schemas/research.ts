import { z } from "zod";
import { CompanyBriefSchema, type CompanyBrief } from "./brief";

/**
 * Strict-mode-friendly schema for OpenAI Structured Outputs. No defaults, no
 * record types, every field required. We convert to the lenient runtime
 * CompanyBrief after parsing.
 */
const WireBriefSchema = z.object({
  industry: z.string(),
  oneLiner: z.string(),
  customers: z.array(
    z.object({
      segment: z.string(),
      needs: z.array(z.string()),
    })
  ),
  valueProps: z.array(z.string()),
  brandVoiceAdjectives: z.array(z.string()),
  brandVoiceDoNots: z.array(z.string()),
  palette: z.array(z.string()),
  typographyVibe: z.string(),
  sketchStyle: z.string(),
  photographyVibe: z.string(),
  constraints: z.array(z.string()),
});

const WireCandidate = z.object({
  name: z.string(),
  knownAs: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string(),
  brief: WireBriefSchema,
});

export const WireResearchResultSchema = z.object({
  query: z.string(),
  candidates: z.array(WireCandidate),
  notes: z.string(),
});
export type WireResearchResult = z.infer<typeof WireResearchResultSchema>;

/** Runtime-friendly types used by the UI and database. */
export const CompanyCandidateSchema = z.object({
  name: z.string(),
  knownAs: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string(),
  brief: CompanyBriefSchema,
});
export type CompanyCandidate = z.infer<typeof CompanyCandidateSchema>;

export const ResearchResultSchema = z.object({
  query: z.string(),
  candidates: z.array(CompanyCandidateSchema),
  notes: z.string(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;

export function wireToResearchResult(w: WireResearchResult): ResearchResult {
  return {
    query: w.query,
    notes: w.notes,
    candidates: w.candidates.map((c) => {
      const brief: CompanyBrief = {
        industry: c.brief.industry,
        oneLiner: c.brief.oneLiner,
        customers: c.brief.customers,
        valueProps: c.brief.valueProps,
        brandVoice: {
          adjectives: c.brief.brandVoiceAdjectives,
          doNots: c.brief.brandVoiceDoNots,
        },
        visualStyle: {
          palette: c.brief.palette,
          typographyVibe: c.brief.typographyVibe,
          sketchStyle: c.brief.sketchStyle,
          photographyVibe: c.brief.photographyVibe,
        },
        constraints: c.brief.constraints,
        sources: {},
      };
      return {
        name: c.name,
        knownAs: c.knownAs,
        confidence: c.confidence,
        summary: c.summary,
        brief,
      };
    }),
  };
}
