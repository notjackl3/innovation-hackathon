import { z } from "zod";

export const CompanyBriefSchema = z.object({
  industry: z.string().default(""),
  oneLiner: z.string().default(""),
  customers: z
    .array(z.object({ segment: z.string(), needs: z.array(z.string()).default([]) }))
    .default([]),
  valueProps: z.array(z.string()).default([]),
  brandVoice: z
    .object({
      adjectives: z.array(z.string()).default([]),
      doNots: z.array(z.string()).default([]),
    })
    .default({ adjectives: [], doNots: [] }),
  visualStyle: z
    .object({
      palette: z.array(z.string()).default([]),
      typographyVibe: z.string().default(""),
      sketchStyle: z.string().default(""),
      photographyVibe: z.string().default(""),
    })
    .default({ palette: [], typographyVibe: "", sketchStyle: "", photographyVibe: "" }),
  constraints: z.array(z.string()).default([]),
  sources: z.record(z.array(z.string())).default({}),
});

export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

export const EMPTY_BRIEF: CompanyBrief = CompanyBriefSchema.parse({});
