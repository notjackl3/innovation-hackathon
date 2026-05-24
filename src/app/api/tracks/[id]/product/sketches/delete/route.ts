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
  if (!artifact || artifact.trackId !== trackId || artifact.kind !== "SKETCH") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const version = artifact.versions.find((v) => v.id === body.data.versionId);
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  // Pick next-newest as new current if we're deleting the current one.
  let nextCurrentId: string | null = artifact.currentVersionId;
  if (artifact.currentVersionId === version.id) {
    const fallback = artifact.versions.find((v) => v.id !== version.id);
    nextCurrentId = fallback?.id ?? null;
  }

  if (artifact.currentVersionId === version.id) {
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { currentVersionId: null },
    });
  }

  // Detach any child versions (mesh versions or refined sketches) so the FK
  // doesn't block the delete. Their parentVersionId becomes null — they
  // remain valid as standalone history entries.
  await prisma.artifactVersion.updateMany({
    where: { parentVersionId: version.id },
    data: { parentVersionId: null },
  });

  await prisma.artifactVersion.delete({ where: { id: version.id } });

  if (nextCurrentId !== artifact.currentVersionId) {
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { currentVersionId: nextCurrentId },
    });
  }

  if (version.storageKey) {
    try {
      await getStorage().delete(version.storageKey);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, newCurrentVersionId: nextCurrentId });
}
