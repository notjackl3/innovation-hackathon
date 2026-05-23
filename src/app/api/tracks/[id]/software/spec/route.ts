import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";
import { ProductSpecSchema } from "@/lib/schemas/screen";
import "@/lib/jobs/register";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const jobId = await enqueueJob({
    kind: "GEN_PRODUCT_SPEC",
    input: { trackId },
    trackId,
  });
  return NextResponse.json({ jobId });
}

const PatchBody = z.object({
  productSpecArtifactId: z.string(),
  spec: ProductSpecSchema,
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = PatchBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const artifact = await prisma.artifact.findUnique({
    where: { id: body.data.productSpecArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact || artifact.trackId !== trackId)
    return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: artifact.versions[0]?.id,
      contentJson: JSON.stringify(body.data.spec),
      meta: JSON.stringify({ kind: "user-edit" }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({ where: { id: artifact.id }, data: { currentVersionId: version.id } });
  return NextResponse.json({ versionId: version.id });
}
