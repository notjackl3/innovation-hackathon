import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductWorkspace } from "@/components/product/product-workspace";

export const dynamic = "force-dynamic";

export default async function ProductTrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await prisma.visualizationTrack.findUnique({
    where: { id },
    include: {
      idea: { include: { company: true } },
      artifacts: {
        include: { versions: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!track || track.kind !== "PRODUCT") notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/ideas/${track.ideaId}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← {track.idea.title}
      </Link>
      <div className="mt-1 mb-6 flex items-end justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-700">Product track</div>
          <h1 className="text-3xl font-semibold tracking-tight">Visualize the product</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate concept sketches, refine them on the canvas, then turn the chosen sketch into a 3D model.
          </p>
        </div>
      </div>
      <ProductWorkspace
        trackId={track.id}
        initialArtifacts={track.artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          currentVersionId: a.currentVersionId,
          versions: a.versions.map((v) => ({
            id: v.id,
            storageKey: v.storageKey,
            createdAt: v.createdAt.toISOString(),
            meta: v.meta,
            parentVersionId: v.parentVersionId,
          })),
        }))}
      />
    </main>
  );
}
