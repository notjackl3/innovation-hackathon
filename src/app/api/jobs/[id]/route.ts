import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = await prisma.generationJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    logs: JSON.parse(job.logs || "[]"),
    output: job.outputJson ? JSON.parse(job.outputJson) : null,
    error: job.error,
    externalRef: job.externalRef,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  });
}
