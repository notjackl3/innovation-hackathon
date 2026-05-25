"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useJob } from "@/components/shared/job-progress";

export function TriageRunner({
  ideaId,
  triaged,
  primaryType,
}: {
  ideaId: string;
  triaged: boolean;
  primaryType: string | null;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [autoStarted, setAutoStarted] = useState(false);
  const job = useJob(jobId);

  async function run() {
    const res = await fetch(`/api/ideas/${ideaId}/triage`, { method: "POST" });
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setJobId(jobId);
  }

  // Auto-trigger triage the first time the user lands here if it hasn't run yet.
  useEffect(() => {
    if (!triaged && !autoStarted) {
      setAutoStarted(true);
      void run();
    }
  }, [triaged, autoStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (job?.status === "SUCCEEDED") router.refresh();
  }, [job?.status, router]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {triaged ? "Classification complete" : "Classifying your idea…"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {triaged
              ? `Classified as ${primaryType}. Re-run if you want a fresh take.`
              : "Spark is reading the brief and routing it to the right pipeline."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant={triaged ? "outline" : "default"} onClick={run}>
            {triaged ? "Re-run triage" : "Run triage"}
          </Button>
          {triaged && (
            <Button asChild>
              <Link href={`/ideas/${ideaId}/generate`}>Next: Generate →</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
