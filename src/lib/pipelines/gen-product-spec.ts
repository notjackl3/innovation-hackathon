import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import { ProductSpecSchema, type ProductSpec } from "@/lib/schemas/screen";
import { getTrackContext } from "./_helpers";

interface Input {
  trackId: string;
}

interface Output {
  artifactId: string;
  versionId: string;
  spec: ProductSpec;
}

registerHandler<Input, Output>("GEN_PRODUCT_SPEC", async (input, ctx) => {
  const { track, ideaRecord, idea, company } = await getTrackContext(input.trackId);
  if (track.kind !== "SOFTWARE") throw new Error("GEN_PRODUCT_SPEC requires SOFTWARE track");

  await ctx.setProgress(20);

  const spec = await chatJson<ProductSpec>({
    system:
      "You are a product manager. Given an idea, output a concise software product spec as strict JSON with name, tagline, problem, users[], features[], and screens[] (a list of unique short PascalCase screen names that we will design).",
    user: `COMPANY: ${company.industry}\nIDEA: ${ideaRecord.title}\n${ideaRecord.rawInput}\n${idea ? `Problem: ${idea.problem}\nAudience: ${idea.audience}` : ""}\n\nReturn JSON {name, tagline, problem, users, features, screens}. Include 4-6 screens covering the main user flow.`,
    jsonSchema: ProductSpecSchema,
    mockResponse: {
      name: ideaRecord.title,
      tagline: `Software for ${idea?.audience ?? "your customers"}.`,
      problem: idea?.problem ?? "Users struggle to accomplish a key task efficiently.",
      users: [idea?.audience ?? "Primary user"],
      features: idea?.keyFeatures?.length
        ? idea.keyFeatures
        : ["Core dashboard", "Quick actions", "Collaboration", "Reporting"],
      screens: ["Dashboard", "Detail", "Create", "Settings"],
    },
  });

  await ctx.setProgress(80);

  const artifact = await prisma.artifact.create({
    data: { trackId: track.id, kind: "PRODUCT_SPEC", label: "Product spec" },
  });
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      contentJson: JSON.stringify(spec),
      meta: JSON.stringify({ screenCount: spec.screens.length }),
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
  return { artifactId: artifact.id, versionId: version.id, spec };
});
