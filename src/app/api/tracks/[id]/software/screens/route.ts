import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  productSpecArtifactId: z.string(),
  onlyScreen: z.string().optional(),
  bundleArtifactId: z.string().optional(),
  editInstruction: z.string().trim().min(1).optional(),
  selectedBlockIndices: z.array(z.number().int().nonnegative()).optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const jobId = await enqueueJob({
    kind: "GEN_SCREEN_SPEC",
    input: {
      trackId,
      productSpecArtifactId: body.data.productSpecArtifactId,
      onlyScreen: body.data.onlyScreen,
      bundleArtifactId: body.data.bundleArtifactId,
      editInstruction: body.data.editInstruction,
      selectedBlockIndices: body.data.selectedBlockIndices,
    },
    trackId,
  });
  return NextResponse.json({ jobId });
}
