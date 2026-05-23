import { prisma } from "@/lib/db";
import { registerHandler } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
}

interface Output {
  videoStorageKey: string;
  rendererUsed: "renderer" | "mock";
}

/**
 * Assemble a slideshow video. In production this POSTs to the renderer
 * service (FFmpeg). With no RENDERER_URL we write a JSON manifest as the
 * "video artifact" so the in-browser preview can still play. The MP4
 * download path is gated on the renderer being available.
 */
registerHandler<Input, Output>("ASSEMBLE_VIDEO", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  const artifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact?.versions[0]?.contentJson) throw new Error("Plan missing");
  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(artifact.versions[0].contentJson));

  const storage = getStorage();
  const outKey = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/videos/${input.scenePlanArtifactId}-${Date.now()}`;

  await ctx.setProgress(20);

  let rendererUsed: Output["rendererUsed"] = "mock";
  let key = `${outKey}.json`;
  let bytes: Buffer;
  let contentType = "application/json";

  if (process.env.RENDERER_URL) {
    await ctx.log("Calling renderer service");
    const res = await fetch(`${process.env.RENDERER_URL}/assemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenes: plan.scenes,
        outputKey: `${outKey}.mp4`,
      }),
    });
    if (!res.ok) throw new Error(`Renderer error: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf;
    contentType = "video/mp4";
    key = `${outKey}.mp4`;
    rendererUsed = "renderer";
  } else {
    await ctx.log("RENDERER_URL not set — writing JSON manifest as in-browser preview source.");
    bytes = Buffer.from(JSON.stringify({ plan, generatedAt: new Date().toISOString() }, null, 2), "utf8");
  }

  await storage.put(key, bytes, contentType);

  // Reuse the existing VIDEO artifact for this track so versions stack instead of multiplying artifacts.
  let videoArtifact = await prisma.artifact.findFirst({
    where: { trackId: track.id, kind: "VIDEO" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!videoArtifact) {
    const created = await prisma.artifact.create({
      data: {
        trackId: track.id,
        kind: "VIDEO",
        label: rendererUsed === "renderer" ? "Service demo video" : "Service preview manifest",
      },
    });
    videoArtifact = { ...created, versions: [] };
  }
  const parentVersionId = videoArtifact.versions[0]?.id;
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: videoArtifact.id,
      parentVersionId: parentVersionId ?? null,
      storageKey: key,
      meta: JSON.stringify({ rendererUsed, contentType, scenePlanArtifactId: input.scenePlanArtifactId }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: videoArtifact.id },
    data: { currentVersionId: version.id },
  });
  await ctx.setProgress(100);
  return { videoStorageKey: key, rendererUsed };
});
