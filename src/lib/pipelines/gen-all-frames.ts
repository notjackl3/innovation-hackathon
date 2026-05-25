import { prisma } from "@/lib/db";
import { generateImages, editImage } from "@/lib/ai/image";
import { getStorage } from "@/lib/storage";
import { registerHandler } from "@/lib/jobs/runner";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
  /** If true, regenerate even scenes that already have a frame. */
  force?: boolean;
}

interface Output {
  rendered: number;
  skipped: number;
  versionId: string;
}

/**
 * Renders every missing frame in the scene plan SEQUENTIALLY, using the
 * previously-rendered scene as a visual reference for the next. This is what
 * gives the storyboard real character continuity — the same protagonist looks
 * like the same person across scenes because every subsequent frame is
 * conditioned on the previous one via gpt-image-1's edit endpoint.
 *
 * Scene 0: fresh generation from styleAnchor + scene prompt.
 * Scenes 1..N: edit endpoint with [scene-0, previous-scene] as references and
 *              a prompt that explicitly says "same protagonist, new beat".
 *
 * Locked scenes are never overwritten. Trade-off vs parallel rendering: this
 * is N×~30s instead of ~30s total, but the visual continuity is the whole
 * point of the user-facing story.
 */
registerHandler<Input, Output>("GEN_ALL_FRAMES", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("GEN_ALL_FRAMES requires SERVICE track");

  const artifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact?.versions[0]?.contentJson) throw new Error("Scene plan missing");
  let plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(artifact.versions[0].contentJson));
  let parentVersionId = artifact.versions[0].id;

  const storage = getStorage();
  const ordered = [...plan.scenes].sort((a, b) => a.index - b.index);
  const total = ordered.length;
  let rendered = 0;
  let skipped = 0;

  // Track the very first rendered frame (anchor) and the most recent frame.
  // Both get passed as references on subsequent scenes — the anchor preserves
  // the canonical look of the protagonist, the previous frame preserves the
  // immediate continuity (pose, mood, lighting drift).
  let anchorBytes: Buffer | null = null;
  let previousBytes: Buffer | null = null;

  for (let i = 0; i < total; i++) {
    const scene = ordered[i];

    // If a frame already exists and we're not forcing, reuse it as a reference
    // for the next scene but skip rendering this one.
    if (scene.frameStorageKey && !input.force) {
      skipped++;
      try {
        const existing = await storage.get(scene.frameStorageKey);
        if (existing[0] !== 0x3c) {
          // raster, not SVG
          if (!anchorBytes) anchorBytes = existing;
          previousBytes = existing;
        }
      } catch {
        // ignore — we just won't have it as a reference
      }
      await ctx.setProgress(Math.round(((i + 1) / total) * 95));
      continue;
    }

    await ctx.log(`Rendering scene ${scene.index}: ${scene.title}`);
    try {
      const isFirst = previousBytes === null;
      let bytes: Buffer;
      let contentType = "image/png";

      if (isFirst) {
        // Scene 0 (or first unrendered scene with no prior reference): fresh generate.
        // Force a stylized animated look so downstream video models (Seedance,
        // etc.) accept the image — their real-person filters reject photoreal.
        const STYLE_DIRECTIVE =
          "Rendered as a stylized 2D animated film still — soft cel-shading, painterly textures, warm cinematic colour palette, expressive but slightly stylized features. NOT photoreal. NOT a photograph.";
        const fullPrompt = plan.styleAnchor
          ? `${plan.styleAnchor}\n\n${STYLE_DIRECTIVE}\n\nOpening scene of a short animated narrative: ${scene.imagePrompt}\n\nThe protagonist's appearance MUST match the styleAnchor.`
          : `${STYLE_DIRECTIVE}\n\n${scene.imagePrompt}`;
        const [img] = await generateImages({
          prompt: fullPrompt,
          n: 1,
          size: "landscape",
          seed: `${ideaRecord.id}-${scene.index}`,
        });
        bytes = img.bytes;
        contentType = img.contentType;
      } else {
        // Subsequent scenes: image-to-image with previous (and anchor) as references.
        const refs: Buffer[] = anchorBytes && anchorBytes !== previousBytes
          ? [anchorBytes, previousBytes!]
          : [previousBytes!];
        const fullPrompt = [
          plan.styleAnchor || "",
          "",
          "STYLE: stylized 2D animated film still — soft cel-shading, painterly textures. NOT photoreal.",
          "",
          "This is the NEXT BEAT of a continuous narrative. The reference image(s) show the same protagonist and world.",
          "Produce a NEW scene with the SAME protagonist (same face, same hair, same outfit, same accessories) and the SAME location, lighting, lens, and colour grade.",
          "Only the framing, pose, and action change.",
          "",
          `Beat: ${scene.imagePrompt}`,
        ].join("\n");
        const img = await editImage({
          prompt: fullPrompt,
          baseImage: refs,
          size: "landscape",
        });
        bytes = img.bytes;
        contentType = img.contentType;
      }

      const ext = contentType.includes("svg") ? "svg" : "png";
      const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/frames/${input.scenePlanArtifactId}-s${scene.index}-${Date.now()}.${ext}`;
      await storage.put(key, bytes, contentType);

      // Cascade-invalidate the per-scene Seedance motion clip: it was
      // animated from the OLD frame, so it's stale once the frame changes.
      plan = {
        ...plan,
        scenes: plan.scenes.map((s) =>
          s.index === scene.index
            ? { ...s, frameStorageKey: key, videoStorageKey: null }
            : s
        ),
      };
      const newVersion = await prisma.artifactVersion.create({
        data: {
          artifactId: input.scenePlanArtifactId,
          parentVersionId,
          contentJson: JSON.stringify(plan),
          meta: JSON.stringify({
            updatedSceneIndex: scene.index,
            frameStorageKey: key,
            clearedVideoStorageKey: true,
            generationMode: isFirst ? "fresh" : "edit-with-reference",
          }),
          createdBy: "ai",
        },
      });
      await prisma.artifact.update({
        where: { id: input.scenePlanArtifactId },
        data: { currentVersionId: newVersion.id },
      });
      parentVersionId = newVersion.id;

      if (!anchorBytes) anchorBytes = bytes;
      previousBytes = bytes;
      rendered++;
    } catch (err) {
      await ctx.log(`Scene ${scene.index} failed: ${(err as Error).message}`);
    }
    await ctx.setProgress(Math.round(((i + 1) / total) * 95));
  }

  await ctx.setProgress(100);
  return { rendered, skipped, versionId: parentVersionId };
});
