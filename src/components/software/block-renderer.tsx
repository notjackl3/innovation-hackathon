"use client";

/**
 * Safe block renderer. Every block kind maps to a fixed component below.
 * The renderer never executes LLM-generated JavaScript or evaluates any
 * unknown component identifier. Blocks that don't match a known type are
 * silently dropped (with a visible badge in dev for debuggability).
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { safeParseBlocks, type Block, type ScreenSpec } from "@/lib/schemas/screen";
import { isInteractiveTarget } from "./interaction-utils";

interface RendererProps {
  spec: ScreenSpec;
  onNavigate: (screenName: string) => void;
  screenIndex: Record<string, ScreenSpec>;
  /**
   * When true, each block is wrapped in a selection-aware container so the
   * marquee in the workspace can find it via `data-block-index`. A click on
   * the wrapper toggles selection via onToggleSelect.
   */
  selectable?: boolean;
  selectedIndices?: number[];
  onToggleSelect?: (index: number, ev: React.MouseEvent) => void;
  /**
   * When true, each wrapper renders a drag handle (⋮⋮) in the corner; pointer
   * events on the handle are routed to the workspace's drag manager via
   * onBlockDragStart. While a drag is in progress, the workspace sets
   * draggingIndex (which block is being moved) and dropTargetIndex (the
   * insertion slot — an indicator line appears before that index, or after
   * the last block when dropTargetIndex === blocks.length).
   */
  draggable?: boolean;
  draggingIndex?: number | null;
  dropTargetIndex?: number | null;
  onBlockDragStart?: (index: number, ev: React.PointerEvent<HTMLElement>) => void;
}

export function BlockRenderer({
  spec,
  onNavigate,
  screenIndex,
  selectable = false,
  selectedIndices,
  onToggleSelect,
  draggable = false,
  draggingIndex = null,
  dropTargetIndex = null,
  onBlockDragStart,
}: RendererProps) {
  const blocks = useMemo(() => safeParseBlocks(spec.blocks), [spec.blocks]);
  const selectedSet = useMemo(() => new Set(selectedIndices ?? []), [selectedIndices]);

  return (
    <div className="flex flex-col gap-4" data-block-list>
      {blocks.length === 0 && (
        <Badge variant="warn">No valid blocks on this screen.</Badge>
      )}
      {blocks.map((block, i) => {
        const view = (
          <BlockView
            block={block}
            onNavigate={onNavigate}
            screenIndex={screenIndex}
          />
        );
        if (!selectable) return <div key={`${spec.name}-${i}`}>{view}</div>;
        const isSelected = selectedSet.has(i);
        const isDragging = draggingIndex === i;
        const showInsertionBefore = dropTargetIndex === i && draggingIndex !== null && draggingIndex !== i;
        return (
          <div key={`${spec.name}-${i}`} className="group relative">
            {showInsertionBefore && (
              <div
                data-drop-indicator
                aria-hidden
                className="absolute -top-2 left-0 right-0 h-0.5 rounded-full bg-primary"
              />
            )}
            <div
              data-block-index={i}
              onClick={(ev) => {
                if (isInteractiveTarget(ev.target)) return;
                onToggleSelect?.(i, ev);
              }}
              className={`relative rounded-xl transition ${
                isDragging ? "opacity-30" : ""
              } ${
                isSelected
                  ? "outline outline-2 outline-primary outline-offset-2"
                  : "hover:outline hover:outline-1 hover:outline-muted-foreground/40 hover:outline-offset-2"
              } cursor-pointer`}
              aria-selected={isSelected}
            >
              {isSelected && (
                <span className="pointer-events-none absolute -top-2 left-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  #{i}
                </span>
              )}
              {draggable && (
                <button
                  type="button"
                  data-drag-handle
                  data-drag-index={i}
                  onPointerDown={(ev) => onBlockDragStart?.(i, ev)}
                  onClick={(ev) => ev.stopPropagation()}
                  aria-label={`Drag block ${i}`}
                  className="absolute right-2 top-2 z-20 grid h-6 w-6 cursor-grab place-items-center rounded border border-border bg-background/90 text-muted-foreground opacity-0 shadow-sm transition group-hover:opacity-100 active:cursor-grabbing"
                >
                  <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden>
                    <circle cx="2" cy="2" r="1.2" fill="currentColor" />
                    <circle cx="8" cy="2" r="1.2" fill="currentColor" />
                    <circle cx="2" cy="7" r="1.2" fill="currentColor" />
                    <circle cx="8" cy="7" r="1.2" fill="currentColor" />
                    <circle cx="2" cy="12" r="1.2" fill="currentColor" />
                    <circle cx="8" cy="12" r="1.2" fill="currentColor" />
                  </svg>
                </button>
              )}
              {view}
            </div>
          </div>
        );
      })}
      {/* Insertion indicator AFTER the last block (drop at end). */}
      {selectable && draggingIndex !== null && dropTargetIndex === blocks.length && (
        <div
          data-drop-indicator
          aria-hidden
          className="relative -mt-2 h-0.5 rounded-full bg-primary"
        />
      )}
    </div>
  );
}

