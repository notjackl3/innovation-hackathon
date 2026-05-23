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

interface RendererProps {
  spec: ScreenSpec;
  onNavigate: (screenName: string) => void;
  screenIndex: Record<string, ScreenSpec>;
}

export function BlockRenderer({ spec, onNavigate, screenIndex }: RendererProps) {
  const blocks = useMemo(() => safeParseBlocks(spec.blocks), [spec.blocks]);

  return (
    <div className="flex flex-col gap-4">
      {blocks.length === 0 && (
        <Badge variant="warn">No valid blocks on this screen.</Badge>
      )}
      {blocks.map((block, i) => (
        <BlockView key={`${spec.name}-${i}`} block={block} onNavigate={onNavigate} screenIndex={screenIndex} />
      ))}
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
