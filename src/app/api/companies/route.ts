import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CompanyBriefSchema, EMPTY_BRIEF } from "@/lib/schemas/brief";

const CreateBody = z.object({
  name: z.string().min(1).max(180),
  rawProfile: z.string().default(""),
  brief: CompanyBriefSchema.optional(),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const brief = parsed.data.brief
    ? CompanyBriefSchema.parse(parsed.data.brief)
    : {
        ...EMPTY_BRIEF,
        oneLiner: parsed.data.rawProfile.split("\n")[0]?.slice(0, 120) ?? "",
      };
  const company = await prisma.company.create({
    data: {
      name: parsed.data.name,
      rawProfile: parsed.data.rawProfile,
      briefJson: JSON.stringify(brief),
    },
  });
  return NextResponse.json({ id: company.id });
}
