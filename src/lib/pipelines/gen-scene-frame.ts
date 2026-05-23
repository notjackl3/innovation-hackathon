import { prisma } from "@/lib/db";
import { generateImages } from "@/lib/ai/image";
import { getStorage } from "@/lib/storage";
import { registerHandler } from "@/lib/jobs/runner";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  /** Scene plan artifact id. */
  scenePlanArtifactId: string;
  sceneIndex: number;
}

interface Output {
  storageKey: string;
  versionId: string;
}

registerHandler<Input, Output>("GEN_SCENE_FRAME", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("GEN_SCENE_FRAME requires SERVICE track");

  const planArtifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!planArtifact?.versions[0]?.contentJson) throw new Error("Scene plan missing");

  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(planArtifact.versions[0].contentJson));
  const scene = plan.scenes.find((s) => s.index === input.sceneIndex);
  if (!scene) throw new Error(`Scene ${input.sceneIndex} not in plan`);
  if (scene.locked && scene.frameStorageKey) {
    return { storageKey: scene.frameStorageKey, versionId: planArtifact.versions[0].id };
  }

  await ctx.setProgress(20);
  const [img] = await generateImages({
    prompt: scene.imagePrompt,
    n: 1,
    size: "1792x1024",
    seed: `${ideaRecord.id}-${scene.index}`,
  });
  await ctx.setProgress(70);

  const storage = getStorage();
  const ext = img.contentType.includes("svg") ? "svg" : "png";
  const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/frames/${input.scenePlanArtifactId}-s${scene.index}-${Date.now()}.${ext}`;
  await storage.put(key, img.bytes, img.contentType);

  // Update the scene plan with the new frame key (new version)
  const updatedPlan: ScenePlan = {
    ...plan,
    scenes: plan.scenes.map((s) =>
      s.index === input.sceneIndex ? { ...s, frameStorageKey: key } : s
    ),
  };
  const newVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: input.scenePlanArtifactId,
      parentVersionId: planArtifact.versions[0].id,
      contentJson: JSON.stringify(updatedPlan),
      meta: JSON.stringify({ updatedSceneIndex: input.sceneIndex, frameStorageKey: key }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: input.scenePlanArtifactId },
    data: { currentVersionId: newVersion.id },
  });
  await ctx.setProgress(100);
  return { storageKey: key, versionId: newVersion.id };
});
