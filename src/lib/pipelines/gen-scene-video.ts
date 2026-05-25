import { prisma } from "@/lib/db";
import { registerHandler } from "@/lib/jobs/runner";
import { getStorage } from "@/lib/storage";
import { generateSceneVideo, isSeedanceAvailable, SeedanceUnavailableError } from "@/lib/ai/seedance";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
  sceneIndex: number;
}

interface Output {
  videoStorageKey: string;
  versionId: string;
  durationSec: number;
}

/**
 * Renders one motion video clip for a single scene. The starting frame is the
 * already-rendered PNG; the prompt is the scene's motionPrompt (or imagePrompt
 * if missing) so the character actually performs an action.
 */
registerHandler<Input, Output>("GEN_SCENE_VIDEO", async (input, ctx) => {
  if (!isSeedanceAvailable()) throw new SeedanceUnavailableError();
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("GEN_SCENE_VIDEO requires SERVICE track");

  const planArtifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!planArtifact?.versions[0]?.contentJson) throw new Error("Scene plan missing");

  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(planArtifact.versions[0].contentJson));
  const scene = plan.scenes.find((s) => s.index === input.sceneIndex);
  if (!scene) throw new Error(`Scene ${input.sceneIndex} not in plan`);
  if (!scene.frameStorageKey) {
    throw new Error(`Scene ${input.sceneIndex} has no rendered frame yet — render the still first.`);
  }

  const storage = getStorage();
  const imageBytes = await storage.get(scene.frameStorageKey);
  // Seedance won't animate SVG mocks. Skip them with a clear error.
  if (imageBytes[0] === 0x3c) {
    throw new Error("Scene frame is SVG (mock). Re-render the frame with real OpenAI before generating motion.");
  }

  await ctx.setProgress(10);

  // Build the motion prompt. The scene's imagePrompt already begins with the
  // protagonist's name and describes the starting framing; we layer the
  // motionPrompt on top to instruct what should change during the clip.
  const motionPrompt = scene.motionPrompt?.trim() || scene.imagePrompt;
  const fullPrompt = [
    motionPrompt,
    // Continuity hint so the protagonist's appearance persists from the still.
    plan.styleAnchor ? `Maintain exactly: ${plan.styleAnchor.slice(0, 400)}` : "",
    "Cinematic camera with a subtle hand-held feel. The protagonist's face, clothing, and accessories stay identical to the input image.",
  ]
    .filter(Boolean)
    .join("\n\n");

  await ctx.log(`Calling Seedance for scene ${scene.index}: ${scene.title}`);
  const desired = scene.durationSec >= 8 ? 10 : 5;
  const result = await generateSceneVideo(
    {
      imageBytes,
      prompt: fullPrompt,
      durationSec: desired,
      resolution: "720p",
      aspectRatio: "16:9",
    },
    async (msg) => ctx.log(msg)
  );

  await ctx.setProgress(90);

  const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/scene-videos/${input.scenePlanArtifactId}-s${scene.index}-${Date.now()}.mp4`;
  await storage.put(key, result.bytes, "video/mp4");

  // Update plan with the new videoStorageKey and create a new version
  const updatedPlan: ScenePlan = {
    ...plan,
    scenes: plan.scenes.map((s) =>
      s.index === input.sceneIndex
        ? { ...s, videoStorageKey: key, durationSec: result.durationSec }
        : s
    ),
  };
  const newVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: input.scenePlanArtifactId,
      parentVersionId: planArtifact.versions[0].id,
      contentJson: JSON.stringify(updatedPlan),
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

  await ctx.setProgress(100);
  return { videoStorageKey: key, versionId: newVersion.id, durationSec: result.durationSec };
});
