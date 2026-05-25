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
  /** Storage key of the per-scene animated MP4 clip produced by Seedance. */
  videoStorageKey: z.string().nullable().default(null),
  /**
   * Action description fed to the image-to-video model. Describes what the
   * protagonist DOES during the clip (the "motion arc"), in addition to the
   * imagePrompt which describes the starting framing.
   */
  motionPrompt: z.string().nullable().default(null),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScenePlanSchema = z.object({
  styleSummary: z.string(),
  /**
   * Shared visual anchor prepended to every per-scene imagePrompt. Encodes
   * the persistent characters, location, lighting, palette, lens, and grade
   * so frames flow into each other instead of feeling like unrelated stills.
   */
  styleAnchor: z.string().default(""),
  scenes: z.array(SceneSchema).min(1),
});
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
