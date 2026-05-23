import { prisma } from "@/lib/db";
import type { EnqueueOpts, JobContext, JobHandler, JobKind } from "./types";

const handlers = new Map<JobKind, JobHandler>();

export function registerHandler<I, O>(kind: JobKind, handler: JobHandler<I, O>) {
  handlers.set(kind, handler as unknown as JobHandler);
}

export function getHandler(kind: JobKind): JobHandler | undefined {
  return handlers.get(kind);
}

async function makeContext(jobId: string): Promise<JobContext> {
  return {
    jobId,
    log: async (msg: string) => {
      const current = await prisma.generationJob.findUnique({ where: { id: jobId } });
      const logs: string[] = current?.logs ? JSON.parse(current.logs) : [];
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { logs: JSON.stringify(logs.slice(-200)) },
      });
    },
    setProgress: async (p: number) => {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { progress: Math.max(0, Math.min(100, Math.round(p))) },
      });
    },
    setExternalRef: async (ref: string) => {
      await prisma.generationJob.update({ where: { id: jobId }, data: { externalRef: ref } });
    },
  };
}

export async function runJob(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`Job ${jobId} not found`);
  const handler = handlers.get(job.kind as JobKind);
  if (!handler) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: `No handler for ${job.kind}`, finishedAt: new Date() },
    });
    return;
  }
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  const ctx = await makeContext(jobId);
  try {
    const input = JSON.parse(job.inputJson);
    const output = await handler(input, ctx);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        progress: 100,
        outputJson: JSON.stringify(output ?? null),
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.log(`ERROR: ${message}`);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, finishedAt: new Date() },
    });
  }
}

/**
 * Enqueue a job and either run it inline (default for dev) or fire-and-forget.
 * In production this would push to Inngest; the contract is identical.
 */
export async function enqueueJob<I>(opts: EnqueueOpts<I>): Promise<string> {
  const job = await prisma.generationJob.create({
    data: {
      kind: opts.kind,
      trackId: opts.trackId ?? null,
      inputJson: JSON.stringify(opts.input ?? {}),
      status: "QUEUED",
    },
  });
  if (opts.inline) {
    await runJob(job.id);
  } else {
    // Fire and forget — runs in this Node process for dev.
    void runJob(job.id).catch(() => {});
  }
  return job.id;
}
