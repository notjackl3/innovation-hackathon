import { prisma } from "@/lib/db";
import { registerHandler, enqueueJob } from "@/lib/jobs/runner";
import { createMeshyTask, pollMeshyTask } from "@/lib/ai/meshy";
import { getStorage } from "@/lib/storage";
import { mockSketchPng } from "@/lib/ai/mock-assets";
import { getTrackContext } from "./_helpers";

interface SubmitInput {
  trackId: string;
  /** Source sketch artifact version key (the image to convert). */
  sourceVersionId: string;
}

interface SubmitOutput {
  artifactId: string;
  versionId: string;
  pollJobId: string;
}

registerHandler<SubmitInput, SubmitOutput>("GEN_MESH_SUBMIT", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  const source = await prisma.artifactVersion.findUnique({
    where: { id: input.sourceVersionId },
  });
  if (!source?.storageKey) throw new Error("Source version missing");

  const storage = getStorage();
  // Meshy needs a public URL. For local dev we build it from request origin.
  // Since the runner is server-side, we use a public storage URL placeholder.
  const imageUrl = `${process.env.APP_BASE_URL ?? ""}${storage.url(source.storageKey)}`;

  const { taskId } = await createMeshyTask({ imageUrl });
  await ctx.setExternalRef(taskId);
  await ctx.log(`Submitted Meshy task ${taskId}`);
  await ctx.setProgress(20);

  // Create MESH artifact with a placeholder version we'll fill on poll completion.
  const artifact = await prisma.artifact.create({
    data: { trackId: track.id, kind: "MESH", label: "3D model" },
  });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: source.id,
      meta: JSON.stringify({ meshyTaskId: taskId, sourceVersionId: source.id, status: "pending" }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });

  // Enqueue the polling job
  const pollJobId = await enqueueJob({
    kind: "GEN_MESH_POLL",
    input: {
      taskId,
      artifactId: artifact.id,
      versionId: version.id,
      ideaId: ideaRecord.id,
      companyId: ideaRecord.companyId,
      trackId: track.id,
    },
    trackId: track.id,
  });

  return { artifactId: artifact.id, versionId: version.id, pollJobId };
});

interface PollInput {
  taskId: string;
  artifactId: string;
  versionId: string;
  ideaId: string;
  companyId: string;
  trackId: string;
  attempt?: number;
}

registerHandler<PollInput, unknown>("GEN_MESH_POLL", async (input, ctx) => {
  const attempt = (input.attempt ?? 0) + 1;
  const maxAttempts = 60; // ~5 minutes if 5s sleep
  await ctx.setProgress(Math.min(20 + attempt * 1.3, 95));

  const result = await pollMeshyTask(input.taskId);
  await ctx.log(`Meshy poll attempt ${attempt}: ${result.status} (${result.progress}%)`);

  if (result.status === "SUCCEEDED" && result.glbUrl) {
    let storageKey: string;
    const storage = getStorage();
    if (result.glbUrl.startsWith("/mock-assets/")) {
      // Mock: write a tiny placeholder file
      const key = `companies/${input.companyId}/ideas/${input.ideaId}/tracks/${input.trackId}/meshes/${input.artifactId}-${Date.now()}.glb`;
      await storage.put(key, mockSketchPng(`glb-${input.taskId}`), "model/gltf-binary");
      storageKey = key;
    } else {
      // Fetch GLB
      const res = await fetch(result.glbUrl);
      if (!res.ok) throw new Error(`Failed to fetch GLB: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const key = `companies/${input.companyId}/ideas/${input.ideaId}/tracks/${input.trackId}/meshes/${input.artifactId}-${Date.now()}.glb`;
      await storage.put(key, buf, "model/gltf-binary");
      storageKey = key;
    }
    await prisma.artifactVersion.update({
      where: { id: input.versionId },
      data: {
        storageKey,
        meta: JSON.stringify({
          meshyTaskId: input.taskId,
          status: "succeeded",
          thumbnailUrl: result.thumbnailUrl,
        }),
      },
    });
    return { storageKey };
  }
  if (result.status === "FAILED") {
    throw new Error(`Meshy task failed: ${result.error ?? "unknown"}`);
  }
  if (attempt >= maxAttempts) throw new Error("Meshy polling timed out");

  // Re-queue ourselves with a small delay
  await new Promise((r) => setTimeout(r, 4000));
  await enqueueJob({
    kind: "GEN_MESH_POLL",
    input: { ...input, attempt },
    trackId: input.trackId,
  });
  return { rescheduled: true };
});
