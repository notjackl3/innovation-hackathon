import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  n: z.number().int().min(1).max(8).optional(),
  artifactId: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => ({})));
  const jobId = await enqueueJob({
    kind: "GEN_SKETCHES",
    input: { trackId, n: body.success ? body.data.n : undefined, artifactId: body.success ? body.data.artifactId : undefined },
    trackId,
  });
  return NextResponse.json({ jobId });
}
