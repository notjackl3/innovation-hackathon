import { getStorage } from "@/lib/storage";
import { generateImages } from "@/lib/ai/image";
import { registerHandler } from "@/lib/jobs/runner";
import { brandPromptPrefix, createArtifactVersion, getTrackContext } from "./_helpers";
import { prisma } from "@/lib/db";

interface Input {
  trackId: string;
  /** Number of variations to generate. */
  n?: number;
  /** Reuse this artifact (for "regenerate variations" on the same chooser). */
  artifactId?: string;
}

interface Output {
  artifactId: string;
  versionIds: string[];
}

registerHandler<Input, Output>("GEN_SKETCHES", async (input, ctx) => {
  const n = input.n ?? 4;
  const { track, idea, company, ideaRecord } = await getTrackContext(input.trackId);
  if (track.kind !== "PRODUCT") throw new Error("GEN_SKETCHES requires PRODUCT track");

  const prompt = [
    brandPromptPrefix(company),
    `Concept design sketch for a new product idea: ${ideaRecord.title}.`,
    idea?.problem ? `It addresses: ${idea.problem}.` : "",
    idea?.audience ? `For: ${idea.audience}.` : "",
    idea?.keyFeatures?.length ? `Key features: ${idea.keyFeatures.slice(0, 4).join(", ")}.` : "",
    "Render as a clean, single-object concept sketch on a neutral background, no logos or text.",
  ]
    .filter(Boolean)
    .join(" ");

  await ctx.log(`Generating ${n} sketch variation(s).`);
  await ctx.setProgress(15);

  const images = await generateImages({ prompt, n, seed: ideaRecord.title });
  await ctx.setProgress(70);

  const storage = getStorage();

  // Single Artifact containing N versions (one per variation)
  const artifact = input.artifactId
    ? await prisma.artifact.findUnique({ where: { id: input.artifactId } })
    : await prisma.artifact.create({
        data: { trackId: track.id, kind: "SKETCH", label: "Concept sketches" },
      });
  if (!artifact) throw new Error("Artifact missing");

  const versionIds: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const ext = img.contentType.includes("svg") ? "svg" : "png";
    const key = `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/sketches/${artifact.id}-v${Date.now()}-${i}.${ext}`;
    const stored = await storage.put(key, img.bytes, img.contentType);
    const v = await prisma.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        storageKey: stored.key,
        meta: JSON.stringify({ prompt, variationIndex: i, contentType: img.contentType }),
        createdBy: "ai",
      },
    });
    versionIds.push(v.id);
  }
  // Default current = first variation
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: versionIds[0] },
  });
  await prisma.visualizationTrack.update({
    where: { id: track.id },
    data: { status: "READY" },
  });

  await ctx.setProgress(100);
  return { artifactId: artifact.id, versionIds };
});

// Re-export so other modules can call directly without going through the registry.
export {};
