import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  artifactId: z.string(),
  parentVersionId: z.string(),
  instruction: z.string().default(""),
  /** Optional: base64-encoded PNG of the edited canvas (with user strokes). */
  editedCanvasBase64: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  let editedKey: string | undefined;
  if (body.data.editedCanvasBase64) {
    const buf = Buffer.from(body.data.editedCanvasBase64.replace(/^data:[^,]+,/, ""), "base64");
    const idea = await prisma.artifact.findUnique({
      where: { id: body.data.artifactId },
      include: { track: { include: { idea: true } } },
    });
    if (!idea) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    const key = `companies/${idea.track.idea.companyId}/ideas/${idea.track.ideaId}/tracks/${trackId}/sketches/${body.data.artifactId}-edited-${Date.now()}.png`;
    await getStorage().put(key, buf, "image/png");
    editedKey = key;
  }

  const jobId = await enqueueJob({
    kind: "REFINE_SKETCH",
    input: {
      trackId,
      artifactId: body.data.artifactId,
      parentVersionId: body.data.parentVersionId,
      editedCanvasKey: editedKey,
      instruction: body.data.instruction,
    },
    trackId,
  });
  return NextResponse.json({ jobId });
}
