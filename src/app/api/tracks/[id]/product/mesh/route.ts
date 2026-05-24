import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  sourceVersionId: z.string(),
  /** Sketch artifact id — required when uploading an edited canvas. */
  sketchArtifactId: z.string().optional(),
  /** Optional: base64-encoded PNG of the edited canvas (sketch + user strokes). */
  editedCanvasBase64: z.string().optional(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  let sourceVersionId = body.data.sourceVersionId;

  // If the user drew strokes on top of the sketch, bake them into a NEW sketch
  // version so the drawings persist as part of the history AND become the
  // image that gets sent to Meshy.
  if (body.data.editedCanvasBase64 && body.data.sketchArtifactId) {
    const sketchArtifact = await prisma.artifact.findUnique({
      where: { id: body.data.sketchArtifactId },
      include: { track: { include: { idea: true } } },
    });
    if (!sketchArtifact || sketchArtifact.trackId !== trackId) {
      return NextResponse.json({ error: "Sketch artifact not found" }, { status: 404 });
    }
    const buf = Buffer.from(
      body.data.editedCanvasBase64.replace(/^data:[^,]+,/, ""),
      "base64"
    );
    const key = `companies/${sketchArtifact.track.idea.companyId}/ideas/${sketchArtifact.track.ideaId}/tracks/${trackId}/sketches/${sketchArtifact.id}-annotated-${Date.now()}.png`;
    await getStorage().put(key, buf, "image/png");
    const newVersion = await prisma.artifactVersion.create({
      data: {
        artifactId: sketchArtifact.id,
        parentVersionId: body.data.sourceVersionId,
        storageKey: key,
        meta: JSON.stringify({ source: "user-annotated", contentType: "image/png" }),
        createdBy: "user",
      },
    });
    await prisma.artifact.update({
      where: { id: sketchArtifact.id },
      data: { currentVersionId: newVersion.id },
    });
    sourceVersionId = newVersion.id;
  }

  const jobId = await enqueueJob({
    kind: "GEN_MESH_SUBMIT",
    input: { trackId, sourceVersionId },
    trackId,
  });
  return NextResponse.json({ jobId });
}
