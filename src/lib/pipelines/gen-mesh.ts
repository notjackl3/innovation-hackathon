import { prisma } from "@/lib/db";
import { registerHandler, enqueueJob } from "@/lib/jobs/runner";
import { createMeshyTask, pollMeshyTask } from "@/lib/ai/meshy";
import { isMockMode } from "@/lib/ai/openai";
import { getStorage } from "@/lib/storage";
import { mockGlb } from "@/lib/ai/mock-assets";
import { getTrackContext } from "./_helpers";
import { renderAnnotatedSketch } from "./_render-annotated-sketch";

interface SubmitInput {
  trackId: string;
  /** Source sketch artifact version id (the image to convert). */
  sourceVersionId: string;
}

interface SubmitOutput {
  artifactId: string;
  versionId: string;
  pollJobId: string;
}

registerHandler<SubmitInput, SubmitOutput>("GEN_MESH_SUBMIT", async (input, ctx) => {
  const { track, ideaRecord, company } = await getTrackContext(input.trackId);
  let source = await prisma.artifactVersion.findUnique({
    where: { id: input.sourceVersionId },
  });
  if (!source?.storageKey) throw new Error("Source version missing");

  const storage = getStorage();

  // Meshy interprets bold dark sketch outlines as dark material on the 3D
  // surface (turning a white sketched headset into a black 3D headset). We
  // need to feed it a PHOTOREAL image with no sketch lines. Run the photoreal
  // edit pass whenever the source is either:
  //   - "user-annotated" (raw composite of sketch + user strokes), or
  //   - "ai-rendered-from-annotation" (match-source sketch-style integrated
  //     output from the Regenerate-sketch action — still has sketch lines).
  // Skip if the source is already photoreal-prepped (or in mock mode).
  const sourceMetaForCheck = source.meta
    ? (JSON.parse(source.meta) as { source?: string })
    : {};
  const needsPhotorealPrep =
    sourceMetaForCheck.source === "user-annotated" ||
    sourceMetaForCheck.source === "ai-rendered-from-annotation";
  if (needsPhotorealPrep && source.storageKey && !isMockMode()) {
    await ctx.log(`Source is "${sourceMetaForCheck.source}" — running photoreal edit so Meshy sees real surface shading, not sketch lines.`);
    source = await renderAnnotatedSketch({
      sourceVersionId: source.id,
      pathPrefix: `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/sketches`,
      company,
      mode: "photoreal-render",
      onProgress: (pct) => ctx.setProgress(Math.min(15, Math.floor(pct / 2))),
      onLog: (msg) => ctx.log(msg),
    });
  }

  // Meshy accepts http(s) URL OR base64 data URI. Use data URI in dev so it
  // works without APP_BASE_URL. SVGs (mock sketches) get sent as URL since
  // Meshy doesn't accept image/svg+xml as a data URI.
  const sourceKey = source.storageKey;
  if (!sourceKey) throw new Error("Source version missing after refine");
  const bytes = await storage.get(sourceKey);
  const meta = source.meta ? (JSON.parse(source.meta) as { contentType?: string }) : {};
  const mime =
    meta.contentType && !meta.contentType.includes("svg")
      ? meta.contentType
      : sourceKey.endsWith(".png")
        ? "image/png"
        : sourceKey.endsWith(".jpg") || sourceKey.endsWith(".jpeg")
          ? "image/jpeg"
          : "image/png";
  let imageUrl: string;
  if (mime === "image/svg+xml" || sourceKey.endsWith(".svg")) {
    const base = process.env.APP_BASE_URL ?? "";
    imageUrl = base ? `${base}${storage.url(sourceKey)}` : storage.url(sourceKey);
    await ctx.log(`Sketch is SVG (mock?). Meshy may reject — regenerate with real images.`);
  } else {
    imageUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  }

  const { taskId } = await createMeshyTask({ imageUrl });
  await ctx.setExternalRef(taskId);
  await ctx.log(`Submitted Meshy task ${taskId}`);
  await ctx.setProgress(20);

  // Reuse the single MESH artifact for this track if it exists, so each
  // generation adds a new version (enabling revert). Create only if missing.
  // Order desc by createdAt to match the workspace UI (which calls
  // `.find(kind === "MESH")` on artifacts already sorted desc) — otherwise
  // new versions land on a different artifact than the one the UI displays
  // and appear to "not regenerate."
  const artifact =
    (await prisma.artifact.findFirst({
      where: { trackId: track.id, kind: "MESH" },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.artifact.create({
      data: { trackId: track.id, kind: "MESH", label: "3D model" },
    }));
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

  // Enqueue a single poll job. The poll handler stays RUNNING and loops
  // internally until SUCCEEDED or FAILED — one job per mesh, not one per poll.
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
}

interface PollOutput {
  storageKey: string;
  meshyTaskId: string;
  attempts: number;
}

/**
 * Polls Meshy until the image-to-3d task finishes. Keeps the same
 * GenerationJob row RUNNING the entire time so progress is visible and
 * the final outputJson contains the storageKey. Hard timeout at ~10min.
 */
registerHandler<PollInput, PollOutput>("GEN_MESH_POLL", async (input, ctx) => {
  const SLEEP_MS = 5000;
  const MAX_ATTEMPTS = 120; // ~10 minutes

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await pollMeshyTask(input.taskId);
    const reportedProgress = result.progress ?? 0;
    // Frontend progress: 20% for submit, 20-95% during polling, 100% at finish.
    const progress = Math.min(95, 20 + Math.floor(reportedProgress * 0.75));
    await ctx.setProgress(progress);
    await ctx.log(`Poll ${attempt}: status=${result.status} progress=${reportedProgress}%`);

    if (result.status === "SUCCEEDED") {
      if (!result.glbUrl) throw new Error("Meshy succeeded but returned no glbUrl");
      const storage = getStorage();
      const key = `companies/${input.companyId}/ideas/${input.ideaId}/tracks/${input.trackId}/meshes/${input.artifactId}-${Date.now()}.glb`;
      let bodyBytes: Buffer;
      if (result.glbUrl.startsWith("/mock-assets/")) {
        bodyBytes = mockGlb();
      } else {
        const res = await fetch(result.glbUrl);
        if (!res.ok) throw new Error(`Failed to fetch GLB: ${res.status}`);
        bodyBytes = Buffer.from(await res.arrayBuffer());
      }
      await storage.put(key, bodyBytes, "model/gltf-binary");
      await prisma.artifactVersion.update({
        where: { id: input.versionId },
        data: {
          storageKey: key,
          meta: JSON.stringify({
            meshyTaskId: input.taskId,
            status: "succeeded",
            thumbnailUrl: result.thumbnailUrl,
            attempts: attempt,
          }),
        },
      });
      await ctx.setProgress(100);
      return { storageKey: key, meshyTaskId: input.taskId, attempts: attempt };
    }

    if (result.status === "FAILED") {
      throw new Error(`Meshy task failed: ${result.error ?? "unknown"}`);
    }

    // Still PENDING or IN_PROGRESS — wait and try again.
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  throw new Error(`Meshy polling timed out after ${MAX_ATTEMPTS} attempts`);
});
