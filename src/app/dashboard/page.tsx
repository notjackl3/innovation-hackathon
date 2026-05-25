import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IdeaScoresSchema } from "@/lib/schemas/idea";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

type StageDef = { key: string; label: string };

const STAGES_BY_TRACK: Record<string, StageDef[]> = {
  SOFTWARE: [
    { key: "PRODUCT_SPEC", label: "Spec" },
    { key: "DEMO_BUNDLE", label: "Demo" },
  ],
  PRODUCT: [
    { key: "SKETCH", label: "Sketches" },
    { key: "MESH", label: "3D model" },
  ],
  SERVICE: [
    { key: "SCENE_PLAN", label: "Storyboard" },
    { key: "VIDEO", label: "Video" },
  ],
};

export default async function DashboardPage() {
  const allIdeas = await prisma.idea.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      company: true,
      tracks: { include: { artifacts: true } },
    },
    take: 500,
  });

  // Dedupe by (companyName + title). Multiple Company rows can share a name and
  // each gets seeded with the same idea titles; keep the one that's progressed
  // furthest (most artifacts), tiebreaker = most recently updated.
  const totalArtifacts = (i: (typeof allIdeas)[number]) =>
    i.tracks.reduce((sum, t) => sum + t.artifacts.length, 0);
  const bestByKey = new Map<string, (typeof allIdeas)[number]>();
  for (const idea of allIdeas) {
    const key = `${idea.company.name}|${idea.title}`;
    const current = bestByKey.get(key);
    if (
      !current ||
      totalArtifacts(idea) > totalArtifacts(current) ||
      (totalArtifacts(idea) === totalArtifacts(current) &&
        idea.updatedAt > current.updatedAt)
    ) {
      bestByKey.set(key, idea);
    }
  }
  const ideas = Array.from(bestByKey.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  const hiddenDupCount = allIdeas.length - ideas.length;

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
        <div className="text-right text-xs text-muted-foreground">
          <div>{ideas.length} ideas</div>
          {hiddenDupCount > 0 && (
            <div className="text-muted-foreground/70">{hiddenDupCount} duplicate{hiddenDupCount === 1 ? "" : "s"} hidden</div>
          )}
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
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
                        {idea.tracks.length === 0 && (
                          <Badge variant="muted">Not generated yet</Badge>
                        )}
                        {idea.tracks.map((t) => {
                          const stages = STAGES_BY_TRACK[t.kind] ?? [];
                          const present = new Set(t.artifacts.map((a) => a.kind));
                          return (
                            <div
                              key={t.id}
                              className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
                            >
                              <span className="font-medium text-muted-foreground">{t.kind}</span>
                              {stages.map((s) => {
                                const done = present.has(s.key);
                                return (
                                  <span
                                    key={s.key}
                                    className={
                                      done
                                        ? "ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700"
                                        : "ml-1 inline-flex items-center gap-0.5 rounded-full bg-transparent px-1.5 py-0.5 text-muted-foreground/60 line-through"
                                    }
                                  >
                                    {done ? "✓" : "○"} {s.label}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
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
