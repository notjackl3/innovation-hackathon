import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { DemoBundleSchema, type ScreenSpec } from "@/lib/schemas/screen";

const Body = z.object({
  bundleArtifactId: z.string(),
  screenName: z.string(),
  /**
   * A permutation of [0, n) where n = current screen.blocks.length. Element
   * at position k is the *current* index of the block that should land at k.
   */
  order: z.array(z.number().int().nonnegative()),
});

/**
 * No-LLM endpoint: just reorders the blocks of one screen in the latest
 * DEMO_BUNDLE version and writes a new ArtifactVersion. The screens API
 * remains for AI edits / generation.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const artifact = await prisma.artifact.findUnique({
    where: { id: parsed.data.bundleArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact || artifact.trackId !== trackId) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }
  const head = artifact.versions[0];
  if (!head?.contentJson) {
    return NextResponse.json({ error: "Bundle has no content" }, { status: 400 });
  }
  const bundle = DemoBundleSchema.parse(JSON.parse(head.contentJson));
  const target: ScreenSpec | undefined = bundle.screens.find((s) => s.name === parsed.data.screenName);
  if (!target) {
    return NextResponse.json({ error: "Screen not found in bundle" }, { status: 404 });
  }
  if (parsed.data.order.length !== target.blocks.length) {
    return NextResponse.json(
      { error: `order length ${parsed.data.order.length} != block count ${target.blocks.length}` },
      { status: 400 }
    );
  }
  // Validate the order is a permutation of [0, n).
  const seen = new Set<number>();
  for (const i of parsed.data.order) {
    if (i < 0 || i >= target.blocks.length || seen.has(i)) {
      return NextResponse.json({ error: "order must be a permutation" }, { status: 400 });
    }
    seen.add(i);
  }
  const reorderedBlocks = parsed.data.order.map((i) => target.blocks[i]);
  const nextBundle = {
    ...bundle,
    screens: bundle.screens.map((s) =>
      s.name === parsed.data.screenName ? { ...s, blocks: reorderedBlocks } : s
    ),
  };
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: head.id,
      contentJson: JSON.stringify(nextBundle),
      meta: JSON.stringify({ kind: "reorder", screenName: parsed.data.screenName, order: parsed.data.order }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });
  return NextResponse.json({ versionId: version.id });
}
