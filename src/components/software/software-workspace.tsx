"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useJob } from "@/components/shared/job-progress";
import { PipelineStepper, StepHeader, StepNav } from "@/components/shared/pipeline-stepper";
import { BlockRenderer } from "./block-renderer";
import { LaptopFrame } from "./laptop-frame";
import { SelectionMarquee } from "./selection-marquee";
import { BlueprintCanvas } from "./blueprint-canvas";
import { toggleBlock as toggleBlockReducer, applyMarqueeHits as applyMarqueeHitsReducer } from "./selection-state";
import { computeDropTarget, moveBlock, type BlockSlot } from "./drag-utils";
import type { Rename } from "@/lib/pipelines/propagate-spec-changes";
import {
  DemoBundleSchema,
  ProductSpecSchema,
  type DemoBundle,
  type ProductSpec,
  type ScreenSpec,
} from "@/lib/schemas/screen";

interface VersionLite {
  id: string;
  contentJson: string | null;
  createdAt: string;
}

interface ArtifactLite {
  id: string;
  kind: string;
  currentVersionId: string | null;
  versions: VersionLite[];
}

export function SoftwareWorkspace({
  trackId,
  initialArtifacts,
}: {
  trackId: string;
  initialArtifacts: ArtifactLite[];
}) {
  const router = useRouter();
  const [artifacts, setArtifacts] = useState(initialArtifacts);
  const [specJobId, setSpecJobId] = useState<string | null>(null);
  const [screensJobId, setScreensJobId] = useState<string | null>(null);
  const specJob = useJob(specJobId);
  const screensJob = useJob(screensJobId);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const dragContainerRef = useRef<HTMLDivElement>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const specArtifact = useMemo(() => artifacts.find((a) => a.kind === "PRODUCT_SPEC"), [artifacts]);
  const bundleArtifact = useMemo(() => artifacts.find((a) => a.kind === "DEMO_BUNDLE"), [artifacts]);

  const spec: ProductSpec | null = useMemo(() => {
    const v = specArtifact?.versions.find((x) => x.id === specArtifact?.currentVersionId) ?? specArtifact?.versions[0];
    if (!v?.contentJson) return null;
    const parsed = ProductSpecSchema.safeParse(JSON.parse(v.contentJson));
    return parsed.success ? parsed.data : null;
  }, [specArtifact]);

  const bundle: DemoBundle | null = useMemo(() => {
    const v = bundleArtifact?.versions.find((x) => x.id === bundleArtifact?.currentVersionId) ?? bundleArtifact?.versions[0];
    if (!v?.contentJson) return null;
    const parsed = DemoBundleSchema.safeParse(JSON.parse(v.contentJson));
    return parsed.success ? parsed.data : null;
  }, [bundleArtifact]);

  const screenIndex: Record<string, ScreenSpec> = useMemo(
    () => Object.fromEntries((bundle?.screens ?? []).map((s) => [s.name, s])),
    [bundle]
  );

  useEffect(() => {
    if (specJob?.status === "SUCCEEDED" || screensJob?.status === "SUCCEEDED") {
      void refresh();
    }
  }, [specJob?.status, screensJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    const res = await fetch(`/api/tracks/${trackId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      artifacts: Array<{
        id: string;
        kind: string;
        currentVersionId: string | null;
        versions: Array<{ id: string; contentJson: string | null; createdAt: string }>;
      }>;
    };
    setArtifacts(
      data.artifacts.map((a) => ({
        id: a.id,
        kind: a.kind,
        currentVersionId: a.currentVersionId,
        versions: a.versions.map((v) => ({
          id: v.id,
          contentJson: v.contentJson,
          createdAt: typeof v.createdAt === "string" ? v.createdAt : new Date(v.createdAt).toISOString(),
        })),
      }))
    );
    router.refresh();
  }

  useEffect(() => {
    if (!activeScreen && bundle) setActiveScreen(bundle.startScreen);
  }, [bundle, activeScreen]);

  useEffect(() => {
    setSelectedBlocks([]);
  }, [activeScreen]);

  async function generateSpec() {
    const res = await fetch(`/api/tracks/${trackId}/software/spec`, { method: "POST" });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setSpecJobId(jobId);
  }

  async function publish() {
    if (!bundleArtifact) return;
    setPublishing(true);
    const res = await fetch(`/api/tracks/${trackId}/software/demo/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleArtifactId: bundleArtifact.id }),
    });
    setPublishing(false);
    if (!res.ok) return;
    const data = (await res.json()) as { url: string };
    setShareUrl(data.url);
  }

  async function generateScreens(
    onlyScreen?: string,
    editInstructionArg?: string,
    selectedBlockIndices?: number[]
  ) {
    if (!specArtifact) return;
    const res = await fetch(`/api/tracks/${trackId}/software/screens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSpecArtifactId: specArtifact.id,
        bundleArtifactId: bundleArtifact?.id,
        onlyScreen,
        editInstruction: editInstructionArg,
        selectedBlockIndices:
          selectedBlockIndices && selectedBlockIndices.length > 0 ? selectedBlockIndices : undefined,
      }),
    });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setScreensJobId(jobId);
  }

  async function editActiveScreen() {
    const instruction = editInstruction.trim();
    if (!activeScreen || !instruction) return;
    await generateScreens(activeScreen, instruction, selectedBlocks);
    setEditInstruction("");
    setSelectedBlocks([]);
  }

  async function commitBlueprint(newScreens: string[], renames: Rename[]) {
    if (!specArtifact) throw new Error("No spec artifact");
    const res = await fetch(`/api/tracks/${trackId}/software/spec`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productSpecArtifactId: specArtifact.id,
        newScreens,
        renames,
        bundleArtifactId: bundleArtifact?.id,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    // If the active screen was renamed/deleted, keep the view coherent.
    const renameMap = new Map(renames.map((r) => [r.from, r.to]));
    if (activeScreen) {
      const remapped = renameMap.get(activeScreen) ?? activeScreen;
      if (!newScreens.includes(remapped)) {
        setActiveScreen(newScreens[0] ?? null);
      } else if (remapped !== activeScreen) {
        setActiveScreen(remapped);
      }
    }
    await refresh();
  }

  function toggleBlock(index: number, additive: boolean) {
    setSelectedBlocks((prev) => toggleBlockReducer(prev, index, additive));
  }

  function applyMarqueeHits(indices: number[], additive: boolean) {
    setSelectedBlocks((prev) => applyMarqueeHitsReducer(prev, indices, additive));
  }

  function startBlockDrag(index: number, ev: React.PointerEvent<HTMLElement>) {
    ev.preventDefault();
    ev.stopPropagation();
    setSelectedBlocks([]);
    setDraggingIndex(index);
    setDropTargetIndex(index);
  }

  // While a block is being dragged, attach window-level pointer listeners so
  // the drag continues even if the pointer leaves the preview area.
  useEffect(() => {
    if (draggingIndex === null) return;
    function readSlots(): { containerTop: number; slots: BlockSlot[] } | null {
      const container = dragContainerRef.current;
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const nodes = container.querySelectorAll<HTMLElement>("[data-block-index]");
      const slots: BlockSlot[] = [];
      nodes.forEach((node) => {
        const idx = Number(node.dataset.blockIndex);
        if (!Number.isInteger(idx)) return;
        const r = node.getBoundingClientRect();
        slots.push({
          index: idx,
          top: r.top - containerRect.top,
          bottom: r.bottom - containerRect.top,
        });
      });
      return { containerTop: containerRect.top, slots };
    }
    function onMove(ev: PointerEvent) {
      const ctx = readSlots();
      if (!ctx) return;
      const cursorY = ev.clientY - ctx.containerTop;
      setDropTargetIndex(computeDropTarget(cursorY, ctx.slots));
    }
    function onUp() {
      setDraggingIndex((from) => {
        setDropTargetIndex((to) => {
          if (from !== null && to !== null) void commitReorder(from, to);
          return null;
        });
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  async function commitReorder(from: number, to: number) {
    if (!activeSpec || !bundleArtifact || !activeScreen) return;
    if (to === from || to === from + 1) return; // no-op slot
    const indices = activeSpec.blocks.map((_, i) => i);
    const order = moveBlock(indices, from, to);
    const newBlocks = order.map((i) => activeSpec.blocks[i]);
    const screenName = activeScreen;
    // Optimistic in-place update of the bundle's latest version JSON.
    setArtifacts((prev) =>
      prev.map((a) => {
        if (a.id !== bundleArtifact.id) return a;
        const headIdx = a.versions.findIndex((v) => v.id === a.currentVersionId);
        const safeIdx = headIdx >= 0 ? headIdx : 0;
        const head = a.versions[safeIdx];
        if (!head?.contentJson) return a;
        let parsed: DemoBundle;
        try {
          parsed = DemoBundleSchema.parse(JSON.parse(head.contentJson));
        } catch {
          return a;
        }
        const nextBundle: DemoBundle = {
          ...parsed,
          screens: parsed.screens.map((s) =>
            s.name === screenName ? { ...s, blocks: newBlocks } : s
          ),
        };
        const nextVersions = a.versions.slice();
        nextVersions[safeIdx] = { ...head, contentJson: JSON.stringify(nextBundle) };
        return { ...a, versions: nextVersions };
      })
    );
    // Persist.
    const res = await fetch(`/api/tracks/${trackId}/software/screens/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleArtifactId: bundleArtifact.id,
        screenName,
        order,
      }),
    });
    if (!res.ok) void refresh();
  }

  const activeSpec = activeScreen ? screenIndex[activeScreen] : null;

  const specDone = !!spec;
  const screensDone = !!bundle && bundle.screens.length > 0;
  const publishDone = !!shareUrl;

  const steps = [
    { key: "spec", label: "Product spec", hint: "What the app does", done: specDone },
    { key: "screens", label: "Build screens", hint: "Generate & edit UI", done: screensDone },
    { key: "publish", label: "Publish & share", hint: "Get a share link", done: publishDone },
  ];

  const initialStep = useMemo(() => {
    const i = [specDone, screensDone, publishDone].findIndex((d) => !d);
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
              title="Generate the product spec"
              description="Spark reads your brief and writes a structured spec: app name, tagline, and the list of screens to build."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={generateSpec}>
                {spec ? "Regenerate spec" : "Generate spec"}
              </Button>
              {!spec && (
                <span className="text-xs text-muted-foreground">Click to start — takes a few seconds.</span>
              )}
            </div>

            {spec && (
              <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                <div>
                  <h3 className="text-xl font-semibold">{spec.name}</h3>
                  <p className="text-sm text-muted-foreground">{spec.tagline}</p>
                </div>
                <BlueprintCanvas
                  spec={spec}
                  bundle={bundle}
                  activeScreen={activeScreen}
                  onSelectScreen={(name) => {
                    setActiveScreen(name);
                    setActiveStep(1);
                  }}
                  onCommit={commitBlueprint}
                />
              </div>
            )}

            <StepNav
              onNext={() => setActiveStep(1)}
              nextLabel="Next: build the screens"
              nextDisabled={!specDone}
              hint={!specDone ? "Generate the spec to continue." : undefined}
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
              title="Build & edit the screens"
              description="Spark renders each screen as live UI. Click a block to select it, then describe an edit in plain English — Spark rewrites just that block."
            />

            {!spec ? (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Generate the spec in step 1 first.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => generateScreens()}>
                    {bundle ? "Regenerate all screens" : "Generate all screens"}
                  </Button>
                  {bundle && (
                    <span className="text-xs text-muted-foreground">
                      Click any screen in the sidebar to preview & edit.
                    </span>
                  )}
                </div>

                {bundle && activeSpec ? (
                  <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <Card>
            <CardContent className="p-2">
              <ul className="space-y-1">
                {bundle.screens.map((s) => (
                  <li key={s.name}>
                    <button
                      onClick={() => setActiveScreen(s.name)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        activeScreen === s.name
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      {s.navLabel}
                    </button>
                  </li>
                ))}
              </ul>
              {spec && (
                <div className="mt-2 border-t pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => activeScreen && generateScreens(activeScreen)}
                    className="w-full justify-start"
                  >
                    Regenerate this screen
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="uppercase tracking-wide text-muted-foreground">
                Live demo · {activeSpec.title}
              </span>
              <Badge variant="muted">{activeSpec.blocks.length} blocks</Badge>
            </div>
            <div className="mb-2 space-y-2 rounded-md border bg-muted/30 p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void editActiveScreen();
                    }
                  }}
                  placeholder={
                    selectedBlocks.length > 0
                      ? `Edit ${selectedBlocks.length} selected block${selectedBlocks.length > 1 ? "s" : ""} — what should change?`
                      : `Edit ${activeSpec.title} — e.g. "make the hero blue and add a stats block"`
                  }
                  className="h-9 flex-1 bg-background"
                />
                <Button
                  size="sm"
                  onClick={editActiveScreen}
                  disabled={
                    !editInstruction.trim() ||
                    (!!screensJobId && screensJob?.status === "RUNNING")
                  }
                >
                  AI edit
                </Button>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {selectedBlocks.length > 0 ? (
                    <>
                      <span className="font-medium text-foreground">
                        {selectedBlocks.length} selected
                      </span>{" "}
                      · drag-select or click blocks · shift-click to add
                    </>
                  ) : (
                    <>Click a block or drag a rectangle to select what AI edits should target.</>
                  )}
                </span>
                {selectedBlocks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedBlocks([])}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
            <LaptopFrame title={`${bundle.appName} — ${activeSpec.title}`}>
              <SelectionMarquee
                className="p-6"
                onMarqueeSelect={applyMarqueeHits}
                onBackgroundClick={() => setSelectedBlocks([])}
              >
                <div ref={dragContainerRef} data-drag-container>
                  <BlockRenderer
                    spec={activeSpec}
                    screenIndex={screenIndex}
                    onNavigate={(name) => setActiveScreen(name)}
                    selectable
                    selectedIndices={selectedBlocks}
                    onToggleSelect={(i, ev) => toggleBlock(i, ev.shiftKey || ev.metaKey)}
                    draggable
                    draggingIndex={draggingIndex}
                    dropTargetIndex={dropTargetIndex}
                    onBlockDragStart={startBlockDrag}
                  />
                </div>
              </SelectionMarquee>
            </LaptopFrame>
          </div>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    No screens rendered yet — click <strong>Generate all screens</strong>.
                  </p>
                )}
              </>
            )}

            <StepNav
              onBack={() => setActiveStep(0)}
              onNext={() => setActiveStep(2)}
              nextLabel="Next: publish & share"
              nextDisabled={!screensDone}
              hint={!screensDone ? "Generate the screens to continue." : undefined}
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
              title="Publish & share the demo"
              description="Push the current screens to a public URL anyone can open in the browser. Use this to share with teammates or stakeholders."
            />

            {!bundle ? (
              <p className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Generate the screens in step 2 first.
              </p>
            ) : (
              <div className="space-y-3 rounded-md border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={publish} disabled={publishing}>
                    {publishing ? "Publishing…" : shareUrl ? "Re-publish demo" : "Publish demo"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Re-publish after edits to update the live link.
                  </span>
                </div>
                {shareUrl && (
                  <div className="rounded-md border bg-background p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Share link
                    </div>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block break-all text-primary underline-offset-4 hover:underline"
                    >
                      {shareUrl}
                    </a>
                  </div>
                )}
              </div>
            )}

            <StepNav onBack={() => setActiveStep(1)} backLabel="Back to screens" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
