import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler, enqueueJob } from "@/lib/jobs/runner";
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
    system: [
      "You design short narrative video storyboards. Think of it like a 30-second short film, not a slideshow.",
      "",
      "STORY AND CHARACTER CONTINUITY ARE THE TOP PRIORITY:",
      "- ONE primary protagonist appears in every scene. Give them a NAME (e.g. 'Maya'), an age, ethnicity, hair (colour + style), exact outfit (top + bottom + shoes + accessories), and any unique features (glasses, watch, tote bag). Be aggressively specific — this description is the only thing keeping them looking like the same person across frames.",
      "- A consistent supporting character if it makes sense — give them name + appearance + uniform.",
      "- The SAME location with the SAME lighting, lens, and colour grade throughout.",
      "- Scenes follow a clear beginning → middle → end arc. The protagonist physically progresses through the space (arrives → engages → leaves) AND emotionally progresses (curious → engaged → delighted).",
      "",
      "OUTPUT `styleAnchor` — one paragraph that locks the world. It MUST include: (1) protagonist name + complete physical description and outfit, (2) supporting character (if any), (3) location with concrete details, (4) lighting / time of day, (5) camera / lens, (6) colour grade + palette.",
      "",
      "OUTPUT each scene's `imagePrompt` — just camera framing + protagonist's action + emotion for THIS beat. Begin every imagePrompt with the protagonist's name so the model anchors on them (e.g. 'Maya leans forward at the booth, smiling…'). Do NOT restate location/lighting/style — that lives in styleAnchor.",
      "",
      "Caption ≤ 8 words. Narration = one sentence in the brand voice.",
    ].join(" "),
    user: `COMPANY: ${company.industry || "consumer brand"}. Voice: ${company.brandVoice.adjectives.join(", ") || "warm, modern"}.
Photography vibe: ${company.visualStyle.photographyVibe || "cinematic, warm, lifestyle"}.
Palette accents: ${company.visualStyle.palette.slice(0, 4).join(", ") || "warm neutrals"}.

IDEA: ${ideaRecord.title}
${ideaRecord.rawInput}
${idea ? `\nProblem: ${idea.problem}\nAudience: ${idea.audience}` : ""}

Return a ${n}-scene plan. Use scene indices 0..${n - 1}. Each scene needs: index, title, imagePrompt (just the framing + character action for THIS moment, assuming styleAnchor), caption, narration, durationSec (3-6), transition.`,
    jsonSchema: ScenePlanSchema,
    schemaName: "ScenePlan",
    mockResponse: {
      styleSummary: `${company.visualStyle.photographyVibe || "Warm, cinematic"} sequence telling the story of ${ideaRecord.title}.`,
      styleAnchor: `${brandPromptPrefix(company)} Continuity: a single warm cafe interior with wooden booth seating, soft pendant lighting, low golden-hour glow through the window. Same recurring protagonist throughout — a young adult customer with a casual jacket and warm smile. Cinematic 50mm lens look, shallow depth of field, warm grade with rich amber highlights and soft shadows.`,
      scenes: Array.from({ length: n }, (_, i) => ({
        index: i,
        title: ["Welcome", "Begin", "Engage", "Delight", "Share", "Return", "Belong", "Repeat"][i] ?? `Scene ${i + 1}`,
        imagePrompt: `Wide establishing shot of the protagonist entering the cafe (moment ${i + 1} of ${n}).`,
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

  // The LLM occasionally hallucinates frameStorageKey / audioStorageKey
  // values (it sometimes invents file paths). Force-null these so the
  // GEN_ALL_FRAMES job sees them as missing and actually renders frames.
  const scrubbedPlan: ScenePlan = {
    ...plan,
    scenes: plan.scenes.map((s) => ({ ...s, frameStorageKey: null, audioStorageKey: null })),
  };

  const artifact = await prisma.artifact.create({
    data: { trackId: track.id, kind: "SCENE_PLAN", label: "Storyboard plan" },
  });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      contentJson: JSON.stringify(scrubbedPlan),
      meta: JSON.stringify({ sceneCount: scrubbedPlan.scenes.length }),
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

  // Auto-trigger rendering all frames so the user doesn't have to click each one.
  await enqueueJob({
    kind: "GEN_ALL_FRAMES",
    input: { trackId: track.id, scenePlanArtifactId: artifact.id, force: false },
    trackId: track.id,
  });

  await ctx.setProgress(100);
  return { artifactId: artifact.id, versionId: version.id, scenePlan: scrubbedPlan };
});
