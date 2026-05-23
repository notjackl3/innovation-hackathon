"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JobProgress, useJob } from "./job-progress";

interface Doc {
  id: string;
  filename: string;
  kind: string;
  summary: string | null;
  createdAt: string;
}

export function DocumentManager({ companyId, initialDocs }: { companyId: string; initialDocs: Doc[] }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [pasted, setPasted] = useState("");
  const [filename, setFilename] = useState("");
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const job = useJob(activeJob);

  useEffect(() => {
    if (job?.status === "SUCCEEDED") {
      void refresh();
    }
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    const res = await fetch(`/api/companies/${companyId}/documents`);
    if (res.ok) setDocs(await res.json());
    router.refresh();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/companies/${companyId}/documents`, {
      method: "POST",
      body: form,
    });
    setUploading(false);
    if (!res.ok) return;
    const { jobId } = (await res.json()) as { jobId: string };
    setActiveJob(jobId);
    await refresh();
  }

  async function uploadText() {
    if (!pasted.trim()) return;
    setUploading(true);
    const res = await fetch(`/api/companies/${companyId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pasted, filename: filename || "note.txt" }),
    });
    setUploading(false);
    if (!res.ok) return;
    setPasted("");
    setFilename("");
    const { jobId } = (await res.json()) as { jobId: string };
    setActiveJob(jobId);
    await refresh();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border border-dashed p-4">
        <label className="flex flex-col items-start gap-2 text-sm">
          <span className="font-medium">Upload PDF</span>
          <Input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
        </label>
        <div className="text-xs text-muted-foreground">or paste raw text:</div>
        <Input
          placeholder="Filename (optional)"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
        />
        <Textarea
          placeholder="Paste anything…"
          rows={4}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="flex justify-end">
          <Button onClick={uploadText} disabled={uploading || !pasted.trim()} size="sm">
            {uploading ? "Uploading…" : "Add note"}
          </Button>
        </div>
      </div>

      {activeJob && <JobProgress job={job} className="rounded-md border bg-muted/40 p-3" />}

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={d.id} className="space-y-1 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.filename}</span>
                <Badge variant="outline" className="uppercase">{d.kind}</Badge>
              </div>
              {d.summary && <p className="text-xs text-muted-foreground">{d.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
