import { z } from "zod";

export const SceneSchema = z.object({
  index: z.number().int().min(0),
  title: z.string(),
  imagePrompt: z.string(),
  caption: z.string(),
  narration: z.string(),
  durationSec: z.number().min(1).max(15).default(4),
  transition: z.enum(["cut", "fade", "zoom"]).default("fade"),
  locked: z.boolean().default(false),
  frameStorageKey: z.string().nullable().default(null),
  audioStorageKey: z.string().nullable().default(null),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScenePlanSchema = z.object({
  styleSummary: z.string(),
  scenes: z.array(SceneSchema).min(1),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
