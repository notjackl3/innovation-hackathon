import { z } from "zod";

export const HeroBlock = z.object({
  type: z.literal("Hero"),
  headline: z.string(),
  sub: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaTo: z.string().optional(),
});

export const StatsBlock = z.object({
  type: z.literal("Stats"),
  items: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        delta: z.string().optional(),
      })
    )
    .max(6),
});

export const TableBlock = z.object({
  type: z.literal("Table"),
  columns: z.array(z.string()).max(6),
  rows: z.array(z.array(z.string()).max(6)).max(20),
});

export const FormBlock = z.object({
  type: z.literal("Form"),
  fields: z
    .array(
      z.object({
        label: z.string(),
        kind: z.enum(["text", "select", "textarea"]),
        options: z.array(z.string()).optional(),
      })
    )
    .max(8),
  submitLabel: z.string().default("Submit"),
  submitTo: z.string().optional(),
});

export const ChartBlock = z.object({
  type: z.literal("Chart"),
  kind: z.enum(["bar", "line"]),
  series: z
    .array(z.object({ label: z.string(), data: z.array(z.number()).max(20) }))
    .max(4),
  xLabels: z.array(z.string()).max(20),
});

export const CardBlock = z.object({
  type: z.literal("Card"),
  title: z.string(),
  body: z.string(),
  ctaLabel: z.string().optional(),
  ctaTo: z.string().optional(),
});

export const ListBlock = z.object({
  type: z.literal("List"),
  items: z
    .array(
      z.object({
        title: z.string(),
        sub: z.string().optional(),
        to: z.string().optional(),
      })
    )
    .max(12),
});

export const DetailBlock = z.object({
  type: z.literal("Detail"),
  title: z.string(),
  sections: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .max(6),
});

export const BlockSchema = z.discriminatedUnion("type", [
  HeroBlock,
  StatsBlock,
  TableBlock,
  FormBlock,
  ChartBlock,
  CardBlock,
  ListBlock,
  DetailBlock,
]);
export type Block = z.infer<typeof BlockSchema>;

export const ScreenSpecSchema = z.object({
  name: z.string().min(1),
  title: z.string(),
  navLabel: z.string(),
  blocks: z.array(BlockSchema).max(8),
});
export type ScreenSpec = z.infer<typeof ScreenSpecSchema>;

export const DemoBundleSchema = z.object({
  appName: z.string(),
  tagline: z.string(),
  screens: z.array(ScreenSpecSchema).min(1),
  startScreen: z.string(),
});
export type DemoBundle = z.infer<typeof DemoBundleSchema>;

export const ProductSpecSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  problem: z.string(),
  users: z.array(z.string()),
  features: z.array(z.string()),
  screens: z.array(z.string()), // screen names that will be generated
});
export type ProductSpec = z.infer<typeof ProductSpecSchema>;

/**
 * Filter a list of blocks, dropping any that fail validation. The renderer
 * never executes LLM JS — it only consumes validated structured data.
 */
export function safeParseBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const item of input) {
    const parsed = BlockSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
