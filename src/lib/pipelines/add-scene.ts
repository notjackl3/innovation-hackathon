import { prisma } from "@/lib/db";
import { z } from "zod";
import { chatJson } from "@/lib/ai/text";
import { registerHandler, enqueueJob } from "@/lib/jobs/runner";
import { ScenePlanSchema, type ScenePlan, type Scene } from "@/lib/schemas/scene";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
  scenePlanArtifactId: string;
  /** Optional user hint for what the new scene should cover. */
  hint?: string;
  /** Where to insert the new scene. Default: at the end. */
  position?: number;
}

interface Output {
  artifactId: string;
  versionId: string;
  newSceneIndex: number;
  newSceneFrameJobId: string;
}

const NewSceneSchema = z.object({
  title: z.string(),
  imagePrompt: z.string(),
  caption: z.string(),
  narration: z.string(),
  durationSec: z.number().min(1).max(15),
});

/**
 * Inserts a new scene into the existing plan, asking the LLM to write it so
 * it continues the established narrative arc and shares the same characters
 * and visual world. Auto-renders the new frame.
 */
registerHandler<Input, Output>("ADD_SCENE", async (input, ctx) => {
  const { track } = await getTrackContext(input.trackId);
  if (track.kind !== "SERVICE") throw new Error("ADD_SCENE requires SERVICE track");

  const artifact = await prisma.artifact.findUnique({
    where: { id: input.scenePlanArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!artifact?.versions[0]?.contentJson) throw new Error("Scene plan missing");
  const plan: ScenePlan = ScenePlanSchema.parse(JSON.parse(artifact.versions[0].contentJson));
  await ctx.setProgress(20);

  // Insert position (default: append)
  const insertAt = typeof input.position === "number"
    ? Math.max(0, Math.min(plan.scenes.length, input.position))
    : plan.scenes.length;

  const orderedExisting = [...plan.scenes].sort((a, b) => a.index - b.index);
  const beforeSummary = orderedExisting
    .slice(0, insertAt)
    .map((s, i) => `  ${i}. ${s.title} — ${s.caption}`)
    .join("\n") || "  (none)";
  const afterSummary = orderedExisting
    .slice(insertAt)
    .map((s, i) => `  ${insertAt + i + 1}. ${s.title} — ${s.caption}`)
    .join("\n") || "  (none)";

  const newScene = await chatJson<z.infer<typeof NewSceneSchema>>({
    system: [
      "You add a single new scene to an existing storyboard.",
      "The new scene must continue the established narrative arc seamlessly and reuse the SAME visual world (same characters, same location, same lighting, same lens, same grade).",
      "Write the imagePrompt as just the framing + character action for THIS moment — do NOT restate the setting, lighting, or style; those live in the shared styleAnchor.",
    ].join(" "),
    user: `STYLE ANCHOR (assumed by every frame):
${plan.styleAnchor || "(none — match the existing scenes' visual style)"}

EXISTING SCENES BEFORE INSERT POINT:
${beforeSummary}

EXISTING SCENES AFTER INSERT POINT:
${afterSummary}

${input.hint ? `User hint: ${input.hint}` : ""}

Write a single new scene that fits naturally at position ${insertAt + 1}. Return JSON with title, imagePrompt, caption (≤8 words), narration (1 sentence), durationSec (3-6).`,
    jsonSchema: NewSceneSchema,
    schemaName: "NewScene",
    temperature: 0.6,
    mockResponse: {
      title: `New scene ${insertAt + 1}`,
      imagePrompt: `Medium shot of the protagonist mid-scene at insert position ${insertAt + 1}.`,
      caption: "A new moment.",
      narration: `An added scene at position ${insertAt + 1}.`,
      durationSec: 4,
    },
  });

  await ctx.setProgress(60);

  const newSceneObj: Scene = {
    index: insertAt,
    title: newScene.title,
    imagePrompt: newScene.imagePrompt,
    caption: newScene.caption,
    narration: newScene.narration,
    durationSec: newScene.durationSec,
    transition: "fade",
    locked: false,
    frameStorageKey: null,
    audioStorageKey: null,
    videoStorageKey: null,
    motionPrompt: null,
  };

  const reindexed: Scene[] = [
    ...orderedExisting.slice(0, insertAt),
    newSceneObj,
    ...orderedExisting.slice(insertAt),
  ].map((s, i) => ({ ...s, index: i }));

  const nextPlan: ScenePlan = { ...plan, scenes: reindexed };

  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: artifact.versions[0].id,
      contentJson: JSON.stringify(nextPlan),
      meta: JSON.stringify({ kind: "added-scene", insertAt, title: newSceneObj.title }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });

  // Auto-render only the newly inserted frame to keep latency low.
  const newSceneFrameJobId = await enqueueJob({
    kind: "GEN_SCENE_FRAME",
    input: { trackId: track.id, scenePlanArtifactId: artifact.id, sceneIndex: insertAt },
    trackId: track.id,
  });

  await ctx.setProgress(100);
  return {
    artifactId: artifact.id,
    versionId: version.id,
    newSceneIndex: insertAt,
    newSceneFrameJobId,
  };
});
