"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Input } from "@/components/ui/input";
import type { Block, DemoBundle, ProductSpec, ScreenSpec } from "@/lib/schemas/screen";
import type { Rename } from "@/lib/pipelines/propagate-spec-changes";

interface BlueprintCanvasProps {
  spec: ProductSpec;
  bundle: DemoBundle | null;
  /**
   * Called whenever the user commits a structural change (rename, add,
   * delete, reorder). Should persist to the server and re-fetch state. The
   * canvas optimistically reflects the change before this resolves and
   * reverts if the promise rejects.
   */
  onCommit: (newScreens: string[], renames: Rename[]) => Promise<void>;
  /**
   * When provided, the named screen gets an "Active" pill. Clicking a card
   * focuses that screen elsewhere in the workspace.
   */
  activeScreen?: string | null;
  onSelectScreen?: (name: string) => void;
}

interface RefData {
  name: string;
  rect: DOMRect;
}

/** Strip a CTA/ref target list from one screen for arrow-drawing. */
function refsFromScreen(screen: ScreenSpec): string[] {
  const out: string[] = [];
  for (const block of screen.blocks) {
    if (block.type === "Hero" && block.ctaTo) out.push(block.ctaTo);
    if (block.type === "Card" && block.ctaTo) out.push(block.ctaTo);
    if (block.type === "Form" && block.submitTo) out.push(block.submitTo);
    if (block.type === "List") {
      for (const item of block.items) if (item.to) out.push(item.to);
    }
  }
  return out;
}

/** Color hint per block type — used to render skeleton stripes inside cards. */
function stripeColor(type: Block["type"]): string {
  switch (type) {
    case "Hero":
      return "bg-orange-400/70";
    case "Stats":
      return "bg-emerald-400/70";
    case "Table":
      return "bg-slate-400/70";
    case "Form":
      return "bg-blue-400/70";
    case "Chart":
      return "bg-purple-400/70";
    case "Card":
      return "bg-amber-400/70";
    case "List":
      return "bg-cyan-400/70";
    case "Detail":
      return "bg-rose-400/70";
  }
}

function blocksForName(bundle: DemoBundle | null, name: string): Block[] | null {
  if (!bundle) return null;
  const s = bundle.screens.find((x) => x.name === name);
  return s?.blocks ?? null;
}

