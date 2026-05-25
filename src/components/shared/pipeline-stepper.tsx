"use client";

import { Button } from "@/components/ui/button";

export type StepStatus = "pending" | "active" | "done";

export interface PipelineStep {
  key: string;
  label: string;
  hint?: string;
  done: boolean;
}

export function PipelineStepper({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: PipelineStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-stretch gap-2">
      {steps.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = s.done;
        return (
          <li key={s.key} className="flex flex-1 min-w-[160px] items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive ? "step" : undefined}
              className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                  : isDone
                    ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300"
                    : "border-dashed border-muted bg-muted/10 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/20"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.label}</span>
                {s.hint && (
                  <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function StepHeader({
  index,
  total,
  title,
  description,
}: {
  index: number;
  total: number;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
        Step {index + 1} of {total}
      </div>
      <h2 className="text-xl font-semibold leading-tight">{title}</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function StepNav({
  onBack,
  onNext,
  nextLabel,
  backLabel,
  nextDisabled,
  hint,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  hint?: string;
}) {
  if (!onBack && !onNext && !hint) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← {backLabel ?? "Back"}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {onNext && (
          <Button size="sm" onClick={onNext} disabled={nextDisabled}>
            {nextLabel ?? "Next"} →
          </Button>
        )}
      </div>
    </div>
  );
}
