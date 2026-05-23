import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { EMPTY_BRIEF } from "@/lib/schemas/brief";

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  rawProfile: z.string().default(""),
});

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const company = await prisma.company.create({
    data: {
      name: parsed.data.name,
      rawProfile: parsed.data.rawProfile,
      briefJson: JSON.stringify({
        ...EMPTY_BRIEF,
        oneLiner: parsed.data.rawProfile.split("\n")[0]?.slice(0, 120) ?? "",
      }),
    },
  });
  return NextResponse.json({ id: company.id });
}
