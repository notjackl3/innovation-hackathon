import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

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
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const artifact = await prisma.artifact.findUnique({
    where: { id: body.data.artifactId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
  if (!artifact || artifact.trackId !== trackId || artifact.kind !== "MESH") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const version = artifact.versions.find((v) => v.id === body.data.versionId);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // If the version being deleted is the current one, pick the next-newest
  // remaining version as the new current (or null if none remain).
  let nextCurrentId: string | null = artifact.currentVersionId;
  if (artifact.currentVersionId === version.id) {
    const fallback = artifact.versions.find((v) => v.id !== version.id);
    nextCurrentId = fallback?.id ?? null;
  }

  // Clear currentVersionId first to avoid FK constraint if it points at this version.
  if (artifact.currentVersionId === version.id) {
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { currentVersionId: null },
    });
  }

  await prisma.artifactVersion.delete({ where: { id: version.id } });

  if (nextCurrentId !== artifact.currentVersionId) {
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { currentVersionId: nextCurrentId },
    });
  }

  // Best-effort delete of the GLB file from storage. Don't fail the request
  // if storage cleanup fails — the DB row is already gone.
  if (version.storageKey) {
    try {
      await getStorage().delete(version.storageKey);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, newCurrentVersionId: nextCurrentId });
}
