import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdeaScoresSchema } from "@/lib/schemas/idea";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ideas = await prisma.idea.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      company: true,
      tracks: { include: { artifacts: true } },
    },
    take: 50,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← Home</Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All ideas across all companies. Click into any one to continue visualizing.
          </p>
        </div>
      </div>

      {ideas.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No ideas yet. <Link className="text-primary underline" href="/companies/new">Start a company →</Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => {
            const scoresParsed = idea.scoresJson
              ? IdeaScoresSchema.safeParse(JSON.parse(idea.scoresJson))
              : null;
            const scores = scoresParsed?.success ? scoresParsed.data : null;
            const avg = scores
              ? (
                  scores.marketFit.score +
                  scores.feasibility.score +
                  scores.novelty.score +
                  scores.brandAlignment.score
                ) / 4
              : null;
            return (
              <Link key={idea.id} href={`/ideas/${idea.id}`}>
                <Card className="transition hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{idea.company.name}</span>
                        <span>·</span>
                        <span>{relativeTime(idea.updatedAt)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-medium">{idea.title}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
                        {idea.tracks.map((t) => (
                          <Badge key={t.id} variant="muted">{t.kind} · {t.artifacts.length} art</Badge>
                        ))}
                      </div>
                    </div>
                    {avg !== null && (
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
                        <div className="text-2xl font-semibold tabular-nums">{avg.toFixed(1)}</div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
