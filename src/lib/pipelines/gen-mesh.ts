import { prisma } from "@/lib/db";
import { registerHandler, enqueueJob } from "@/lib/jobs/runner";
import { createMeshyTask, pollMeshyTask } from "@/lib/ai/meshy";
import { generateImages } from "@/lib/ai/image";
import { openai, isMockMode } from "@/lib/ai/openai";
import { getStorage } from "@/lib/storage";
import { mockGlb } from "@/lib/ai/mock-assets";
import { getTrackContext, brandPromptPrefix } from "./_helpers";

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

  // If the source is a user-annotated composite (raw strokes drawn on top of
  // a sketch), Meshy treats the thin lines as 2D noise and ignores them. We
  // need a CLEAN, fully-rendered image where the user's edit reads as actual
  // geometry — otherwise the crown/horns/etc. simply don't appear in the GLB.
  //
  // Approach: describe-then-generate.
  //   1) Send the composite to GPT-4o vision and ask it to describe the
  //      product AND the user's annotation in detail (what it is, where it
  //      attaches, what material it should be).
  //   2) Feed that description into gpt-image-1 IMAGE GENERATE (not edit) to
  //      produce a fresh photoreal-style product render where the addition
  //      is a real 3D-looking part of the object.
  //   3) Save as a new sketch version and use that as the Meshy source.
  //
  // We use generate (not edit) because edit preserves the input too aggressively
  // and often erases rough strokes rather than interpreting them as features.
  const sourceMetaForCheck = source.meta
    ? (JSON.parse(source.meta) as { source?: string })
    : {};
  if (sourceMetaForCheck.source === "user-annotated" && source.storageKey && !isMockMode()) {
    await ctx.log("Source is user-annotated — running describe+generate so Meshy can read the addition as real geometry.");
    await ctx.setProgress(5);

    const inBytes = await storage.get(source.storageKey);
    const dataUrl = `data:image/png;base64,${inBytes.toString("base64")}`;

    // Step 1: vision-describe the composite
    const visionResponse = await openai().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a product designer. The user provides a product concept image with rough hand-drawn annotations on top (lines, shapes, marks in a contrasting color). Your job is to write a single tight image-generation prompt for a NEW image that depicts the SAME product with the user's annotation rendered as a real, three-dimensional part of the object (proper materials, shading, attachment, perspective). Describe: the product (form, color, material, key features); the annotation (what it appears to depict, where it attaches, suggested material and proportions to make it look natural); pose/angle/background to match the original. Output only the prompt — no preamble.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Write the image-generation prompt for this annotated concept.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.4,
    });
    const description =
      visionResponse.choices[0]?.message?.content?.trim() ??
      "A clean product render incorporating the user's annotation.";
    await ctx.log(`Vision prompt: ${description.slice(0, 200)}${description.length > 200 ? "…" : ""}`);
    await ctx.setProgress(12);

    // Step 2: generate a fresh image from the description
    const generatePrompt = `${brandPromptPrefix(company)} ${description} Render as a clean single-object product concept on a neutral background, no logos or text, no sketch lines or annotations, photoreal-style shading, centered three-quarter view.`;
    const [generated] = await generateImages({
      prompt: generatePrompt,
      n: 1,
      seed: `${source.id}-rendered`,
    });
    if (!generated) throw new Error("Image generation returned no result");

    const renderedExt = generated.contentType.includes("svg") ? "svg" : "png";
    const renderedKey = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/sketches/${source.artifactId}-rendered-${Date.now()}.${renderedExt}`;
    await storage.put(renderedKey, generated.bytes, generated.contentType);
    const renderedVersion = await prisma.artifactVersion.create({
      data: {
        artifactId: source.artifactId,
        parentVersionId: source.id,
        storageKey: renderedKey,
        meta: JSON.stringify({
          source: "ai-rendered-from-annotation",
          contentType: generated.contentType,
          generatePrompt,
          visionDescription: description,
        }),
        createdBy: "ai",
      },
    });
    await prisma.artifact.update({
      where: { id: source.artifactId },
      data: { currentVersionId: renderedVersion.id },
    });
    source = renderedVersion;
    await ctx.log(`Rendered sketch saved as version ${renderedVersion.id}.`);
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
