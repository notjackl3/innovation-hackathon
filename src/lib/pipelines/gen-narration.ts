import { prisma } from "@/lib/db";
import { registerHandler } from "@/lib/jobs/runner";
import { isMockMode, openai } from "@/lib/ai/openai";
import { getStorage } from "@/lib/storage";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
}

interface Output {
  scenes: { index: number; audioStorageKey: string }[];
}

registerHandler<Input, Output>("GEN_NARRATION", async (input, ctx) => {
  const { track, ideaRecord } = await getTrackContext(input.trackId);
  const artifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact?.versions[0]?.contentJson) throw new Error("Plan missing");
  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(artifact.versions[0].contentJson));
  const storage = getStorage();
  const out: Output["scenes"] = [];

  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    await ctx.setProgress(Math.round(((i + 1) / plan.scenes.length) * 90));
    const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/narration/${input.scenePlanArtifactId}-s${scene.index}-${Date.now()}.mp3`;
    let bytes: Buffer;
    if (isMockMode()) {
      bytes = Buffer.from(`MOCK_AUDIO[${scene.narration}]`, "utf8");
    } else {
      const audio = await openai().audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: scene.narration,
      });
      bytes = Buffer.from(await audio.arrayBuffer());
    }
    await storage.put(key, bytes, "audio/mpeg");
    out.push({ index: scene.index, audioStorageKey: key });
  }

  // Update plan with narration keys
  const updatedPlan: ScenePlan = {
    ...plan,
    scenes: plan.scenes.map((s) => {
      const o = out.find((x) => x.index === s.index);
      return o ? { ...s, audioStorageKey: o.audioStorageKey } : s;
    }),
  };
  const newVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: input.scenePlanArtifactId,
      parentVersionId: artifact.versions[0].id,
      contentJson: JSON.stringify(updatedPlan),
      meta: JSON.stringify({ kind: "narration-update" }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: input.scenePlanArtifactId },
    data: { currentVersionId: newVersion.id },
  });
  return { scenes: out };
});
