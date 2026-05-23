import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({ scenePlanArtifactId: z.string() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const jobId = await enqueueJob({
    kind: "ASSEMBLE_VIDEO",
    input: { trackId, scenePlanArtifactId: body.data.scenePlanArtifactId },
    trackId,
  });
  return NextResponse.json({ jobId });
}