function BlockView({
  block,
  onNavigate,
  screenIndex,
}: {
  block: Block;
  onNavigate: (s: string) => void;
  screenIndex: Record<string, ScreenSpec>;
}) {
  switch (block.type) {
    case "Hero":
      return (
        <section className="rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-6">
          <h2 className="text-2xl font-semibold tracking-tight">{block.headline}</h2>
          {block.sub && <p className="mt-1 text-sm text-muted-foreground">{block.sub}</p>}
          {block.ctaLabel && (
            <Button
              size="sm"
              className="mt-4"
              disabled={!block.ctaTo || !screenIndex[block.ctaTo]}
              onClick={() => block.ctaTo && onNavigate(block.ctaTo)}
            >
              {block.ctaLabel}
            </Button>
          )}
        </section>
      );

    case "Stats":
      return (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {block.items.map((it, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{it.value}</div>
              {it.delta && <div className="mt-0.5 text-xs text-emerald-600">{it.delta}</div>}
            </div>
          ))}
        </section>
      );

    case "Table":
      return (
        <section className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.columns.map((c, i) => (
                  <th key={i} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );

    case "Form":
      return (
        <section className="space-y-4 rounded-lg border bg-card p-5">
          {block.fields.map((f, i) => (
            <div key={i} className="space-y-1.5">
              <Label>{f.label}</Label>
              {f.kind === "textarea" ? (
                <Textarea placeholder={f.label} />
              ) : f.kind === "select" ? (
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {(f.options ?? []).map((o, k) => (
                    <option key={k}>{o}</option>
                  ))}
                </select>
              ) : (
                <Input placeholder={f.label} />
              )}
            </div>
          ))}
          <Button
            size="sm"
            disabled={!block.submitTo || !screenIndex[block.submitTo]}
            onClick={() => block.submitTo && onNavigate(block.submitTo)}
          >
            {block.submitLabel}
          </Button>
        </section>
      );

    case "Chart":
      return <ChartBlockView block={block} />;

    case "Card":
      return (
        <section className="rounded-lg border bg-card p-5">
          <div className="text-sm font-semibold">{block.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{block.body}</p>
          {block.ctaLabel && (
            <Button
              size="sm"
              className="mt-3"
              variant="outline"
              disabled={!block.ctaTo || !screenIndex[block.ctaTo]}
              onClick={() => block.ctaTo && onNavigate(block.ctaTo)}
            >
              {block.ctaLabel}
            </Button>
          )}
        </section>
      );

    case "List":
      return (
        <section className="overflow-hidden rounded-lg border bg-card">
          <ul className="divide-y">
            {block.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{it.title}</div>
                  {it.sub && <div className="text-xs text-muted-foreground">{it.sub}</div>}
                </div>
                {it.to && screenIndex[it.to] && (
                  <Button size="sm" variant="ghost" onClick={() => onNavigate(it.to!)}>
                    Open
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      );

    case "Detail":
      return (
        <section className="rounded-lg border bg-card p-5">
          <h3 className="text-lg font-semibold">{block.title}</h3>
          <div className="mt-3 space-y-3">
            {block.sections.map((s, i) => (
              <div key={i}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.heading}</div>
                <p className="text-sm">{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      );
  }
}

function ChartBlockView({ block }: { block: Extract<Block, { type: "Chart" }> }) {
  const max = Math.max(1, ...block.series.flatMap((s) => s.data));
  const height = 140;
  const width = 360;
  const padding = 24;
  const cols = block.xLabels.length || block.series[0]?.data.length || 1;
  const colW = (width - padding * 2) / Math.max(1, cols);

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
        {block.kind === "bar" ? "Bar chart" : "Line chart"}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {block.series.map((s, si) => {
          const color = si === 0 ? "hsl(var(--primary))" : si === 1 ? "hsl(var(--secondary))" : "#888";
          if (block.kind === "bar") {
            return (
              <g key={si}>
                {s.data.map((v, i) => {
                  const x = padding + i * colW + (si * colW) / block.series.length;
                  const h = (v / max) * (height - padding * 2);
                  return (
                    <rect
                      key={i}
                      x={x + 2}
                      y={height - padding - h}
                      width={Math.max(2, colW / block.series.length - 4)}
                      height={h}
                      fill={color}
                      opacity={0.85}
                    />
                  );
                })}
              </g>
            );
          }
          // line
          const points = s.data
            .map((v, i) => {
              const x = padding + i * colW + colW / 2;
              const y = height - padding - (v / max) * (height - padding * 2);
              return `${x},${y}`;
            })
            .join(" ");
          return <polyline key={si} fill="none" stroke={color} strokeWidth="2" points={points} />;
        })}
        {block.xLabels.map((l, i) => (
          <text
            key={i}
            x={padding + i * colW + colW / 2}
            y={height - 4}
            fontSize="9"
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
          >
            {l}
          </text>
        ))}
      </svg>
    </section>
  );
}
