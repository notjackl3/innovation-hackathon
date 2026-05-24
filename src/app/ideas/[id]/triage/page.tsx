import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdeaScoresSchema } from "@/lib/schemas/idea";
import { TriageRunner } from "@/components/ideas/triage-runner";

export const dynamic = "force-dynamic";

export default async function TriageStage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) notFound();
  const scoresParsed = idea.scoresJson ? IdeaScoresSchema.safeParse(JSON.parse(idea.scoresJson)) : null;
  const scores = scoresParsed?.success ? scoresParsed.data : null;

  return (
    <div className="space-y-6">
      <TriageRunner ideaId={id} triaged={!!idea.primaryType} primaryType={idea.primaryType} />

      {scores && (
        <Card>
          <CardHeader>
            <CardTitle>Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreRow label="Market fit" score={scores.marketFit.score} rationale={scores.marketFit.rationale} />
            <ScoreRow label="Feasibility" score={scores.feasibility.score} rationale={scores.feasibility.rationale} />
            <ScoreRow label="Novelty" score={scores.novelty.score} rationale={scores.novelty.rationale} />
            <ScoreRow label="Brand alignment" score={scores.brandAlignment.score} rationale={scores.brandAlignment.rationale} />
            {scores.recommendation && (
              <p className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="font-semibold">Recommendation:</span> {scores.recommendation}
              </p>
            )}
            <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
              Primary classification:
              {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
            </div>
          </CardContent>
        </Card>
      )}
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
