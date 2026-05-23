import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({ scenePlanArtifactId: z.string() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; index: string }> }
) {
  const { id: trackId, index } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const sceneIndex = parseInt(index, 10);
  if (Number.isNaN(sceneIndex)) return NextResponse.json({ error: "Bad index" }, { status: 400 });
  const jobId = await enqueueJob({
    kind: "GEN_SCENE_FRAME",
    input: { trackId, scenePlanArtifactId: body.data.scenePlanArtifactId, sceneIndex },
    trackId,
  });
  return NextResponse.json({ jobId });
}
