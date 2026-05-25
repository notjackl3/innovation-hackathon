import { prisma } from "@/lib/db";
import { registerHandler } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { generateSceneVideo, isSeedanceAvailable, SeedanceUnavailableError } from "@/lib/ai/seedance";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
  /** If true, regenerate even scenes that already have a video. */
  force?: boolean;
}

interface Output {
  rendered: number;
  skipped: number;
  failed: number;
  versionId: string;
}

/**
 * Generates a Seedance motion video for every scene that has a rendered frame
 * but no video yet. Sequential — each call is ~30-90s. Updates the scene
 * plan version after each successful clip so partial progress is visible.
 */
registerHandler<Input, Output>("GEN_ALL_VIDEOS", async (input, ctx) => {
  if (!isSeedanceAvailable()) throw new SeedanceUnavailableError();
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("GEN_ALL_VIDEOS requires SERVICE track");

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
  let failed = 0;

  for (let i = 0; i < total; i++) {
    const scene = ordered[i];

    if (!scene.frameStorageKey) {
      await ctx.log(`Scene ${scene.index} has no frame — skipping.`);
      skipped++;
      await ctx.setProgress(Math.round(((i + 1) / total) * 95));
      continue;
    }
    if (scene.videoStorageKey && !input.force) {
      await ctx.log(`Scene ${scene.index} already has a video — skipping.`);
      skipped++;
      await ctx.setProgress(Math.round(((i + 1) / total) * 95));
      continue;
    }

    try {
      const imageBytes = await storage.get(scene.frameStorageKey);
      if (imageBytes[0] === 0x3c) {
        await ctx.log(`Scene ${scene.index}: frame is SVG mock — skipping.`);
        skipped++;
        await ctx.setProgress(Math.round(((i + 1) / total) * 95));
        continue;
      }

      const motionPrompt = scene.motionPrompt?.trim() || scene.imagePrompt;
      const fullPrompt = [
        motionPrompt,
        plan.styleAnchor ? `Maintain exactly: ${plan.styleAnchor.slice(0, 400)}` : "",
        "Cinematic camera with a subtle hand-held feel. The protagonist's face, clothing, and accessories stay identical to the input image.",
      ]
        .filter(Boolean)
        .join("\n\n");

      const desired = scene.durationSec >= 8 ? 10 : 5;
      await ctx.log(`Seedance scene ${scene.index} (${scene.title}) — ~${desired}s clip`);
      const result = await generateSceneVideo(
        {
          imageBytes,
          prompt: fullPrompt,
          durationSec: desired,
          resolution: "720p",
          aspectRatio: "16:9",
        },
        async (msg) => ctx.log(`s${scene.index}: ${msg}`)
      );

      const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/scene-videos/${input.scenePlanArtifactId}-s${scene.index}-${Date.now()}.mp4`;
      await storage.put(key, result.bytes, "video/mp4");

      plan = {
        ...plan,
        scenes: plan.scenes.map((s) =>
          s.index === scene.index
            ? { ...s, videoStorageKey: key, durationSec: result.durationSec }
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
            videoStorageKey: key,
            kind: "scene-video",
          }),
          createdBy: "ai",
        },
      });
      await prisma.artifact.update({
        where: { id: input.scenePlanArtifactId },
        data: { currentVersionId: newVersion.id },
      });
      parentVersionId = newVersion.id;
      rendered++;
    } catch (err) {
      await ctx.log(`Scene ${scene.index} video failed: ${(err as Error).message}`);
      failed++;
    }
    await ctx.setProgress(Math.round(((i + 1) / total) * 95));
  }

  await ctx.setProgress(100);
  return { rendered, skipped, failed, versionId: parentVersionId };
});
