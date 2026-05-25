"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  dismissJob,
  removeJob,
  useJobsStore,
  type JobItem,
} from "@/lib/jobs/jobs-store";

const AUTO_DISMISS_MS = 4000;

export function JobsPopup() {
  const items = useJobsStore();
  const [collapsed, setCollapsed] = useState(false);
  // tick re-renders so completedAt-based auto-dismiss fires even when no new
  // poll updates land.
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const now = Date.now();
    for (const it of items) {
      if (
        it.status === "SUCCEEDED" &&
        it.completedAt &&
        now - it.completedAt > AUTO_DISMISS_MS
      ) {
        removeJob(it.id);
      }
    }
  });

  const visible = useMemo(() => items.filter((x) => !x.dismissed), [items]);
  const runningCount = useMemo(
    () => visible.filter((x) => x.status === "RUNNING" || x.status === "QUEUED").length,
    [visible],
  );

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 overflow-hidden rounded-lg border bg-background shadow-lg">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between border-b px-3 py-2 text-left hover:bg-muted/40"
      >
        <span className="text-xs font-semibold">
          {runningCount > 0
            ? `Running ${runningCount} of ${visible.length}`
            : `${visible.length} task${visible.length === 1 ? "" : "s"}`}
        </span>
        <span className="text-xs text-muted-foreground">{collapsed ? "▴" : "▾"}</span>
      </button>
      {!collapsed && (
        <ul className="max-h-80 space-y-2 overflow-y-auto p-2">
          {visible.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
    </div>
  );
}

function JobRow({ job }: { job: JobItem }) {
  return (
    <li className="rounded-md border bg-card p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium">{prettyKind(job.kind)}</span>
        <div className="flex items-center gap-1">
          <Badge
            variant={
              job.status === "SUCCEEDED"
                ? "success"
                : job.status === "FAILED"
                  ? "destructive"
                  : "muted"
            }
          >
            {job.status}
          </Badge>
          <button
            type="button"
            onClick={() => dismissJob(job.id)}
            className="rounded p-1 text-xs text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${job.status === "FAILED" ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${job.status === "SUCCEEDED" ? 100 : job.progress}%` }}
        />
      </div>
      {job.error && <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{job.error}</p>}
    </li>
  );
}

function prettyKind(k: string) {
  return k.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
