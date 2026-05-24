"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Stage } from "./idea-stages";

interface Step {
  key: Stage;
  label: string;
  href: (ideaId: string) => string;
}

const STEPS: Step[] = [
  { key: "brief",    label: "Brief",    href: (id) => `/ideas/${id}/brief` },
  { key: "triage",   label: "Triage",   href: (id) => `/ideas/${id}/triage` },
  { key: "generate", label: "Generate", href: (id) => `/ideas/${id}/generate` },
  { key: "share",    label: "Share",    href: (id) => `/ideas/${id}/share` },
];

export function IdeaStepper({
  ideaId,
  completed,
}: {
  ideaId: string;
  /** Stages the user has reached/completed. Used to enable navigation. */
  completed: Record<Stage, boolean>;
}) {
  const pathname = usePathname();
  const activeIndex = STEPS.findIndex((s) => pathname?.endsWith(`/${s.key}`));

  return (
    <ol className="flex w-full items-center gap-1 rounded-xl border bg-card p-1.5 text-sm shadow-sm">
      {STEPS.map((step, i) => {
        const isActive = i === activeIndex;
        const isDone = completed[step.key];
        const reachable = i === 0 || completed[STEPS[i - 1].key] || isDone;

        const inner = (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
              isActive && "bg-primary text-primary-foreground",
              !isActive && reachable && "text-foreground hover:bg-accent",
              !reachable && "cursor-not-allowed text-muted-foreground/50",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold",
                isActive && "bg-white/20 text-primary-foreground",
                !isActive && isDone && "bg-emerald-600 text-white",
                !isActive && !isDone && "border border-muted-foreground/40 text-muted-foreground",
              )}
            >
              {isDone ? "✓" : i + 1}
            </span>
            <span className="font-medium">{step.label}</span>
          </div>
        );
        return (
          <li key={step.key} className="flex flex-1 items-center">
            {reachable ? (
              <Link href={step.href(ideaId)} className="flex-1">{inner}</Link>
            ) : (
              <div className="flex-1">{inner}</div>
            )}
            {i < STEPS.length - 1 && (
              <span className="px-1 text-muted-foreground/40">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

