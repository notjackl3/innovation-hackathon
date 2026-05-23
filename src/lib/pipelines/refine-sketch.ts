import { getStorage } from "@/lib/storage";
import { editImage } from "@/lib/ai/image";
import { registerHandler } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";
import { getTrackContext, brandPromptPrefix } from "./_helpers";

interface Input {
  trackId: string;
  artifactId: string;
  /** Version to start from (latest sketch). */
  parentVersionId: string;
  /** Optional user-uploaded edited canvas (already includes the strokes). Storage key. */
  editedCanvasKey?: string;
  instruction: string;
}

interface Output {
  versionId: string;
}

registerHandler<Input, Output>("REFINE_SKETCH", async (input, ctx) => {
  const { track, ideaRecord, company } = await getTrackContext(input.trackId);
  const parent = await prisma.artifactVersion.findUnique({
    where: { id: input.parentVersionId },
  });
  if (!parent?.storageKey) throw new Error("Parent sketch missing");

  const storage = getStorage();
  const sourceKey = input.editedCanvasKey ?? parent.storageKey;
  const baseBytes = await storage.get(sourceKey);

  await ctx.setProgress(20);
  const prompt = `${brandPromptPrefix(company)} Refine this concept sketch incorporating the user's annotations and the following instruction: ${input.instruction}. Keep the subject identical, just incorporate the changes.`;
  const result = await editImage({ prompt, baseImage: baseBytes });
  await ctx.setProgress(80);

  const ext = result.contentType.includes("svg") ? "svg" : "png";
  const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/sketches/${input.artifactId}-refine-${Date.now()}.${ext}`;
  const stored = await storage.put(key, result.bytes, result.contentType);
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: input.artifactId,
      parentVersionId: parent.id,
      storageKey: stored.key,
      meta: JSON.stringify({ prompt, instruction: input.instruction, contentType: result.contentType }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: input.artifactId },
    data: { currentVersionId: version.id },
  });
  return { versionId: version.id };
});
