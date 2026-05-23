import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdeaBriefSchema, IdeaScoresSchema } from "@/lib/schemas/idea";
import { IdeaTriagePanel } from "@/components/ideas/triage-panel";
import { TrackLauncher } from "@/components/ideas/track-launcher";

export const dynamic = "force-dynamic";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: { company: true, tracks: true },
  });
  if (!idea) notFound();

  const brief = idea.briefJson ? IdeaBriefSchema.safeParse(JSON.parse(idea.briefJson)).data : null;
  const scoresParsed = idea.scoresJson ? IdeaScoresSchema.safeParse(JSON.parse(idea.scoresJson)) : null;
  const scores = scoresParsed?.success ? scoresParsed.data : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href={`/companies/${idea.companyId}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← {idea.company.name}
      </Link>
      <div className="mt-1 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{idea.title}</h1>
          <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
            {idea.rawInput}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{idea.status}</Badge>
          {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
        </div>
      </div>

      <IdeaTriagePanel ideaId={idea.id} triaged={!!idea.primaryType} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Idea brief</CardTitle>
          </CardHeader>
          <CardContent>
            {brief ? (
              <dl className="space-y-3 text-sm">
                <Row label="Problem" value={brief.problem} />
                <Row label="Audience" value={brief.audience} />
                <Row label="Key features" value={brief.keyFeatures.join(" · ")} />
                <Row label="Success metric" value={brief.successMetric} />
                <Row label="Risks" value={brief.risks.join(" · ")} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Run triage to populate the brief.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            {scores ? (
              <div className="space-y-3">
                <ScoreRow label="Market fit" score={scores.marketFit.score} rationale={scores.marketFit.rationale} />
                <ScoreRow label="Feasibility" score={scores.feasibility.score} rationale={scores.feasibility.rationale} />
                <ScoreRow label="Novelty" score={scores.novelty.score} rationale={scores.novelty.rationale} />
                <ScoreRow label="Brand alignment" score={scores.brandAlignment.score} rationale={scores.brandAlignment.rationale} />
                {scores.recommendation && (
                  <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="font-semibold">Recommendation:</span> {scores.recommendation}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No scores yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <TrackLauncher
          ideaId={idea.id}
          existing={idea.tracks.map((t) => ({ id: t.id, kind: t.kind, status: t.status }))}
        />
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function ScoreRow({ label, score, rationale }: { label: string; score: number; rationale: string }) {
  const pct = Math.round((score / 10) * 100);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{score.toFixed(1)} / 10</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{rationale}</p>
    </div>
  );
}
