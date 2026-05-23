import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      company: true,
      tracks: {
        include: {
          artifacts: {
            include: { versions: { orderBy: { createdAt: "desc" }, take: 5 } },
          },
        },
      },
    },
  });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(idea);
}
