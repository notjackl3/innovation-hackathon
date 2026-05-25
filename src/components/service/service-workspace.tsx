"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useJob } from "@/components/shared/job-progress";
import { PipelineStepper, StepHeader, StepNav } from "@/components/shared/pipeline-stepper";
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
  const [allVideosJob, setAllVideosJob] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const planJ = useJob(planJob);
  const frameJ = useJob(frameJob);
  const allFramesJ = useJob(allFramesJob);
  const narrJ = useJob(narrJob);
  const videoJ = useJob(videoJob);
  const addSceneJ = useJob(addSceneJob);
  const allVideosJ = useJob(allVideosJob);

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
      addSceneJ?.status === "SUCCEEDED" ||
      allVideosJ?.status === "SUCCEEDED"
    ) {
      void refresh();
    }
  }, [planJ?.status, frameJ?.status, allFramesJ?.status, narrJ?.status, videoJ?.status, addSceneJ?.status, allVideosJ?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // While GEN_ALL_FRAMES or GEN_ALL_VIDEOS runs, refresh periodically so the storyboard fills in.
  useEffect(() => {
    const running =
      (allFramesJob && allFramesJ?.status !== "SUCCEEDED" && allFramesJ?.status !== "FAILED") ||
      (allVideosJob && allVideosJ?.status !== "SUCCEEDED" && allVideosJ?.status !== "FAILED");
    if (!running) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [allFramesJob, allFramesJ?.status, allVideosJob, allVideosJ?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function animateAllScenes(force = false) {
    if (!planArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/service/videos/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenePlanArtifactId: planArtifact.id, force }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body?.error?.formErrors?.join(", ") ?? "Failed to start motion generation.");
      return;
    }
    const { jobId } = (await res.json()) as { jobId: string };
    setAllVideosJob(jobId);
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

  const planDone = !!plan && plan.scenes.length > 0;
  const framesDone =
    !!plan && plan.scenes.length > 0 && plan.scenes.every((s) => !!s.frameStorageKey);
  const narrationDone =
    !!plan && plan.scenes.length > 0 && plan.scenes.some((s) => !!s.audioStorageKey);
  const exportDone = !!videoVersion?.storageKey?.endsWith(".mp4");

  const steps = [
    { key: "plan", label: "Plan the story", hint: "Scenes, captions, order", done: planDone },
    { key: "frames", label: "Render frames", hint: "One image per scene", done: framesDone },
    { key: "voice", label: "Motion & voice", hint: "Animate & narrate", done: narrationDone },
    { key: "export", label: "Assemble video", hint: "Export the MP4", done: exportDone },
  ];

  const initialStep = useMemo(() => {
    const i = [planDone, framesDone, narrationDone, exportDone].findIndex((d) => !d);
    return i === -1 ? 0 : i;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeStep, setActiveStep] = useState(initialStep);

  const sceneList = (variant: "plan" | "frames" | "voice") =>
    plan && (
      <ul className="space-y-2">
        {plan.scenes.map((scene) => {
          const hasFrame = !!scene.frameStorageKey;
          const hasAudio = !!scene.audioStorageKey;
          return (
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
                  {hasFrame ? (
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {scene.locked && <Badge variant="muted" className="text-[10px]">Locked</Badge>}
                    {variant !== "plan" && (
                      <Badge variant={hasFrame ? "success" : "muted"} className="text-[10px]">
                        {hasFrame ? "Frame ✓" : "no frame"}
                      </Badge>
                    )}
                    {variant === "voice" && (
                      <Badge variant={hasAudio ? "success" : "muted"} className="text-[10px]">
                        {hasAudio ? "VO ✓" : "no VO"}
                      </Badge>
                    )}
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
          );
        })}
      </ul>
    );

  return (
    <div className="space-y-6">
      <PipelineStepper steps={steps} activeIndex={activeStep} onSelect={setActiveStep} />

      {activeStep === 0 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <StepHeader
              index={0}
              total={steps.length}
              title="Plan the story"
              description="Spark drafts a scene-by-scene plan: titles, captions, and narration text. Edit any scene, reorder them, or add a new one before moving on to render visuals."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => generatePlan(6)}>
                {plan ? "Regenerate plan" : "Generate plan"}
              </Button>
              {!plan && (
                <span className="text-xs text-muted-foreground">
                  Click to start — generates 6 scenes by default.
                </span>
              )}
            </div>

            {plan && (
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Live preview
                  </div>
                  <ScenePreview scenes={plan.scenes} />
                </div>
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Scenes · click to edit
                  </div>
                  {sceneList("plan")}
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <div className="text-xs font-semibold">Add a scene</div>
                    <Input
                      value={addSceneHint}
                      onChange={(e) => setAddSceneHint(e.target.value)}
                      placeholder='Optional: what should the new scene show?'
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          addScene(addSceneHint || undefined);
                          setAddSceneHint("");
                        }}
                      >
                        + Add at end
                      </Button>
                      <span className="text-[11px] italic text-muted-foreground">
                        Continues the same characters and world.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <StepNav
              onNext={() => setActiveStep(1)}
              nextLabel="Next: render frames"
              nextDisabled={!planDone}
              hint={!planDone ? "Generate a plan to continue." : undefined}
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
              title="Render the frames"
              description="Generate one still image per scene. You can re-render any single frame by selecting it below."
            />

            {!plan ? (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Plan the story in step 1 first.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => renderAllFrames(false)}>
                    {framesDone ? "Re-render missing frames" : "Render all frames"}
                  </Button>
                  <Button variant="outline" onClick={() => renderAllFrames(true)}>
                    Force re-render all
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Click a scene to re-render just that one.
                  </span>
                </div>
                {sceneList("frames")}
              </>
            )}

            <StepNav
              onBack={() => setActiveStep(0)}
              onNext={() => setActiveStep(2)}
              nextLabel="Next: motion & voice"
              nextDisabled={!framesDone}
              hint={!framesDone ? "Render every frame to continue." : undefined}
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
              title="Add motion & narration"
              description="Animate scenes where the protagonist moves (Seedance) and generate a voiceover from the narration text."
            />

            {!plan ? (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Plan the story in step 1 first.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs font-semibold">Motion · Seedance</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Generates a short motion clip for scenes where the protagonist actually moves.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => animateAllScenes(false)}>
                        Animate scenes
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => animateAllScenes(true)}>
                        Force re-animate
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-xs font-semibold">Narration · voiceover</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Reads each scene&rsquo;s narration aloud and attaches the audio.
                    </p>
                    <div className="mt-2">
                      <Button size="sm" onClick={generateNarration}>
                        {narrationDone ? "Regenerate narration" : "Generate narration"}
                      </Button>
                    </div>
                  </div>
                </div>
                {sceneList("voice")}
              </>
            )}

            <StepNav
              onBack={() => setActiveStep(1)}
              onNext={() => setActiveStep(3)}
              nextLabel="Next: assemble video"
            />
          </CardContent>
        </Card>
      )}

      {activeStep === 3 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <StepHeader
              index={3}
              total={steps.length}
              title="Assemble the final video"
              description="Combine the frames, motion clips, and narration into a single MP4 you can download or share."
            />

            {!plan ? (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Plan the story in step 1 first.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={assembleVideo}>
                    {exportDone ? "Re-assemble video" : "Assemble video"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Renders an MP4 from the current frames & audio.
                  </span>
                </div>

                {videoVersion?.storageKey?.endsWith(".mp4") ? (
                  <video
                    controls
                    src={`/api/storage/${videoVersion.storageKey}`}
                    className="w-full rounded-md border"
                  />
                ) : videoVersion?.storageKey ? (
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    Renderer service not configured; the in-browser preview from step 1 is the live demo.{" "}
                    <a className="text-primary underline" href={`/api/storage/${videoVersion.storageKey}`}>
                      Download manifest
                    </a>
                    .
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No video yet — click <strong>Assemble video</strong> to render one.
                  </p>
                )}
              </div>
            )}

            <StepNav onBack={() => setActiveStep(2)} backLabel="Back to motion & voice" />
          </CardContent>
        </Card>
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
