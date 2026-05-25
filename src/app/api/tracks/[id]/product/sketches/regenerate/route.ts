import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  artifactId: z.string(),
  parentVersionId: z.string(),
  /** Base64-encoded PNG of the canvas composite (sketch + user strokes). Required. */
  editedCanvasBase64: z.string(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const sketchArtifact = await prisma.artifact.findUnique({
    where: { id: body.data.artifactId },
    include: { track: { include: { idea: true } } },
  });
  if (!sketchArtifact || sketchArtifact.trackId !== trackId || sketchArtifact.kind !== "SKETCH") {
    return NextResponse.json({ error: "Sketch artifact not found" }, { status: 404 });
  }

  // 1) Save the raw composite as a "user-annotated" sketch version so the
  //    describe+generate step has a real storage key to read from.
  const buf = Buffer.from(
    body.data.editedCanvasBase64.replace(/^data:[^,]+,/, ""),
    "base64"
  );
  const key = `companies/${sketchArtifact.track.idea.companyId}/ideas/${sketchArtifact.track.ideaId}/tracks/${trackId}/sketches/${sketchArtifact.id}-annotated-${Date.now()}.png`;
  await getStorage().put(key, buf, "image/png");
  const annotated = await prisma.artifactVersion.create({
    data: {
      artifactId: sketchArtifact.id,
      parentVersionId: body.data.parentVersionId,
      storageKey: key,
      meta: JSON.stringify({ source: "user-annotated", contentType: "image/png" }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({
    where: { id: sketchArtifact.id },
    data: { currentVersionId: annotated.id },
  });

  // 2) Enqueue the describe+generate job. It saves its own new clean version
  //    and updates currentVersionId on success.
  const jobId = await enqueueJob({
    kind: "REGEN_SKETCH",
    input: { trackId, sourceVersionId: annotated.id },
    trackId,
  });
  return NextResponse.json({ jobId });
}
