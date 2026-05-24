"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { JobProgress, useJob } from "@/components/shared/job-progress";
import { ScenePlanSchema, type ScenePlan, type Scene } from "@/lib/schemas/scene";
import { ScenePreview } from "./scene-preview";

interface VersionLite {
  id: string;
  storageKey: string | null;
  contentJson: string | null;
  createdAt: string;
}

interface ArtifactLite {
  id: string;
  kind: string;
  currentVersionId: string | null;
  versions: VersionLite[];
}

export function ServiceWorkspace({
  trackId,
  initialArtifacts,
}: {
  trackId: string;
  initialArtifacts: ArtifactLite[];
}) {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [planJob, setPlanJob] = useState<string | null>(null);
  const [frameJob, setFrameJob] = useState<string | null>(null);
  const [allFramesJob, setAllFramesJob] = useState<string | null>(null);
  const [narrJob, setNarrJob] = useState<string | null>(null);
  const [videoJob, setVideoJob] = useState<string | null>(null);
  const [addSceneJob, setAddSceneJob] = useState<string | null>(null);
  const [addSceneHint, setAddSceneHint] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const planJ = useJob(planJob);
  const frameJ = useJob(frameJob);
  const allFramesJ = useJob(allFramesJob);
  const narrJ = useJob(narrJob);
  const videoJ = useJob(videoJob);
  const addSceneJ = useJob(addSceneJob);

  const planArtifact = useMemo(() => artifacts.find((a) => a.kind === "SCENE_PLAN"), [artifacts]);
  const videoArtifact = useMemo(() => artifacts.find((a) => a.kind === "VIDEO"), [artifacts]);
  const planVersion = useMemo(() => {
    if (!planArtifact) return null;
    return (
      planArtifact.versions.find((v) => v.id === planArtifact.currentVersionId) ??
      planArtifact.versions[0]
    );
  }, [planArtifact]);
  const plan: ScenePlan | null = useMemo(() => {
    if (!planVersion?.contentJson) return null;
    const r = ScenePlanSchema.safeParse(JSON.parse(planVersion.contentJson));
    return r.success ? r.data : null;
  }, [planVersion]);
  const videoVersion = videoArtifact?.versions.find((v) => v.id === videoArtifact.currentVersionId) ?? videoArtifact?.versions[0];

  useEffect(() => {
    if (
      planJ?.status === "SUCCEEDED" ||
      frameJ?.status === "SUCCEEDED" ||
      allFramesJ?.status === "SUCCEEDED" ||
      narrJ?.status === "SUCCEEDED" ||
      videoJ?.status === "SUCCEEDED" ||
      addSceneJ?.status === "SUCCEEDED"
    ) {
      void refresh();
    }
  }, [planJ?.status, frameJ?.status, allFramesJ?.status, narrJ?.status, videoJ?.status, addSceneJ?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // While GEN_ALL_FRAMES runs, refresh periodically so the storyboard fills in scene-by-scene.
  useEffect(() => {
    if (!allFramesJob || allFramesJ?.status === "SUCCEEDED" || allFramesJ?.status === "FAILED") return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [allFramesJob, allFramesJ?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function generatePlan(n: number) {
    const res = await fetch(`/api/tracks/${trackId}/service/scene-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ n }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setPlanJob(jobId);
  }

  async function renderAllFrames(force = false) {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/frames/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id, force }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setAllFramesJob(jobId);
  }
  async function generateFrame(sceneIndex: number) {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/scenes/${sceneIndex}/frame`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setFrameJob(jobId);
  }
  async function generateNarration() {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/narration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setNarrJob(jobId);
  }
  async function assembleVideo() {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setVideoJob(jobId);
  }

  async function addScene(hint?: string) {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id, hint }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setAddSceneJob(jobId);
  }

  async function updatePlan(next: ScenePlan) {
    if (!planArtifact) return;
    await fetch(`/api/tracks/${trackId}/service/scene-plan`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id, plan: next }),
    });
    await refresh();
  }

  function patchScene(index: number, patch: Partial<Scene>) {
    if (!plan) return;
    const next: ScenePlan = {
      ...plan,
      scenes: plan.scenes.map((s) => (s.index === index ? { ...s, ...patch } : s)),
    };
    void updatePlan(next);
  }
  function moveScene(index: number, dir: -1 | 1) {
    if (!plan) return;
    const sorted = [...plan.scenes].sort((a, b) => a.index - b.index);
    const i = sorted.findIndex((s) => s.index === index);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    const next: ScenePlan = {
      ...plan,
      scenes: sorted.map((s, k) => ({ ...s, index: k })),
    };
    void updatePlan(next);
  }
  function removeScene(index: number) {
    if (!plan) return;
    const next: ScenePlan = {
      ...plan,
      scenes: plan.scenes.filter((s) => s.index !== index).map((s, i) => ({ ...s, index: i })),
    };
    void updatePlan(next);
    setSelected(null);
  }

  const selectedScene = selected !== null ? plan?.scenes.find((s) => s.index === selected) ?? null : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Storyboard</h2>
            <p className="text-sm text-muted-foreground">
              Plan → render frames → narrate → preview in-browser → render an MP4.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {planJob && <JobProgress job={planJ} className="w-40" />}
            {allFramesJob && <JobProgress job={allFramesJ} className="w-40" />}
            <Button onClick={() => generatePlan(6)} variant="outline">{plan ? "Regen plan" : "Generate plan"}</Button>
            <Button onClick={() => renderAllFrames(false)} variant="outline" disabled={!plan}>
              Render all frames
            </Button>
            <Button onClick={generateNarration} variant="outline" disabled={!plan}>Narration</Button>
            <Button onClick={assembleVideo} disabled={!plan}>Assemble video</Button>
          </div>
        </CardContent>
      </Card>

      {plan && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Live preview
                </h3>
                <ScenePreview scenes={plan.scenes} />
              </CardContent>
            </Card>

            {(videoVersion || videoJob) && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Exported video
                    </h3>
                    {videoJob && <JobProgress job={videoJ} className="w-40" />}
                  </div>
                  {videoVersion?.storageKey?.endsWith(".mp4") ? (
                    <video controls src={`/api/storage/${videoVersion.storageKey}`} className="w-full rounded-md border" />
                  ) : videoVersion?.storageKey ? (
                    <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                      Renderer service not configured; the in-browser preview above is the live demo.{" "}
                      <a className="text-primary underline" href={`/api/storage/${videoVersion.storageKey}`}>
                        Download manifest
                      </a>
                      .
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Scenes
                  </h3>
                  {frameJob && <JobProgress job={frameJ} className="w-28" />}
                  {narrJob && <JobProgress job={narrJ} className="w-28" />}
                </div>
                <ul className="space-y-2">
                  {plan.scenes.map((scene) => (
                    <li
                      key={scene.index}
                      className={`overflow-hidden rounded-md border ${
                        selected === scene.index ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      <button
                        onClick={() => setSelected(scene.index === selected ? null : scene.index)}
                        className="flex w-full items-stretch gap-3 text-left"
                      >
                        <div className="relative h-16 w-24 shrink-0 bg-muted">
                          {scene.frameStorageKey ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/storage/${scene.frameStorageKey}`}
                              alt={scene.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
                              {scene.index + 1}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 py-2 pr-2 text-xs">
                          <div className="truncate font-medium">{scene.title}</div>
                          <div className="truncate italic text-muted-foreground">&ldquo;{scene.caption}&rdquo;</div>
                          <div className="mt-1 flex gap-1">
                            {scene.locked && <Badge variant="muted" className="text-[10px]">Locked</Badge>}
                            {scene.audioStorageKey && <Badge variant="muted" className="text-[10px]">VO</Badge>}
                          </div>
                        </div>
                      </button>
                      {selected === scene.index && (
                        <SceneEditor
                          scene={scene}
                          onChange={(p) => patchScene(scene.index, p)}
                          onRegenerate={() => generateFrame(scene.index)}
                          onMoveUp={() => moveScene(scene.index, -1)}
                          onMoveDown={() => moveScene(scene.index, 1)}
                          onRemove={() => removeScene(scene.index)}
                        />
                      )}
                    </li>
                  ))}
                </ul>

                <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Add scene
                    </div>
                    {addSceneJob && <JobProgress job={addSceneJ} className="w-28" />}
                  </div>
                  <Input
                    value={addSceneHint}
                    onChange={(e) => setAddSceneHint(e.target.value)}
                    placeholder='Optional: what should the new scene show? e.g. "customer leaves with a smile"'
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        addScene(addSceneHint || undefined);
                        setAddSceneHint("");
                      }}
                    >
                      + Add scene at end
                    </Button>
                    <p className="text-xs italic text-muted-foreground">
                      Continues the same characters and visual world.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneEditor({
  scene,
  onChange,
  onRegenerate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  scene: Scene;
  onChange: (patch: Partial<Scene>) => void;
  onRegenerate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 border-t bg-muted/30 p-3 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Title</span>
          <Input value={scene.title} onChange={(e) => onChange({ title: e.target.value })} className="h-8" />
        </label>
        <label>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Duration (s)</span>
          <Input
            type="number"
            min={1}
            max={15}
            value={scene.durationSec}
            onChange={(e) => onChange({ durationSec: parseInt(e.target.value || "4", 10) })}
            className="h-8"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Caption</span>
        <Input value={scene.caption} onChange={(e) => onChange({ caption: e.target.value })} className="h-8" />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Narration</span>
        <Textarea
          value={scene.narration}
          onChange={(e) => onChange({ narration: e.target.value })}
          rows={2}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={onRegenerate}>Render frame</Button>
        <Button size="sm" variant="ghost" onClick={onMoveUp}>↑</Button>
        <Button size="sm" variant="ghost" onClick={onMoveDown}>↓</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ locked: !scene.locked })}
        >
          {scene.locked ? "Unlock" : "Lock"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Delete
        </Button>
      </div>
    </div>
  );
}
