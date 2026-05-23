import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const track = await prisma.visualizationTrack.findUnique({
    where: { id },
    include: {
      idea: { include: { company: true } },
      artifacts: {
        include: {
          versions: { orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      },
      jobs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(track);
}
