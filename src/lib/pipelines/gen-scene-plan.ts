import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import { ScenePlanSchema, type ScenePlan } from "@/lib/schemas/scene";
import { getTrackContext, brandPromptPrefix } from "./_helpers";

interface Input {
  trackId: string;
  /** Number of scenes (default 6). */
  n?: number;
}

interface Output {
  artifactId: string;
  versionId: string;
  scenePlan: ScenePlan;
}

registerHandler<Input, Output>("GEN_SCENE_PLAN", async (input, ctx) => {
  const n = input.n ?? 6;
  const { track, ideaRecord, company, idea } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("GEN_SCENE_PLAN requires SERVICE track");

  await ctx.setProgress(20);

  const plan = await chatJson<ScenePlan>({
    system:
      "You design short video storyboards that show a service experience. Each scene is a single moment, described visually for an image model and narrated for voiceover.",
    user: `COMPANY: ${JSON.stringify(company.industry)} brand. Voice: ${company.brandVoice.adjectives.join(", ")}.\nIDEA: ${ideaRecord.title}\n${ideaRecord.rawInput}\n${idea ? `\nProblem: ${idea.problem}\nAudience: ${idea.audience}` : ""}\n\nReturn a ${n}-scene plan as JSON. Each scene needs: index, title, imagePrompt (visual only, ${company.visualStyle.photographyVibe || "cinematic"}), caption (≤8 words for on-screen text), narration (1 sentence VO), durationSec (3-6), transition (cut|fade|zoom). Use scene indices 0..${n - 1}.`,
    jsonSchema: ScenePlanSchema,
    mockResponse: {
      styleSummary: `${company.visualStyle.photographyVibe || "Warm, cinematic"} sequence telling the story of ${ideaRecord.title}.`,
      scenes: Array.from({ length: n }, (_, i) => ({
        index: i,
        title: `Scene ${i + 1}`,
        imagePrompt: `${brandPromptPrefix(company)} A cinematic still from a service experience: ${ideaRecord.title}. Moment ${i + 1} of ${n}.`,
        caption: ["Discover", "Begin", "Engage", "Delight", "Share", "Return", "Belong", "Repeat"][i] ?? `Step ${i + 1}`,
        narration: `Scene ${i + 1}: a customer experiences ${ideaRecord.title}.`,
        durationSec: 4,
        transition: i === 0 ? "cut" : "fade",
        locked: false,
        frameStorageKey: null,
        audioStorageKey: null,
      })),
    },
  });

  await ctx.setProgress(80);

  const artifact = await prisma.artifact.create({
    data: { trackId: track.id, kind: "SCENE_PLAN", label: "Storyboard plan" },
  });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      contentJson: JSON.stringify(plan),
      meta: JSON.stringify({ sceneCount: plan.scenes.length }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });
  await prisma.visualizationTrack.update({
    where: { id: track.id },
    data: { status: "READY" },
  });
  await ctx.setProgress(100);
  return { artifactId: artifact.id, versionId: version.id, scenePlan: plan };
});
