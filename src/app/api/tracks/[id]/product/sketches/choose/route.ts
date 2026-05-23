import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  artifactId: z.string(),
  versionId: z.string(),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const artifact = await prisma.artifact.findUnique({ where: { id: body.data.artifactId } });
  if (!artifact || artifact.trackId !== trackId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: body.data.versionId },
  });
  return NextResponse.json({ ok: true });
}
