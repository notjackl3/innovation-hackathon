import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ServiceWorkspace } from "@/components/service/service-workspace";

export const dynamic = "force-dynamic";

export default async function ServiceTrackPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!track || track.kind !== "SERVICE") notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/ideas/${track.ideaId}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← {track.idea.title}
      </Link>
      <div className="mt-1 mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Service track</div>
        <h1 className="text-3xl font-semibold tracking-tight">Visualize the service</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan a 6–10 scene storyboard, generate frames per scene, then play it in-browser or render a video.
        </p>
      </div>

      <ServiceWorkspace
        trackId={track.id}
        initialArtifacts={track.artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          currentVersionId: a.currentVersionId,
          versions: a.versions.map((v) => ({
            id: v.id,
            storageKey: v.storageKey,
            contentJson: v.contentJson,
            createdAt: v.createdAt.toISOString(),
          })),
        }))}
      />
    </main>
  );
}
