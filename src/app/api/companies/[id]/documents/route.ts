import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs/runner";
import "@/lib/jobs/register";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await ctx.params;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";

  let kind: string;
  let filename: string;
  let bytes: Buffer;
  let mime = "application/octet-stream";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }
    bytes = Buffer.from(await file.arrayBuffer());
    filename = file.name;
    mime = file.type || mime;
    kind = filename.toLowerCase().endsWith(".pdf") ? "pdf" : "text";
  } else {
    const json = (await req.json()) as { text?: string; filename?: string };
    if (!json.text) return NextResponse.json({ error: "No text" }, { status: 400 });
    bytes = Buffer.from(json.text, "utf8");
    filename = json.filename ?? `note-${Date.now()}.txt`;
    mime = "text/plain";
    kind = "text";
  }

  const storage = getStorage();
  const key = `companies/${companyId}/documents/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await storage.put(key, bytes, mime);

  const doc = await prisma.document.create({
    data: {
      companyId,
      kind,
      storageKey: key,
      filename,
    },
  });

  const jobId = await enqueueJob({
    kind: "EXTRACT_DOC",
    input: { documentId: doc.id, companyId },
  });

  return NextResponse.json({ documentId: doc.id, jobId });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await ctx.params;
  const docs = await prisma.document.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}
