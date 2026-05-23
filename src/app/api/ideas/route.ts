import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

const Body = z.object({
  companyId: z.string().min(1),
  title: z.string().min(1).max(180),
  rawInput: z.string().min(1).max(8000),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const company = await prisma.company.findUnique({ where: { id: body.data.companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const idea = await prisma.idea.create({
    data: {
      companyId: body.data.companyId,
      title: body.data.title,
      rawInput: body.data.rawInput,
      status: "DRAFT",
    },
  });
  const jobId = await enqueueJob({
    kind: "CLASSIFY_IDEA",
    input: { ideaId: idea.id },
  });
  return NextResponse.json({ id: idea.id, jobId });
}
