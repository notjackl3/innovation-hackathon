import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import { CompanyBriefSchema, type CompanyBrief } from "@/lib/schemas/brief";
import { z } from "zod";

interface Input {
  documentId: string;
  companyId: string;
}

const DocSummarySchema = z.object({
  summary: z.string(),
  briefPatch: CompanyBriefSchema.partial(),
});

registerHandler<Input, unknown>("EXTRACT_DOC", async (input, ctx) => {
  await ctx.log(`Extracting document ${input.documentId}`);
  const doc = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!doc) throw new Error("Document not found");
  await ctx.setProgress(10);

  // Read the stored file
  const storage = getStorage();
  const bytes = await storage.get(doc.storageKey);
  let text = "";

  if (doc.kind === "pdf") {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(bytes);
      text = parsed.text;
    } catch (e) {
      await ctx.log(`PDF parse failed: ${(e as Error).message}; falling back to filename.`);
      text = doc.filename;
    }
  } else if (doc.kind === "text") {
    text = bytes.toString("utf8");
  } else {
    text = `(${doc.kind} document: ${doc.filename})`;
  }

  await ctx.setProgress(40);
  text = text.slice(0, 12000); // bound LLM input

  await prisma.document.update({
    where: { id: doc.id },
    data: { extractedText: text },
  });
  await ctx.setProgress(60);

  // Summarize with LLM (or mock)
  const result = await chatJson<z.infer<typeof DocSummarySchema>>({
    system:
      "You analyze a company document and return concise structured information. " +
      "Always return valid JSON matching the schema {summary: string, briefPatch: CompanyBrief partial}.",
    user: `Document filename: ${doc.filename}\n\n---\n${text}\n---\n\nReturn JSON with:\n- summary: 2-3 sentences\n- briefPatch: any of {industry, oneLiner, customers[], valueProps[], brandVoice{adjectives, doNots}, visualStyle{palette, typographyVibe, sketchStyle, photographyVibe}, constraints[]}`,
    jsonSchema: DocSummarySchema,
    mockResponse: {
      summary: `Document "${doc.filename}" describes the company's positioning, audience, and visual style.`,
      briefPatch: {
        industry: "Consumer brand",
        oneLiner: "A modern brand focused on its customers.",
        valueProps: ["Quality", "Trust", "Speed"],
        brandVoice: { adjectives: ["warm", "confident", "modern"], doNots: ["jargon", "hype"] },
        visualStyle: {
          palette: ["#0B0B0F", "#F4EFE6", "#D24B2D"],
          typographyVibe: "modern geometric sans",
          sketchStyle: "clean industrial line art with subtle shading",
          photographyVibe: "warm, golden hour, lifestyle",
        },
      },
    },
  });

  await ctx.setProgress(80);
  await prisma.document.update({
    where: { id: doc.id },
    data: { summary: result.summary },
  });

  // Merge briefPatch into company.briefJson with provenance
  const company = await prisma.company.findUnique({ where: { id: doc.companyId } });
  if (!company) throw new Error("Company not found");
  const current: CompanyBrief = CompanyBriefSchema.parse(JSON.parse(company.briefJson));
  const merged = mergeBrief(current, result.briefPatch as Partial<CompanyBrief>, doc.id);
  await prisma.company.update({
    where: { id: doc.companyId },
    data: { briefJson: JSON.stringify(merged) },
  });

  await ctx.setProgress(100);
  return { documentId: doc.id, summary: result.summary };
});

function mergeBrief(base: CompanyBrief, patch: Partial<CompanyBrief>, sourceDocId: string): CompanyBrief {
  const out: CompanyBrief = { ...base };
  const sources: Record<string, string[]> = { ...base.sources };
  const note = (field: string) => {
    sources[field] = Array.from(new Set([...(sources[field] ?? []), sourceDocId]));
  };
  if (patch.industry) { out.industry = patch.industry; note("industry"); }
  if (patch.oneLiner) { out.oneLiner = patch.oneLiner; note("oneLiner"); }
  if (patch.customers?.length) {
    out.customers = [...base.customers, ...patch.customers];
    note("customers");
  }
  if (patch.valueProps?.length) {
    out.valueProps = Array.from(new Set([...base.valueProps, ...patch.valueProps]));
    note("valueProps");
  }
  if (patch.brandVoice) {
    out.brandVoice = {
      adjectives: Array.from(
        new Set([...base.brandVoice.adjectives, ...(patch.brandVoice.adjectives ?? [])])
      ),
      doNots: Array.from(new Set([...base.brandVoice.doNots, ...(patch.brandVoice.doNots ?? [])])),
    };
    note("brandVoice");
  }
  if (patch.visualStyle) {
    out.visualStyle = {
      palette: patch.visualStyle.palette?.length
        ? patch.visualStyle.palette
        : base.visualStyle.palette,
      typographyVibe: patch.visualStyle.typographyVibe || base.visualStyle.typographyVibe,
      sketchStyle: patch.visualStyle.sketchStyle || base.visualStyle.sketchStyle,
      photographyVibe: patch.visualStyle.photographyVibe || base.visualStyle.photographyVibe,
    };
    note("visualStyle");
  }
  if (patch.constraints?.length) {
    out.constraints = Array.from(new Set([...base.constraints, ...patch.constraints]));
    note("constraints");
  }
  out.sources = sources;
  return out;
}
