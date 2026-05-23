import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CompanyBriefSchema } from "@/lib/schemas/brief";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  rawProfile: z.string().optional(),
  brief: CompanyBriefSchema.partial().optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: { documents: true, _count: { select: { ideas: true } } },
  });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(company);
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const json = await req.json();
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data: { name?: string; rawProfile?: string; briefJson?: string } = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.rawProfile !== undefined) data.rawProfile = parsed.data.rawProfile;
  if (parsed.data.brief) {
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = CompanyBriefSchema.parse(JSON.parse(existing.briefJson));
    const merged = CompanyBriefSchema.parse({ ...current, ...parsed.data.brief });
    data.briefJson = JSON.stringify(merged);
  }
  const updated = await prisma.company.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id });
}
