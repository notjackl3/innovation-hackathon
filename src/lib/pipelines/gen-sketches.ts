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

  const corePrompt = [
    brandPromptPrefix(company),
    `Concept design sketch for a new product idea: ${ideaRecord.title}.`,
    idea?.problem ? `It addresses: ${idea.problem}.` : "",
    idea?.audience ? `For: ${idea.audience}.` : "",
    idea?.keyFeatures?.length ? `Key features: ${idea.keyFeatures.slice(0, 4).join(", ")}.` : "",
    "Render as a clean, single-object concept sketch on a neutral background, no logos or text.",
  ]
    .filter(Boolean)
    .join(" ");

  // Each variation gets a distinct DESIGN DIRECTION so the results are
  // genuinely different while staying on-brief. Modifiers are abstract on
  // purpose — they describe an aesthetic philosophy, not specific materials
  // or angles, so they translate across product categories (electronics,
  // furniture, kitchenware, apparel, tools, etc.). The model picks materials,
  // finishes, and camera angles that suit the product type.
  const variationModifiers = [
    "Design direction A — MINIMALIST & REFINED: clean uncluttered geometry, restrained monochrome or near-monochrome palette, elegant proportions, smooth surfaces, soft even lighting. Use materials and a camera angle that flatter this product category.",
    "Design direction B — BOLD & EXPRESSIVE: strong confident silhouette, exaggerated proportions, vivid contrasting color accents, prominent signature feature. Use materials and a camera angle that emphasize the form's drama.",
    "Design direction C — PREMIUM & CRAFTED: high-quality materials chosen as appropriate for this product category, refined construction details, warm neutral palette with metallic or natural accents, soft studio lighting that highlights craftsmanship.",
    "Design direction D — FUTURISTIC & INNOVATIVE: unexpected modern silhouette, cool palette with a single luminous accent color, sleek high-tech materials suited to the product, distinctive standout feature, dynamic camera angle.",
    "Design direction E — PLAYFUL & APPROACHABLE: rounded organic forms, friendly pastel palette, soft tactile finish appropriate to the product, inviting and warm presentation.",
    "Design direction F — RUGGED & UTILITARIAN: robust purposeful construction, durable materials suited to the product, industrial palette (muted neutrals with a single safety-color accent), exposed functional details, no-nonsense presentation.",
  ];

  await ctx.log(`Generating ${n} distinct sketch variation(s).`);
  await ctx.setProgress(15);

  // Make N parallel single-image calls, each with its own modifier. This is the
  // only reliable way to get visually distinct variations — passing n>1 to the
  // image API returns near-duplicate samples of the same prompt.
  const prompts = Array.from({ length: n }, (_, i) => {
    const modifier = variationModifiers[i % variationModifiers.length];
    return `${corePrompt} ${modifier}`;
  });
  const results = await Promise.all(
    prompts.map((p, i) =>
      generateImages({ prompt: p, n: 1, seed: `${ideaRecord.title}-${i}` })
    )
  );
  const images = results.flat();
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
        meta: JSON.stringify({
          prompt: prompts[i],
          variationIndex: i,
          contentType: img.contentType,
        }),
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
