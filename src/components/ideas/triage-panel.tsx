"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { JobProgress, useJob } from "@/components/shared/job-progress";

export function IdeaTriagePanel({ ideaId, triaged }: { ideaId: string; triaged: boolean }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);

  async function rerun() {
    const res = await fetch(`/api/ideas/${ideaId}/triage`, { method: "POST" });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setJobId(jobId);
  }

  useEffect(() => {
    if (job?.status === "SUCCEEDED") router.refresh();
  }, [job?.status, router]);

  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
      <div className="text-sm">
        {triaged ? "Triaged." : "This idea has not been triaged yet."}
      </div>
      <div className="flex items-center gap-3">
        {jobId && <JobProgress job={job} className="w-40" />}
        <Button size="sm" onClick={rerun}>
          {triaged ? "Re-run triage" : "Triage now"}
        </Button>
      </div>
    </div>
  );
}
