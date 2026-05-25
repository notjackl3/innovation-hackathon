import Link from "next/link";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IdeaScoresSchema } from "@/lib/schemas/idea";
import { relativeTime } from "@/lib/utils";
import { AppHeader } from "@/components/shared/app-header";
import { PageHeader } from "@/components/shared/page-header";
import { pipelineMeta } from "@/components/shared/pipeline-meta";
import { RevealStagger, RevealItem } from "@/components/landing/reveal";
import { ArrowUpRight, Sparkles } from "lucide-react";

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
    <>
      <AppHeader />
      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-grain opacity-50" />
        <PageHeader
          eyebrow="Your workspace"
          title="Dashboard"
          subtitle="Every idea across all companies. Jump back into any one to keep visualizing."
          actions={
            <Button asChild>
              <Link href="/companies/new">Start a company</Link>
            </Button>
          }
        />

        {ideas.length > 0 && (
          <div className="mb-6 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-semibold text-foreground shadow-sm ring-1 ring-border">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {ideas.length} idea{ideas.length === 1 ? "" : "s"}
            </span>
            {hiddenDupCount > 0 && (
              <span>{hiddenDupCount} duplicate{hiddenDupCount === 1 ? "" : "s"} hidden</span>
            )}
          </div>
        )}

        {ideas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="mt-4 text-lg font-semibold">No ideas yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a company and drop in your first idea to see it visualized.
            </p>
            <Button asChild className="mt-6">
              <Link href="/companies/new">Start a company →</Link>
            </Button>
          </div>
        ) : (
          <RevealStagger className="grid gap-3">
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
              const meta = pipelineMeta(idea.primaryType);
              const Icon = meta?.icon ?? Sparkles;

              return (
                <RevealItem key={idea.id}>
                  <Link href={`/ideas/${idea.id}`} className="block">
                    <div className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm shadow-foreground/[0.02] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-foreground/5">
                      <span
                        className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${meta?.tile ?? "bg-muted text-muted-foreground"}`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.25} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">{idea.company.name}</span>
                          <span>·</span>
                          <span>{relativeTime(idea.updatedAt)}</span>
                        </div>
                        <div className="mt-0.5 truncate text-base font-semibold tracking-tight">
                          {idea.title}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {idea.primaryType && meta && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.chip}`}>
                              {meta.label}
                            </span>
                          )}
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
                                {stages.map((s) => {
                                  const done = present.has(s.key);
                                  return (
                                    <span
                                      key={s.key}
                                      className={
                                        done
                                          ? "inline-flex items-center gap-0.5 font-medium text-emerald-600"
                                          : "inline-flex items-center gap-0.5 text-muted-foreground/50 line-through"
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
                        <div className="hidden text-right sm:block">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Score
                          </div>
                          <div className="text-2xl font-extrabold tabular-nums font-display">
                            {avg.toFixed(1)}
                          </div>
                        </div>
                      )}
                      <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                    </div>
                  </Link>
                </RevealItem>
              );
            })}
          </RevealStagger>
        )}
      </main>
    </>
  );
}
