import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";
import { ScenePlanSchema, type Scene } from "@/lib/schemas/scene";
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

  // Detect which scene properties changed vs the current head so we can
  // cascade-invalidate downstream artifacts: a changed imagePrompt invalidates
  // the rendered still (frame) AND the motion clip (video). A changed
  // motionPrompt only invalidates the motion clip. A caption / duration /
  // narration tweak doesn't invalidate anything — assemble picks it up live.
  const head = artifact.versions[0];
  let invalidatedFrames = 0;
  let invalidatedVideos = 0;
  let outgoingPlan = body.data.plan;
  if (head?.contentJson) {
    try {
      const prev = JSON.parse(head.contentJson) as { scenes: Scene[] };
      const prevByIndex = new Map(prev.scenes.map((s) => [s.index, s]));
      outgoingPlan = {
        ...body.data.plan,
        scenes: body.data.plan.scenes.map((s) => {
          const before = prevByIndex.get(s.index);
          if (!before) return s; // new scene, nothing to invalidate
          const imageChanged = before.imagePrompt !== s.imagePrompt;
          const motionChanged = before.motionPrompt !== s.motionPrompt;
          if (imageChanged) {
            invalidatedFrames++;
            invalidatedVideos++;
            return { ...s, frameStorageKey: null, videoStorageKey: null };
          }
          if (motionChanged) {
            invalidatedVideos++;
            return { ...s, videoStorageKey: null };
          }
          return s;
        }),
      };
    } catch {
      // ignore — fall back to using the body plan as-is
    }
  }

  const newVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: head?.id,
      contentJson: JSON.stringify(outgoingPlan),
      meta: JSON.stringify({
        kind: "user-edit",
        invalidatedFrames,
        invalidatedVideos,
      }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({ where: { id: artifact.id }, data: { currentVersionId: newVersion.id } });
  return NextResponse.json({
    versionId: newVersion.id,
    invalidatedFrames,
    invalidatedVideos,
  });
}
