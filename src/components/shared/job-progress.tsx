"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export interface JobSnapshot {
  id: string;
  kind: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  progress: number;
  logs: string[];
  output: unknown;
  error?: string | null;
}

export function useJob(jobId: string | null | undefined) {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (res.ok) {
        const data = (await res.json()) as JobSnapshot;
        setJob(data);
        if (data.status === "SUCCEEDED" || data.status === "FAILED") {
          if (!stop) timer = setTimeout(tick, 4000); // keep polling slowly in case of follow-ups
          return;
        }
      }
      if (!stop) timer = setTimeout(tick, 1500);
    }
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);
  return job;
}

export function JobProgress({ job, className }: { job: JobSnapshot | null; className?: string }) {
  if (!job) return null;
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{prettyKind(job.kind)}</span>
        <Badge variant={job.status === "SUCCEEDED" ? "success" : job.status === "FAILED" ? "destructive" : "muted"}>
          {job.status}
        </Badge>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${job.status === "SUCCEEDED" ? 100 : job.progress}%` }}
        />
      </div>
      {job.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
    </div>
  );
}

function prettyKind(k: string) {
  return k.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
