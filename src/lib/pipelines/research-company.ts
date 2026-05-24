import { chatJson } from "@/lib/ai/text";
import {
  WireResearchResultSchema,
  wireToResearchResult,
  type ResearchResult,
  type WireResearchResult,
} from "@/lib/schemas/research";

const EMPTY_WIRE_BRIEF = {
  industry: "",
  oneLiner: "",
  customers: [] as { segment: string; needs: string[] }[],
  valueProps: [] as string[],
  brandVoiceAdjectives: [] as string[],
  brandVoiceDoNots: [] as string[],
  palette: [] as string[],
  typographyVibe: "",
  sketchStyle: "",
  photographyVibe: "",
  constraints: [] as string[],
};

/**
 * Looks up a company by name and returns up to 3 candidate matches, each with
 * a populated brief. Uses GPT's training-data knowledge of public companies;
 * this is not live web search. Falls back gracefully when nothing is known.
 */
export async function researchCompany(query: string): Promise<ResearchResult> {
  const trimmed = query.trim();

  const fallback: WireResearchResult = {
    query: trimmed,
    notes: "No model match — manual entry recommended.",
    candidates: [
      {
        name: trimmed,
        knownAs: [],
        confidence: "low",
        summary: `No verified match found for "${trimmed}". Continue with this name to fill the brief manually.`,
        brief: { ...EMPTY_WIRE_BRIEF },
      },
    ],
  };

  try {
    const wire = await chatJson<WireResearchResult>({
      system: `You are a research agent that identifies real, well-known companies and returns a structured brief.
Given a company name, return up to 3 candidate matches you are confident exist (rank by confidence).
If the query is ambiguous, include the most plausible candidates.
If you cannot identify any real company with reasonable confidence, return ONE candidate that mirrors the query name, confidence "low", and leave all brief fields blank — never invent facts about a company you do not recognise.
Fill the brief from your own training-data knowledge of the brand. Use 3-5 plausible hex codes for palette. Keep summaries factual and short (2-3 sentences).`,
      user: `Research the company: "${trimmed}"

For each candidate, populate every required field. If you genuinely don't know a field, use an empty string or empty array.`,
      jsonSchema: WireResearchResultSchema,
      schemaName: "CompanyResearchResult",
      model: "gpt-4o-mini",
      temperature: 0.2,
      mockResponse: {
        query: trimmed,
        notes: "MOCK_AI mode — generic placeholder candidate.",
        candidates: [
          {
            name: trimmed,
            knownAs: [],
            confidence: "medium",
            summary: `Mock research result for "${trimmed}".`,
            brief: {
              industry: "Consumer brand",
              oneLiner: `${trimmed} — a recognisable consumer brand.`,
              customers: [{ segment: "Everyday customers", needs: ["Quality", "Convenience"] }],
              valueProps: ["Trust", "Familiarity", "Reach"],
              brandVoiceAdjectives: ["warm", "approachable", "modern"],
              brandVoiceDoNots: ["jargon"],
              palette: ["#D24B2D", "#F4EFE6", "#0B0B0F"],
              typographyVibe: "modern geometric sans",
              sketchStyle: "clean industrial line art",
              photographyVibe: "warm, golden hour, lifestyle",
              constraints: [],
            },
          },
        ],
      },
    });
    return wireToResearchResult(wire);
  } catch (err) {
    return wireToResearchResult({
      ...fallback,
      notes: `Research failed: ${(err as Error).message}. Falling back to manual entry.`,
    });
  }
}
