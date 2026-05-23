import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SoftwareWorkspace } from "@/components/software/software-workspace";

export const dynamic = "force-dynamic";

export default async function SoftwareTrackPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!track || track.kind !== "SOFTWARE") notFound();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href={`/ideas/${track.ideaId}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← {track.idea.title}
      </Link>
      <div className="mt-1 mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-sky-700">Software track</div>
        <h1 className="text-3xl font-semibold tracking-tight">Visualize the software</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a product spec, render screens, then click through the live demo.
        </p>
      </div>

      <SoftwareWorkspace
        trackId={track.id}
        initialArtifacts={track.artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          currentVersionId: a.currentVersionId,
          versions: a.versions.map((v) => ({
            id: v.id,
            contentJson: v.contentJson,
            createdAt: v.createdAt.toISOString(),
          })),
        }))}
      />
    </main>
  );
}
