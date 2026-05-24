import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import { TriageResultSchema, type TriageResult } from "@/lib/schemas/idea";
import { CompanyBriefSchema } from "@/lib/schemas/brief";

interface Input {
  ideaId: string;
}

const SOFTWARE_TERMS = [
  "app",
  "application",
  "software",
  "platform",
  "dashboard",
  "saas",
  "api",
  "sdk",
  "plugin",
  "extension",
  "chatbot",
  "bot",
  "ai",
  "ml",
  "llm",
  "algorithm",
  "agent",
  "automation",
  "analytics",
  "crm",
  "erp",
  "ios",
  "android",
  "web app",
  "mobile app",
];

const SERVICE_TERMS = [
  "service",
  "experience",
  "consult",
  "consultation",
  "consulting",
  "coaching",
  "training",
  "workshop",
  "course",
  "subscription",
  "membership",
  "club",
  "program",
  "concierge",
  "on-demand",
  "delivery",
  "pickup",
  "booking",
  "reservation",
  "appointment",
  "rental",
  "lease",
  "cafe",
  "restaurant",
  "lounge",
  "salon",
  "store",
];

const PRODUCT_TERMS = [
  "bottle",
  "mug",
  "jacket",
  "shoe",
  "sneaker",
  "bag",
  "backpack",
  "chair",
  "lamp",
  "wearable",
  "device",
  "gadget",
  "appliance",
  "sensor",
  "kit",
  "hardware",
  "tumbler",
  "fridge",
  "speaker",
  "headphone",
  "watch",
  "tool",
  "packaging",
];

function score(text: string, terms: string[]): number {
  let s = 0;
  for (const term of terms) {
    const re = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "g");
    const matches = text.match(re);
    if (matches) s += matches.length;
  }
  return s;
}

/**
 * Heuristic classifier used in MOCK mode and as a guide for the real LLM.
 * Exported for unit testing. Strategy: count keyword hits in each bucket;
 * highest wins. Ties broken in priority order SOFTWARE > SERVICE > PRODUCT
 * because the most distinctive terms (saas, api, llm) live in SOFTWARE and
 * the absence of any match defaults to PRODUCT (most ideas without explicit
 * service or software cues are tangible products).
 */
export function guessType(text: string): "PRODUCT" | "SERVICE" | "SOFTWARE" {
  const t = text.toLowerCase();
  const software = score(t, SOFTWARE_TERMS);
  const service = score(t, SERVICE_TERMS);
  const product = score(t, PRODUCT_TERMS);
  // If nothing matched at all, default to PRODUCT.
  if (software === 0 && service === 0 && product === 0) return "PRODUCT";
  const max = Math.max(software, service, product);
  if (software === max) return "SOFTWARE";
  if (service === max) return "SERVICE";
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
