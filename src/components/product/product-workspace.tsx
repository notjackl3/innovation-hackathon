"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useJob } from "@/components/shared/job-progress";
import { PipelineStepper, StepHeader, StepNav } from "@/components/shared/pipeline-stepper";
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
  const [regenJobId, setRegenJobId] = useState<string | null>(null);
  const [meshJobId, setMeshJobId] = useState<string | null>(null);
  const [meshPollJobId, setMeshPollJobId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  // When set, the main MeshViewer shows this version's GLB instead of the
  // current one — without committing the choice. Lets the user "try on" a
  // previous version before deciding to revert.
  const [previewMeshVersionId, setPreviewMeshVersionId] = useState<string | null>(null);
  const canvasRef = useRef<SketchCanvasHandle>(null);
  const sketchJob = useJob(sketchJobId);
  const refineJob = useJob(refineJobId);
  const regenJob = useJob(regenJobId);
  const meshJob = useJob(meshJobId);
  const meshPollJob = useJob(meshPollJobId);

  // Sync from server when jobs succeed
  useEffect(() => {
    if (sketchJob?.status === "SUCCEEDED" || refineJob?.status === "SUCCEEDED" || regenJob?.status === "SUCCEEDED" || meshJob?.status === "SUCCEEDED" || meshPollJob?.status === "SUCCEEDED") {
      void refresh();
    }
  }, [sketchJob?.status, refineJob?.status, regenJob?.status, meshJob?.status, meshPollJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function deleteSketchVersion(versionId: string) {
    if (!sketchArtifact) return;
    if (!confirm("Delete this sketch variation? This removes the image permanently.")) return;
    await fetch(`/api/tracks/${trackId}/product/sketches/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: sketchArtifact.id, versionId }),
    });
    await refresh();
  }

  async function regenerateSketchFromDrawing() {
    if (!sketchArtifact || !currentSketchVersion) return;
    if (!canvasRef.current?.hasStrokes()) {
      alert("Draw on the sketch first, then click Regenerate sketch.");
      return;
    }
    const editedCanvasBase64 = await canvasRef.current.exportComposite();
    const res = await fetch(`/api/tracks/${trackId}/product/sketches/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactId: sketchArtifact.id,
        parentVersionId: currentSketchVersion.id,
        editedCanvasBase64,
      }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setRegenJobId(jobId);
    canvasRef.current?.clear();
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
    if (!currentSketchVersion || !sketchArtifact) return;
    let editedCanvasBase64: string | undefined;
    if (canvasRef.current?.hasStrokes()) {
      editedCanvasBase64 = await canvasRef.current.exportComposite();
    }
    const res = await fetch(`/api/tracks/${trackId}/product/mesh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceVersionId: currentSketchVersion.id,
        sketchArtifactId: sketchArtifact.id,
        editedCanvasBase64,
      }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setMeshJobId(jobId);
    setMeshPollJobId(null);
    canvasRef.current?.clear();
  }

  async function chooseMeshVersion(versionId: string) {
    if (!meshArtifact) return;
    await fetch(`/api/tracks/${trackId}/product/mesh/choose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: meshArtifact.id, versionId }),
    });
    await refresh();
  }

  async function deleteMeshVersion(versionId: string, label: string) {
    if (!meshArtifact) return;
    if (!confirm(`Delete ${label}? This removes the GLB file permanently.`)) return;
    await fetch(`/api/tracks/${trackId}/product/mesh/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifactId: meshArtifact.id, versionId }),
    });
    await refresh();
  }

  const previewMeshVersion = useMemo(() => {
    if (!previewMeshVersionId || !meshArtifact) return null;
    return meshArtifact.versions.find((v) => v.id === previewMeshVersionId) ?? null;
  }, [previewMeshVersionId, meshArtifact]);
  const displayedMeshVersion = previewMeshVersion ?? currentMeshVersion;
  const meshUrl = displayedMeshVersion?.storageKey
    ? `/api/storage/${displayedMeshVersion.storageKey}`
    : null;
  const meshPending = !!meshJobId && (!currentMeshVersion?.storageKey);

  const sketchDone = !!sketchArtifact && sketchArtifact.versions.some((v) => !!v.storageKey);
  const refineDone = !!sketchArtifact && sketchArtifact.versions.some((v) => !!v.parentVersionId);
  const meshDone = !!meshArtifact && meshArtifact.versions.some((v) => !!v.storageKey);

  const steps = [
    { key: "sketch", label: "Concept sketches", hint: "Pick the closest one", done: sketchDone },
    { key: "refine", label: "Refine the sketch", hint: "Draw or describe changes", done: refineDone },
    { key: "mesh", label: "3D model", hint: "Make it rotatable", done: meshDone },
  ];

  // Initial step: first not-done step. Only computed once at mount; after that
  // the user drives navigation.
  const initialStep = useMemo(() => {
    const i = [sketchDone, refineDone, meshDone].findIndex((d) => !d);
    return i === -1 ? 0 : i;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeStep, setActiveStep] = useState(initialStep);

  return (
    <div className="space-y-6">
      <PipelineStepper steps={steps} activeIndex={activeStep} onSelect={setActiveStep} />

      {activeStep === 0 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <StepHeader
              index={0}
              total={steps.length}
              title="Generate concept sketches"
              description="Spark will draw a few rough product concepts. Pick the variation closest to your idea — you can refine it in the next step."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => generateSketches(4)}>
                {sketchDone ? "Generate 4 more variations" : "Generate 4 variations"}
              </Button>
              {sketchDone && (
                <span className="text-xs text-muted-foreground">
                  Click a thumbnail below to select it as your working sketch.
                </span>
              )}
            </div>

            {sketchArtifact && sketchArtifact.versions.length > 0 ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Variations · click to select
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {sketchArtifact.versions.slice(0, 12).map((v) => {
                    const meta = safeJson<{ variationIndex?: number }>(v.meta, {});
                    const isActive = sketchArtifact.currentVersionId === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`group relative aspect-square overflow-hidden rounded-md border ${
                          isActive ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-ring"
                        }`}
                        title={meta.variationIndex !== undefined ? `v${meta.variationIndex}` : "version"}
                      >
                        <button
                          type="button"
                          onClick={() => chooseVersion(v.id)}
                          className="block h-full w-full"
                          aria-label="Select this variation"
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
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSketchVersion(v.id);
                          }}
                          aria-label="Delete this variation"
                          title="Delete variation"
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-[11px] leading-none text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100 focus:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                No sketches yet. Click <strong>Generate 4 variations</strong> to start.
              </p>
            )}

            <StepNav
              onNext={() => setActiveStep(1)}
              nextLabel="Next: refine the sketch"
              nextDisabled={!sketchDone}
              hint={!sketchDone ? "Generate at least one sketch to continue." : undefined}
            />
          </CardContent>
        </Card>
      )}

      {activeStep === 1 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <StepHeader
              index={1}
              total={steps.length}
              title="Refine the sketch"
              description="Draw on top of the sketch to mark changes, or describe what to tweak in words. Skip this step if your concept is already where you want it."
            />

            {currentSketchVersion?.storageKey ? (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <SketchCanvas
                  ref={canvasRef}
                  backgroundUrl={`/api/storage/${currentSketchVersion.storageKey}`}
                />
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs font-semibold">Option A · Describe a change</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Type what should change. Spark redraws the sketch.
                    </p>
                    <Input
                      placeholder='e.g. "add a leather strap and matte texture"'
                      value={refineInstruction}
                      onChange={(e) => setRefineInstruction(e.target.value)}
                      className="mt-2"
                    />
                    <Button
                      onClick={refineSketch}
                      disabled={!currentSketchVersion || !refineInstruction.trim()}
                      className="mt-2 w-full"
                      size="sm"
                    >
                      AI refine
                    </Button>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs font-semibold">Option B · Draw the change</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Sketch on the canvas to mark up; Spark renders a clean version.
                    </p>
                    <Button
                      onClick={regenerateSketchFromDrawing}
                      disabled={!currentSketchVersion}
                      variant="secondary"
                      size="sm"
                      className="mt-2 w-full"
                    >
                      Regenerate from drawing
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Pick a sketch in step 1 first.
              </p>
            )}

            <StepNav
              onBack={() => setActiveStep(0)}
              onNext={() => setActiveStep(2)}
              nextLabel="Next: generate 3D model"
              nextDisabled={!sketchDone}
            />
          </CardContent>
        </Card>
      )}

      {activeStep === 2 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <StepHeader
              index={2}
              total={steps.length}
              title="Turn it into a 3D model"
              description="Convert your final sketch into a rotatable 3D model (GLB). Takes about a minute."
            />

            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-3">
                <MeshViewer glbUrl={meshUrl} pending={meshPending} />
                {previewMeshVersion && previewMeshVersionId !== meshArtifact?.currentVersionId && (
                  <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px]">
                    <span className="text-amber-900">
                      Previewing an older version (not current).
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewMeshVersionId(null)}
                      className="rounded border border-amber-300 px-2 py-0.5 text-amber-900 hover:bg-amber-100"
                    >
                      Stop preview
                    </button>
                  </div>
                )}
                <Button
                  onClick={generateMesh}
                  disabled={!currentSketchVersion}
                  className="w-full"
                >
                  {currentMeshVersion?.storageKey ? "Regenerate 3D from sketch" : "Generate 3D from sketch"}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  History {meshArtifact ? `(${meshArtifact.versions.length})` : ""}
                </div>
                {meshArtifact && meshArtifact.versions.length > 0 ? (
                  <ul className="space-y-1">
                    {meshArtifact.versions.slice(0, 8).map((v, i) => {
                      const isActive = meshArtifact.currentVersionId === v.id;
                      const isPreviewing = previewMeshVersionId === v.id;
                      const ready = !!v.storageKey;
                      const label = `v${meshArtifact.versions.length - i}`;
                      const time = new Date(v.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const meshMeta = safeJson<{ thumbnailUrl?: string }>(v.meta, {});
                      const thumb = meshMeta.thumbnailUrl;
                      return (
                        <li
                          key={v.id}
                          className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${
                            isPreviewing
                              ? "border-amber-400 bg-amber-50"
                              : isActive
                                ? "border-primary bg-primary/5"
                                : ""
                          }`}
                        >
                          {ready && thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt={`${label} thumbnail`}
                              className="h-10 w-10 shrink-0 rounded border bg-neutral-100 object-cover"
                            />
                          ) : (
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded border bg-muted text-[9px] text-muted-foreground">
                              {ready ? "GLB" : "…"}
                            </div>
                          )}
                          <span className="flex flex-1 items-center gap-2">
                            <span className="font-mono">{label}</span>
                            <span className="text-muted-foreground">{time}</span>
                            {!ready && (
                              <span className="text-[10px] text-muted-foreground">pending…</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            {ready && !isActive && (
                              <button
                                onClick={() =>
                                  setPreviewMeshVersionId(isPreviewing ? null : v.id)
                                }
                                className={`rounded border px-2 py-0.5 text-[10px] hover:bg-muted ${
                                  isPreviewing ? "border-amber-400 bg-amber-100" : ""
                                }`}
                                title="Load this version into the 3D viewer without committing"
                              >
                                {isPreviewing ? "Stop" : "Preview"}
                              </button>
                            )}
                            {ready && (
                              <a
                                href={`/api/storage/${v.storageKey}`}
                                download={`model-${label}.glb`}
                                className="rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
                              >
                                Download
                              </a>
                            )}
                            {!isActive && ready && (
                              <button
                                onClick={() => {
                                  setPreviewMeshVersionId(null);
                                  chooseMeshVersion(v.id);
                                }}
                                className="rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
                              >
                                Revert
                              </button>
                            )}
                            {isActive && (
                              <Badge variant="muted" className="text-[10px]">
                                current
                              </Badge>
                            )}
                            <button
                              onClick={() => {
                                if (isPreviewing) setPreviewMeshVersionId(null);
                                deleteMeshVersion(v.id, label);
                              }}
                              className="rounded border border-red-300 px-2 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                              title="Delete this version permanently"
                            >
                              Delete
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No 3D models yet. Generate one to populate this list.
                  </p>
                )}
              </div>
            </div>

            <StepNav onBack={() => setActiveStep(1)} backLabel="Back to refine" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
