import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { IdeaTypeSchema } from "@/lib/schemas/idea";

const Body = z.object({ kind: IdeaTypeSchema });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  const track = await prisma.visualizationTrack.upsert({
    where: { ideaId_kind: { ideaId: id, kind: body.data.kind } },
    update: {},
    create: { ideaId: id, kind: body.data.kind, status: "PENDING" },
  });
  return NextResponse.json({ id: track.id });
}
