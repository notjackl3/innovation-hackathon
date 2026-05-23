"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Kind = "PRODUCT" | "SERVICE" | "SOFTWARE";

interface ExistingTrack { id: string; kind: string; status: string }

export function TrackLauncher({
  ideaId,
  existing,
}: {
  ideaId: string;
  existing: ExistingTrack[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Kind | null>(null);

  async function addTrack(kind: Kind) {
    const found = existing.find((t) => t.kind === kind);
    if (found) {
      router.push(routeFor(kind, found.id));
      return;
    }
    setBusy(kind);
    const res = await fetch(`/api/ideas/${ideaId}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setBusy(null);
    if (!res.ok) return;
    const { id } = (await res.json()) as { id: string };
    router.push(routeFor(kind, id));
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <TrackCard
        kind="PRODUCT"
        title="Product"
        desc="Sketch → 3D model"
        accent="from-amber-500/20 to-amber-500/0"
        existing={existing.find((t) => t.kind === "PRODUCT")}
        onClick={() => addTrack("PRODUCT")}
        busy={busy === "PRODUCT"}
      />
      <TrackCard
        kind="SERVICE"
        title="Service"
        desc="Storyboard → animated demo"
        accent="from-emerald-500/20 to-emerald-500/0"
        existing={existing.find((t) => t.kind === "SERVICE")}
        onClick={() => addTrack("SERVICE")}
        busy={busy === "SERVICE"}
      />
      <TrackCard
        kind="SOFTWARE"
        title="Software"
        desc="Screen spec → click-through demo"
        accent="from-sky-500/20 to-sky-500/0"
        existing={existing.find((t) => t.kind === "SOFTWARE")}
        onClick={() => addTrack("SOFTWARE")}
        busy={busy === "SOFTWARE"}
      />
    </div>
  );
}

function routeFor(kind: string, trackId: string) {
  if (kind === "PRODUCT") return `/tracks/${trackId}/product`;
  if (kind === "SERVICE") return `/tracks/${trackId}/service`;
  return `/tracks/${trackId}/software`;
}

function TrackCard({
  kind,
  title,
  desc,
  accent,
  existing,
  onClick,
  busy,
}: {
  kind: Kind;
  title: string;
  desc: string;
  accent: string;
  existing?: ExistingTrack;
  onClick: () => void;
  busy: boolean;
}) {
  void kind;
  return (
    <Card className="overflow-hidden">
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          {title}
          {existing && <Badge variant="muted">{existing.status}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{desc}</p>
        <div className="mt-4">
          {existing ? (
            <Button asChild size="sm" variant="outline">
              <Link href={routeFor(existing.kind, existing.id)}>Open</Link>
            </Button>
          ) : (
            <Button size="sm" onClick={onClick} disabled={busy}>
              {busy ? "Adding…" : "Add this track"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
