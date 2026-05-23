import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import { TriageResultSchema, type TriageResult } from "@/lib/schemas/idea";
import { CompanyBriefSchema } from "@/lib/schemas/brief";

interface Input {
  ideaId: string;
}

function guessType(text: string): "PRODUCT" | "SERVICE" | "SOFTWARE" {
  const t = text.toLowerCase();
  if (/\bapp|software|platform|dashboard|saas|api|ai\b/.test(t)) return "SOFTWARE";
  if (/\bservice|experience|consult|subscription|cafe|store|membership\b/.test(t)) return "SERVICE";
  return "PRODUCT";
}

registerHandler<Input, TriageResult>("CLASSIFY_IDEA", async (input, ctx) => {
  const idea = await prisma.idea.findUnique({
    where: { id: input.ideaId },
    include: { company: true },
  });
  if (!idea) throw new Error("Idea not found");
  await ctx.setProgress(15);

  const brief = CompanyBriefSchema.parse(JSON.parse(idea.company.briefJson));
  const ideaText = `Title: ${idea.title}\n\n${idea.rawInput}`;
  const guess = guessType(ideaText);

  const result = await chatJson<TriageResult>({
    system:
      "You are an innovation triage agent. Given a company brief and a raw idea, classify, summarize, and score it. " +
      "Return strict JSON. Each score is 0-10 with a one-sentence rationale.",
    user: `COMPANY BRIEF:\n${JSON.stringify(brief, null, 2)}\n\nRAW IDEA:\n${ideaText}\n\nReturn JSON with primaryType (PRODUCT|SERVICE|SOFTWARE), alsoConsider[], brief{problem, audience, keyFeatures[], successMetric, risks[]}, scores{marketFit, feasibility, novelty, brandAlignment, recommendation}.`,
    jsonSchema: TriageResultSchema,
    temperature: 0.4,
    mockResponse: {
      primaryType: guess,
      alsoConsider: guess === "PRODUCT" ? ["SERVICE"] : guess === "SERVICE" ? ["SOFTWARE"] : ["PRODUCT"],
      brief: {
        problem: `Today, ${brief.customers[0]?.segment ?? "users"} struggle to access this idea.`,
        audience: brief.customers[0]?.segment ?? "Primary customer",
        keyFeatures: [
          "Core value proposition",
          "Differentiated experience",
          "Lightweight onboarding",
        ],
        successMetric: "Weekly active customers within 60 days of launch",
        risks: ["Adoption uncertainty", "Operational complexity"],
      },
      scores: {
        marketFit: { score: 7, rationale: "Aligned with stated customer segments." },
        feasibility: { score: 6, rationale: "Achievable with current capabilities, some build required." },
        novelty: { score: 6, rationale: "Adjacent to existing solutions with a new twist." },
        brandAlignment: { score: 8, rationale: "Reinforces the brand voice and value props." },
        recommendation: "Prototype and validate with 10 target customers within 2 weeks.",
      },
    },
  });

  await ctx.setProgress(80);

  await prisma.idea.update({
    where: { id: idea.id },
    data: {
      primaryType: result.primaryType,
      briefJson: JSON.stringify(result.brief),
      scoresJson: JSON.stringify({ ...result.scores, alsoConsider: result.alsoConsider }),
      status: "TRIAGED",
    },
  });

  // Auto-create the primary track if not present
  await prisma.visualizationTrack.upsert({
    where: { ideaId_kind: { ideaId: idea.id, kind: result.primaryType } },
    update: {},
    create: { ideaId: idea.id, kind: result.primaryType, status: "PENDING" },
  });

  await ctx.setProgress(100);
  return result;
});
