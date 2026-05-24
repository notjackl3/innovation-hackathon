import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductWorkspace } from "@/components/product/product-workspace";
import { ServiceWorkspace } from "@/components/service/service-workspace";
import { SoftwareWorkspace } from "@/components/software/software-workspace";

export const dynamic = "force-dynamic";

export default async function GenerateStage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      tracks: {
        include: {
          artifacts: {
            include: { versions: { orderBy: { createdAt: "desc" } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
  if (!idea) notFound();
  if (!idea.primaryType) redirect(`/ideas/${id}/triage`);

  // Ensure exactly one track for the primary type exists (auto-create if missing).
  let track = idea.tracks.find((t) => t.kind === idea.primaryType);
  if (!track) {
    await prisma.visualizationTrack.create({
      data: { ideaId: id, kind: idea.primaryType, status: "PENDING" },
    });
    redirect(`/ideas/${id}/generate`); // re-render with new track
  }

  const artifactsForWorkspace = track.artifacts.map((a) => ({
    id: a.id,
    kind: a.kind,
    currentVersionId: a.currentVersionId,
    versions: a.versions.map((v) => ({
      id: v.id,
      storageKey: v.storageKey,
      contentJson: v.contentJson,
      createdAt: v.createdAt.toISOString(),
      meta: v.meta,
      parentVersionId: v.parentVersionId,
    })),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">
              {kindLabel(track.kind)} pipeline
            </div>
            <h2 className="text-lg font-semibold">{describeKind(track.kind)}</h2>
          </div>
          <Button asChild variant="outline">
            <Link href={`/ideas/${id}/share`}>Next: Share →</Link>
          </Button>
        </CardContent>
      </Card>

      {track.kind === "PRODUCT" && (
        <ProductWorkspace trackId={track.id} initialArtifacts={artifactsForWorkspace} />
      )}
      {track.kind === "SERVICE" && (
        <ServiceWorkspace trackId={track.id} initialArtifacts={artifactsForWorkspace} />
      )}
      {track.kind === "SOFTWARE" && (
        <SoftwareWorkspace trackId={track.id} initialArtifacts={artifactsForWorkspace} />
      )}
    </div>
  );
}

function kindLabel(kind: string) {
  if (kind === "PRODUCT") return "Product";
  if (kind === "SERVICE") return "Service";
  return "Software";
}

function describeKind(kind: string) {
  if (kind === "PRODUCT") return "Sketch → edit → 3D model";
  if (kind === "SERVICE") return "Storyboard → frames → animated demo";
  return "Spec → screens → click-through demo";
}
