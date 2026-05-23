import { z } from "zod";

export const IdeaTypeSchema = z.enum(["PRODUCT", "SERVICE", "SOFTWARE"]);
export type IdeaType = z.infer<typeof IdeaTypeSchema>;

export const IdeaBriefSchema = z.object({
  problem: z.string(),
  audience: z.string(),
  keyFeatures: z.array(z.string()).default([]),
  successMetric: z.string().default(""),
  risks: z.array(z.string()).default([]),
});
export type IdeaBrief = z.infer<typeof IdeaBriefSchema>;

const ScoreEntry = z.object({
  score: z.number().min(0).max(10),
  rationale: z.string(),
});

export const IdeaScoresSchema = z.object({
  marketFit: ScoreEntry,
  feasibility: ScoreEntry,
  novelty: ScoreEntry,
  brandAlignment: ScoreEntry,
  recommendation: z.string().default(""),
});
export type IdeaScores = z.infer<typeof IdeaScoresSchema>;

export const TriageResultSchema = z.object({
  primaryType: IdeaTypeSchema,
  alsoConsider: z.array(IdeaTypeSchema).default([]),
  brief: IdeaBriefSchema,
  scores: IdeaScoresSchema,
});
export type TriageResult = z.infer<typeof TriageResultSchema>;
