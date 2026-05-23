import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";
import { ScenePlanSchema } from "@/lib/schemas/scene";
import "@/lib/jobs/register";

const Body = z.object({ n: z.number().int().min(1).max(12).optional() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  const jobId = await enqueueJob({
    kind: "GEN_SCENE_PLAN",
    input: { trackId, n: body.success ? body.data.n : undefined },
    trackId,
  });
  return NextResponse.json({ jobId });
}

const PatchBody = z.object({
  scenePlanArtifactId: z.string(),
  plan: ScenePlanSchema,
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = PatchBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const artifact = await prisma.artifact.findUnique({
    where: { id: body.data.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact || artifact.trackId !== trackId)
    return NextResponse.json({ error: "Plan not found on this track" }, { status: 404 });
  const newVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: artifact.versions[0]?.id,
      contentJson: JSON.stringify(body.data.plan),
      meta: JSON.stringify({ kind: "user-edit" }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({ where: { id: artifact.id }, data: { currentVersionId: newVersion.id } });
  return NextResponse.json({ versionId: newVersion.id });
}
