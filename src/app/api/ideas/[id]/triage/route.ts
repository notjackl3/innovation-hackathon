import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const jobId = await enqueueJob({ kind: "CLASSIFY_IDEA", input: { ideaId: id } });
  return NextResponse.json({ jobId });
}
