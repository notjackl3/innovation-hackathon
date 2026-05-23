import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { nanoid } from "nanoid";

const Body = z.object({ bundleArtifactId: z.string() });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const artifact = await prisma.artifact.findUnique({ where: { id: body.data.bundleArtifactId } });
  if (!artifact || artifact.trackId !== trackId)
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });

  const slug = nanoid(10).toLowerCase();
  const share = await prisma.sharedDemo.create({
    data: {
      trackId,
      slug,
      bundleId: artifact.id,
    },
  });
  return NextResponse.json({ slug: share.slug, url: `/demo/${share.slug}` });
}
