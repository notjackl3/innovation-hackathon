"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PublishDemoButton({
  trackId,
  bundleArtifactId,
}: {
  trackId: string;
  bundleArtifactId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    const res = await fetch(`/api/tracks/${trackId}/software/demo/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleArtifactId }),
    });
    setBusy(false);
    if (!res.ok) return;
    const data = (await res.json()) as { url: string };
    setUrl(data.url);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={publish} disabled={busy}>
        {busy ? "Publishing…" : "Publish new share link"}
      </Button>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
          {url} ↗
        </a>
      )}
    </div>
  );
}
