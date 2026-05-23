"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { JobProgress, useJob } from "@/components/shared/job-progress";
import { safeJson } from "@/lib/utils";
import { SketchCanvas, type SketchCanvasHandle } from "./sketch-canvas";
import { MeshViewer } from "./mesh-viewer";

interface VersionLite {
  id: string;
  storageKey: string | null;
  createdAt: string;
  meta: string;
  parentVersionId: string | null;
}

interface ArtifactLite {
  id: string;
  kind: string;
  currentVersionId: string | null;
  versions: VersionLite[];
}

export function ProductWorkspace({
  trackId,
  initialArtifacts,
}: {
  trackId: string;
  initialArtifacts: ArtifactLite[];
}) {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [sketchJobId, setSketchJobId] = useState<string | null>(null);
  const [refineJobId, setRefineJobId] = useState<string | null>(null);
  const [meshJobId, setMeshJobId] = useState<string | null>(null);
  const [meshPollJobId, setMeshPollJobId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const canvasRef = useRef<SketchCanvasHandle>(null);
  const sketchJob = useJob(sketchJobId);
  const refineJob = useJob(refineJobId);
  const meshJob = useJob(meshJobId);
  const meshPollJob = useJob(meshPollJobId);

  // Sync from server when jobs succeed
  useEffect(() => {
    if (sketchJob?.status === "SUCCEEDED" || refineJob?.status === "SUCCEEDED" || meshJob?.status === "SUCCEEDED" || meshPollJob?.status === "SUCCEEDED") {
      void refresh();
    }
  }, [sketchJob?.status, refineJob?.status, meshJob?.status, meshPollJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up the spawned poll job from the submit job's output
  useEffect(() => {
    if (meshJob?.status === "SUCCEEDED" && meshJob.output && typeof meshJob.output === "object") {
      const o = meshJob.output as { pollJobId?: string };
      if (o.pollJobId && !meshPollJobId) setMeshPollJobId(o.pollJobId);
    }
  }, [meshJob?.status, meshJob?.output, meshPollJobId]);

  async function refresh() {
    const res = await fetch(`/api/tracks/${trackId}`);
    if (!res.ok) return;
    const data = await res.json();
    setArtifacts(
      (data.artifacts as ArtifactLite[]).map((a) => ({
        id: a.id,
        kind: a.kind,
        currentVersionId: a.currentVersionId,
        versions: a.versions,
      }))
    );
    router.refresh();
  }

  const sketchArtifact = useMemo(() => artifacts.find((a) => a.kind === "SKETCH"), [artifacts]);
  const meshArtifact = useMemo(() => artifacts.find((a) => a.kind === "MESH"), [artifacts]);
  const currentSketchVersion = useMemo(() => {
    if (!sketchArtifact) return null;
    return (
      sketchArtifact.versions.find((v) => v.id === sketchArtifact.currentVersionId) ??
      sketchArtifact.versions[0]
    );
  }, [sketchArtifact]);
  const currentMeshVersion = useMemo(() => {
    if (!meshArtifact) return null;
    return (
      meshArtifact.versions.find((v) => v.id === meshArtifact.currentVersionId) ??
      meshArtifact.versions[0]
    );
  }, [meshArtifact]);

  async function generateSketches(n: number) {
    const res = await fetch(`/api/tracks/${trackId}/product/sketches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n, artifactId: sketchArtifact?.id }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setSketchJobId(jobId);
  }

  async function chooseVersion(versionId: string) {
    if (!sketchArtifact) return;
    await fetch(`/api/tracks/${trackId}/product/sketches/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: sketchArtifact.id, versionId }),
    });
    await refresh();
  }

  async function refineSketch() {
    if (!sketchArtifact || !currentSketchVersion) return;
    let editedCanvasBase64: string | undefined;
    if (canvasRef.current?.hasStrokes()) {
      editedCanvasBase64 = await canvasRef.current.exportComposite();
    }
    const res = await fetch(`/api/tracks/${trackId}/product/sketches/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactId: sketchArtifact.id,
        parentVersionId: currentSketchVersion.id,
        instruction: refineInstruction,
        editedCanvasBase64,
      }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setRefineJobId(jobId);
    setRefineInstruction("");
    canvasRef.current?.clear();
  }

  async function generateMesh() {
    if (!currentSketchVersion) return;
    const res = await fetch(`/api/tracks/${trackId}/product/mesh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceVersionId: currentSketchVersion.id }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setMeshJobId(jobId);
    setMeshPollJobId(null);
  }

  const meshUrl = currentMeshVersion?.storageKey
    ? `/api/storage/${currentMeshVersion.storageKey}`
    : null;
  const meshPending = !!meshJobId && (!currentMeshVersion?.storageKey);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Concept sketches</h2>
            <p className="text-sm text-muted-foreground">
              Generate variations, draw on top, then convert the chosen sketch to 3D.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {sketchJobId && <JobProgress job={sketchJob} className="w-44" />}
            <Button onClick={() => generateSketches(4)}>Generate 4 variations</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Edit sketch
              </h3>
              {refineJobId && <JobProgress job={refineJob} className="w-40" />}
            </div>
            {currentSketchVersion?.storageKey ? (
              <SketchCanvas
                ref={canvasRef}
                backgroundUrl={`/api/storage/${currentSketchVersion.storageKey}`}
              />
            ) : (
              <div className="grid aspect-square place-items-center rounded-md border bg-muted text-sm text-muted-foreground">
                No sketch yet — generate one above.
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder='Refine instruction, e.g. "add a leather strap and matte texture"'
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
              />
              <Button
                onClick={refineSketch}
                disabled={!currentSketchVersion || !refineInstruction.trim()}
              >
                AI refine
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Versions
              </div>
              {sketchArtifact && sketchArtifact.versions.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {sketchArtifact.versions.slice(0, 12).map((v) => {
                    const meta = safeJson<{ variationIndex?: number }>(v.meta, {});
                    const isActive = sketchArtifact.currentVersionId === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => chooseVersion(v.id)}
                        className={`relative block aspect-square overflow-hidden rounded-md border ${
                          isActive ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-ring"
                        }`}
                        title={meta.variationIndex !== undefined ? `v${meta.variationIndex}` : "version"}
                      >
                        {v.storageKey ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/storage/${v.storageKey}`}
                            alt="variation"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-xs text-muted-foreground">—</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No variations yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  3D model
                </div>
                <div className="flex items-center gap-2">
                  {meshJobId && <JobProgress job={meshJob} className="w-28" />}
                  {meshPollJobId && <JobProgress job={meshPollJob} className="w-28" />}
                </div>
              </div>
              <MeshViewer glbUrl={meshUrl} pending={meshPending} />
              <Button
                onClick={generateMesh}
                disabled={!currentSketchVersion}
                className="w-full"
                variant="outline"
              >
                {currentMeshVersion?.storageKey ? "Regenerate 3D from sketch" : "Generate 3D from sketch"}
              </Button>
              {meshArtifact && (
                <Badge variant="muted" className="text-[10px]">
                  Linked to sketch version: {meshArtifact.versions[0]?.parentVersionId?.slice(-8) ?? "—"}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
