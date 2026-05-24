"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { ResearchResult, CompanyCandidate } from "@/lib/schemas/research";
import Link from "next/link";

type Stage = "lookup" | "candidates" | "manual";

export default function NewCompanyPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("lookup");
  const [query, setQuery] = useState("");
  const [research, setResearch] = useState<ResearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualProfile, setManualProfile] = useState("");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/research/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: query }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.formErrors?.join(", ") ?? "Research failed");
      }
      const data = (await res.json()) as ResearchResult;
      setResearch(data);
      setManualName(query);
      setStage("candidates");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(candidate: CompanyCandidate) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.name,
          rawProfile: candidate.summary,
          brief: candidate.brief,
        }),
      });
      if (!res.ok) throw new Error("Failed to create company");
      const data = (await res.json()) as { id: string };
      router.push(`/companies/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function createManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: manualName, rawProfile: manualProfile }),
      });
      if (!res.ok) throw new Error("Failed to create company");
      const data = (await res.json()) as { id: string };
      router.push(`/companies/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Home</Link>
      </div>
      <Stepper stage={stage} />

      {stage === "lookup" && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Find your company</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={lookup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="q">Company name</Label>
                <Input
                  id="q"
                  value={query}
                  required
                  placeholder='e.g. "Tim Hortons", "Patagonia", "Notion"'
                  onChange={(e) => setQuery(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Our research agent will look up the company and pre-fill its brief.
                  You can also{" "}
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => setStage("manual")}
                  >
                    enter details manually
                  </button>
                  .
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || !query.trim()}>
                {busy ? "Researching…" : "Research"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {stage === "candidates" && research && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {research.candidates.length > 0
                ? `${research.candidates.length} match${research.candidates.length === 1 ? "" : "es"} for `
                : "No matches for "}
              <span className="italic">{research.query}</span>
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setStage("lookup")}>
              ← Search again
            </Button>
          </div>
          {research.notes && (
            <p className="text-xs italic text-muted-foreground">{research.notes}</p>
          )}
          {research.candidates.map((c, i) => (
            <CandidateCard key={i} candidate={c} onConfirm={() => confirm(c)} busy={busy} />
          ))}
          <Card className="border-dashed">
            <CardContent className="flex items-center justify-between p-4 text-sm">
              <span className="text-muted-foreground">None of these match?</span>
              <Button size="sm" variant="outline" onClick={() => setStage("manual")}>
                Enter manually
              </Button>
            </CardContent>
          </Card>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      {stage === "manual" && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Enter company manually</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createManual} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="mname">Company name</Label>
                <Input
                  id="mname"
                  value={manualName}
                  required
                  onChange={(e) => setManualName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mprofile">Profile</Label>
                <Textarea
                  id="mprofile"
                  rows={8}
                  value={manualProfile}
                  onChange={(e) => setManualProfile(e.target.value)}
                  placeholder="Paste industry, customers, brand voice, etc. (optional)"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy || !manualName.trim()}>
                  {busy ? "Creating…" : "Create company"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStage("lookup")}>
                  ← Back to research
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const steps =
    stage === "manual"
      ? [
          { label: "Lookup", active: false, done: true },
          { label: "Manual entry", active: true, done: false },
        ]
      : [
          { label: "Lookup", active: stage === "lookup", done: stage !== "lookup" },
          { label: "Confirm", active: stage === "candidates", done: false },
        ];
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
              s.active
                ? "border-primary bg-primary text-primary-foreground"
                : s.done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-muted-foreground/30 text-muted-foreground"
            }`}
          >
            {s.done ? "✓" : i + 1}
          </span>
          <span className={s.active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
        </li>
      ))}
    </ol>
  );
}

function CandidateCard({
  candidate,
  onConfirm,
  busy,
}: {
  candidate: CompanyCandidate;
  onConfirm: () => void;
  busy: boolean;
}) {
  const b = candidate.brief;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{candidate.name}</h3>
            {candidate.knownAs.length > 0 && (
              <p className="text-xs text-muted-foreground">also: {candidate.knownAs.join(", ")}</p>
            )}
            {b.industry && <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{b.industry}</p>}
          </div>
          <Badge variant={candidate.confidence === "high" ? "default" : candidate.confidence === "medium" ? "muted" : "outline"}>
            {candidate.confidence} confidence
          </Badge>
        </div>
        <p className="text-sm">{candidate.summary}</p>
        {b.oneLiner && (
          <p className="rounded-md bg-muted/50 p-2 text-sm italic">&ldquo;{b.oneLiner}&rdquo;</p>
        )}
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {b.valueProps.length > 0 && (
            <Field label="Value props">{b.valueProps.slice(0, 4).join(" · ")}</Field>
          )}
          {b.brandVoice.adjectives.length > 0 && (
            <Field label="Brand voice">{b.brandVoice.adjectives.slice(0, 4).join(", ")}</Field>
          )}
          {b.visualStyle.palette.length > 0 && (
            <Field label="Palette">
              <span className="flex flex-wrap items-center gap-1">
                {b.visualStyle.palette.slice(0, 6).map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
                    <span className="h-3 w-3 rounded" style={{ background: c }} />
                    <code className="text-[10px]">{c}</code>
                  </span>
                ))}
              </span>
            </Field>
          )}
          {b.customers.length > 0 && (
            <Field label="Customers">{b.customers.map((c) => c.segment).slice(0, 3).join(" · ")}</Field>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={onConfirm} disabled={busy}>
            Use this company →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}