export function BlueprintCanvas({
  spec,
  bundle,
  onCommit,
  activeScreen,
  onSelectScreen,
}: BlueprintCanvasProps) {
  // Optimistic local state. Server is the source of truth on reload.
  const [localScreens, setLocalScreens] = useState<string[]>(spec.screens);
  const [pendingRenames, setPendingRenames] = useState<Rename[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [draftAdd, setDraftAdd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Re-sync from props when the server updates (e.g. after PATCH refresh).
  useEffect(() => {
    setLocalScreens(spec.screens);
    setPendingRenames([]);
    setEditingIndex(null);
  }, [spec.screens]);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rowRef = useRef<HTMLDivElement>(null);
  const [arrowPaths, setArrowPaths] = useState<string[]>([]);

  // --- Commit helper -----------------------------------------------------
  const commit = useCallback(
    async (nextScreens: string[], nextRenames: Rename[]) => {
      const prevScreens = localScreens;
      const prevRenames = pendingRenames;
      setLocalScreens(nextScreens);
      setPendingRenames(nextRenames);
      setError(null);
      try {
        await onCommit(nextScreens, nextRenames);
      } catch (err) {
        setLocalScreens(prevScreens);
        setPendingRenames(prevRenames);
        setError(err instanceof Error ? err.message : "Save failed");
      }
    },
    [onCommit, localScreens, pendingRenames]
  );

  // --- Rename ------------------------------------------------------------
  function startEdit(i: number) {
    setEditingIndex(i);
    setEditingValue(localScreens[i]);
  }
  async function commitEdit() {
    if (editingIndex === null) return;
    const i = editingIndex;
    const next = editingValue.trim();
    setEditingIndex(null);
    if (!next || next === localScreens[i]) return;
    if (localScreens.includes(next)) {
      setError(`A screen named "${next}" already exists.`);
      return;
    }
    const oldName = localScreens[i];
    const nextScreens = localScreens.map((s, k) => (k === i ? next : s));
    // Chain rename: if oldName was already a rename target, update the
    // existing rename's `to`. Otherwise append.
    const existingIdx = pendingRenames.findIndex((r) => r.to === oldName);
    let nextRenames: Rename[];
    if (existingIdx >= 0) {
      nextRenames = pendingRenames.slice();
      nextRenames[existingIdx] = { ...nextRenames[existingIdx], to: next };
    } else if (spec.screens.includes(oldName)) {
      nextRenames = [...pendingRenames, { from: oldName, to: next }];
    } else {
      // oldName is a locally-added screen; renaming it locally needs no
      // server-side rename mapping — server treats it as add+drop of the
      // old, add of the new. To keep the API contract clean we just send
      // the new screens list with no rename entry.
      nextRenames = pendingRenames;
    }
    await commit(nextScreens, nextRenames);
  }
  async function deleteAt(i: number) {
    const oldName = localScreens[i];
    const nextScreens = localScreens.filter((_, k) => k !== i);
    if (nextScreens.length === 0) {
      setError("At least one screen is required.");
      return;
    }
    const nextRenames = pendingRenames.filter((r) => r.to !== oldName);
    await commit(nextScreens, nextRenames);
  }
  async function addScreen() {
    const next = draftAdd.trim();
    if (!next) return;
    if (localScreens.includes(next)) {
      setError(`A screen named "${next}" already exists.`);
      return;
    }
    setDraftAdd("");
    await commit([...localScreens, next], pendingRenames);
  }

  // --- Drag-to-reorder (horizontal) --------------------------------------
  function onCardDragStart(i: number, ev: React.PointerEvent) {
    if (editingIndex !== null) return;
    ev.preventDefault();
    setDraggingIndex(i);
    setDropTargetIndex(i);
  }
  useEffect(() => {
    if (draggingIndex === null) return;
    function readCardMids(): number[] {
      const row = rowRef.current;
      if (!row) return [];
      const rowRect = row.getBoundingClientRect();
      const nodes = row.querySelectorAll<HTMLElement>("[data-blueprint-card]");
      return Array.from(nodes).map((n) => {
        const r = n.getBoundingClientRect();
        return (r.left + r.right) / 2 - rowRect.left;
      });
    }
    function onMove(ev: PointerEvent) {
      const row = rowRef.current;
      if (!row) return;
      const rowRect = row.getBoundingClientRect();
      const cursorX = ev.clientX - rowRect.left;
      const mids = readCardMids();
      let target = mids.length;
      for (let i = 0; i < mids.length; i++) {
        if (cursorX < mids[i]) {
          target = i;
          break;
        }
      }
      setDropTargetIndex(target);
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
    if (to === from || to === from + 1) return;
    const next = localScreens.slice();
    const [moved] = next.splice(from, 1);
    const insertAt = to > from ? to - 1 : to;
    next.splice(insertAt, 0, moved);
    await commit(next, pendingRenames);
  }

  // --- Arrow drawing (CTA refs → curves) ---------------------------------
  const recomputeArrows = useCallback(() => {
    const row = rowRef.current;
    if (!row || !bundle) {
      setArrowPaths([]);
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const data: RefData[] = [];
    for (const name of localScreens) {
      const node = cardRefs.current[name];
      if (!node) continue;
      data.push({ name, rect: node.getBoundingClientRect() });
    }
    const byName = new Map(data.map((d) => [d.name, d]));
    const paths: string[] = [];
    for (const screen of bundle.screens) {
      const src = byName.get(screen.name);
      if (!src) continue;
      const refs = Array.from(new Set(refsFromScreen(screen)));
      for (const target of refs) {
        const dst = byName.get(target);
        if (!dst || dst.name === src.name) continue;
        // Source right midpoint → target left midpoint (in row-local coords).
        const sx = src.rect.right - rowRect.left;
        const sy = src.rect.top + src.rect.height / 2 - rowRect.top;
        const dx = dst.rect.left - rowRect.left;
        const dy = dst.rect.top + dst.rect.height / 2 - rowRect.top;
        const ctrl = Math.max(40, Math.abs(dx - sx) / 2);
        paths.push(`M ${sx} ${sy} C ${sx + ctrl} ${sy}, ${dx - ctrl} ${dy}, ${dx} ${dy}`);
      }
    }
    setArrowPaths(paths);
  }, [bundle, localScreens]);

  useLayoutEffect(() => {
    recomputeArrows();
  }, [recomputeArrows, dropTargetIndex, draggingIndex, editingIndex]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const row = rowRef.current;
    if (!row) return;
    const obs = new ResizeObserver(() => recomputeArrows());
    obs.observe(row);
    return () => obs.disconnect();
  }, [recomputeArrows]);

  // --- Derived state -----------------------------------------------------
  const startScreen = bundle?.startScreen;
  const headerCount = localScreens.length;

  return (
    <section
      data-blueprint
      className="space-y-3 rounded-lg border bg-background p-4"
      aria-label="App blueprint"
    >
      <header className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Blueprint
          </h4>
          <p className="text-xs text-muted-foreground">
            Rename, add, delete, and reorder screens. Changes flow into the
            generated app — edits to a name update every CTA pointing at it.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {headerCount} screen{headerCount === 1 ? "" : "s"}
        </span>
      </header>

      {error && (
        <div role="alert" className="rounded border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div ref={rowRef} className="relative">
        {arrowPaths.length > 0 && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          >
            <defs>
              <marker
                id="bp-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            <g className="text-muted-foreground/60">
              {arrowPaths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  markerEnd="url(#bp-arrow)"
                />
              ))}
            </g>
          </svg>
        )}

        <div className="relative z-10 flex flex-wrap items-stretch gap-3 pb-1">
          {localScreens.map((name, i) => {
            const blocks = blocksForName(bundle, name);
            const isActive = activeScreen === name;
            const isStart = startScreen === name;
            const isDragging = draggingIndex === i;
            const showIndicator =
              dropTargetIndex === i &&
              draggingIndex !== null &&
              draggingIndex !== i;
            return (
              <div key={name} className="flex items-stretch">
                {showIndicator && (
                  <div
                    data-blueprint-drop-indicator
                    aria-hidden
                    className="mr-1 w-0.5 self-stretch rounded-full bg-primary"
                  />
                )}
                <div
                  ref={(el) => {
                    cardRefs.current[name] = el;
                  }}
                  data-blueprint-card
                  data-screen-name={name}
                  className={`relative w-[180px] shrink-0 rounded-lg border bg-card p-3 text-left transition ${
                    isDragging ? "opacity-40" : ""
                  } ${
                    isActive
                      ? "ring-2 ring-primary"
                      : "hover:ring-1 hover:ring-muted-foreground/40"
                  }`}
                >
                  {/* Header row: name (or input) + delete */}
                  <div className="flex items-center justify-between gap-1">
                    {editingIndex === i ? (
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => void commitEdit()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitEdit();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingIndex(null);
                          }
                        }}
                        className="h-7 flex-1 text-xs"
                        data-blueprint-rename-input
                      />
                    ) : (
                      <button
                        type="button"
                        data-blueprint-name
                        onClick={() => onSelectScreen?.(name)}
                        onDoubleClick={() => startEdit(i)}
                        className="flex-1 truncate text-left text-sm font-medium hover:text-primary"
                        title="Double-click to rename"
                      >
                        {name}
                      </button>
                    )}
                    <button
                      type="button"
                      data-blueprint-delete
                      aria-label={`Delete ${name}`}
                      onClick={() => void deleteAt(i)}
                      className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                        <path
                          d="M2 2 L8 8 M8 2 L2 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Pills */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {isStart && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
                        Start
                      </span>
                    )}
                    {!blocks && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                        Not built
                      </span>
                    )}
                  </div>

                  {/* Skeleton stripes */}
                  <div className="mt-3 space-y-1.5" data-blueprint-skeleton>
                    {blocks
                      ? blocks.slice(0, 5).map((b, k) => (
                          <div
                            key={k}
                            data-block-type={b.type}
                            className={`h-1.5 rounded ${stripeColor(b.type)} ${
                              b.type === "Hero" ? "w-full" : k % 2 ? "w-4/5" : "w-3/5"
                            }`}
                          />
                        ))
                      : Array.from({ length: 4 }).map((_, k) => (
                          <div
                            key={k}
                            className={`h-1.5 rounded bg-muted ${k % 2 ? "w-4/5" : "w-3/5"}`}
                          />
                        ))}
                  </div>

                  {/* Footer: drag handle */}
                  <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                    <button
                      type="button"
                      data-blueprint-drag-handle
                      data-drag-handle
                      onPointerDown={(ev) => onCardDragStart(i, ev)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Drag ${name}`}
                      className="cursor-grab rounded p-0.5 hover:bg-muted active:cursor-grabbing"
                    >
                      <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden>
                        <circle cx="2" cy="2" r="1.1" fill="currentColor" />
                        <circle cx="6" cy="2" r="1.1" fill="currentColor" />
                        <circle cx="10" cy="2" r="1.1" fill="currentColor" />
                        <circle cx="2" cy="6" r="1.1" fill="currentColor" />
                        <circle cx="6" cy="6" r="1.1" fill="currentColor" />
                        <circle cx="10" cy="6" r="1.1" fill="currentColor" />
                      </svg>
                    </button>
                    <span>#{i + 1}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Insertion indicator at the very end */}
          {draggingIndex !== null && dropTargetIndex === localScreens.length && (
            <div
              data-blueprint-drop-indicator
              aria-hidden
              className="self-stretch w-0.5 rounded-full bg-primary"
            />
          )}

          {/* Add-new tile */}
          <div className="flex w-[180px] shrink-0 flex-col rounded-lg border border-dashed bg-muted/30 p-3">
            <span className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add screen
            </span>
            <Input
              value={draftAdd}
              onChange={(e) => setDraftAdd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addScreen();
                }
              }}
              placeholder="e.g. ReceiptDetail"
              className="h-7 text-xs"
              data-blueprint-add-input
            />
            <button
              type="button"
              data-blueprint-add-btn
              onClick={() => void addScreen()}
              disabled={!draftAdd.trim()}
              className="mt-2 rounded border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              + Add
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
