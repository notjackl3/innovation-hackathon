import { NextResponse } from "next/server";
import { z } from "zod";
import { researchCompany } from "@/lib/pipelines/research-company";

const Body = z.object({ name: z.string().min(1).max(180) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const result = await researchCompany(body.data.name);
  return NextResponse.json(result);
}
