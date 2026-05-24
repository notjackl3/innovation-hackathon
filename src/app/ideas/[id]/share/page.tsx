import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PublishDemoButton } from "@/components/ideas/publish-demo-button";

export const dynamic = "force-dynamic";

export default async function ShareStage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      tracks: {
        include: {
          artifacts: {
            include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });
  if (!idea) notFound();
  const track = idea.tracks.find((t) => t.kind === idea.primaryType);
  const shared = track
    ? await prisma.sharedDemo.findMany({ where: { trackId: track.id }, orderBy: { createdAt: "desc" } })
    : [];

  const artifacts = track?.artifacts ?? [];
  const sketches = artifacts.filter((a) => a.kind === "SKETCH" || a.kind === "EDITED_SKETCH");
  const mesh = artifacts.find((a) => a.kind === "MESH");
  const scenePlan = artifacts.find((a) => a.kind === "SCENE_PLAN");
  const video = artifacts.find((a) => a.kind === "VIDEO");
  const bundle = artifacts.find((a) => a.kind === "DEMO_BUNDLE");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h2 className="text-lg font-semibold">Share & export</h2>
          <p className="text-sm text-muted-foreground">
            Everything you&rsquo;ve generated for this idea, ready to download or send to stakeholders.
          </p>
        </CardContent>
      </Card>

      {!track && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No visualization yet.{" "}
            <Link href={`/ideas/${id}/generate`} className="text-primary underline">
              Generate it →
            </Link>
          </CardContent>
        </Card>
      )}

      {sketches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sketches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {sketches.flatMap((a) =>
                a.versions
                  .filter((v) => v.id === a.currentVersionId || a.versions.length === 1)
                  .map((v) =>
                    v.storageKey ? (
                      <a
                        key={v.id}
                        href={`/api/storage/${v.storageKey}`}
                        download
                        className="block overflow-hidden rounded-md border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/storage/${v.storageKey}`} alt={a.kind} className="aspect-square w-full object-cover" />
                      </a>
                    ) : null,
                  ),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {mesh?.versions[0]?.storageKey && (
        <Card>
          <CardHeader><CardTitle>3D model</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <Badge variant="muted">GLB binary</Badge>
            <Button asChild>
              <a href={`/api/storage/${mesh.versions[0].storageKey}`} download="model.glb">Download GLB</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {video?.versions[0]?.storageKey && (
        <Card>
          <CardHeader><CardTitle>Service video</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {video.versions[0].storageKey.endsWith(".mp4") ? (
              <video controls src={`/api/storage/${video.versions[0].storageKey}`} className="w-full rounded-md border" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Renderer not configured — preview manifest available for download.
              </p>
            )}
            <Button asChild variant="outline">
              <a href={`/api/storage/${video.versions[0].storageKey}`} download>Download</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {scenePlan && (
        <Card>
          <CardHeader><CardTitle>Storyboard plan</CardTitle></CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <a href={`/api/artifacts/${scenePlan.id}`} download>Download JSON</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {bundle && track && (
        <Card>
          <CardHeader><CardTitle>Software demo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <PublishDemoButton trackId={track.id} bundleArtifactId={bundle.id} />
            {shared.length > 0 && (
              <ul className="space-y-2 text-sm">
                {shared.map((s) => (
                  <li key={s.id} className="flex items-center justify-between rounded-md border p-2">
                    <code className="text-xs">/demo/{s.slug}</code>
                    <Button asChild size="sm" variant="ghost">
                      <a href={`/demo/${s.slug}`} target="_blank" rel="noreferrer">Open ↗</a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
