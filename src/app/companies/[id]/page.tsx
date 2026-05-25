import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { CompanyBriefSchema } from "@/lib/schemas/brief";
import { DocumentManager } from "@/components/shared/document-manager";
import { ResearchSummary } from "@/components/shared/research-summary";
import { AppHeader } from "@/components/shared/app-header";
import { PageHeader } from "@/components/shared/page-header";
import { pipelineMeta } from "@/components/shared/pipeline-meta";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      ideas: { orderBy: { updatedAt: "desc" }, take: 8 },
    },
  });
  if (!company) notFound();
  const brief = CompanyBriefSchema.parse(JSON.parse(company.briefJson));

  return (
    <>
      <AppHeader />
      <main className="relative mx-auto max-w-6xl px-6 py-10">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-grain opacity-50" />
        <PageHeader
          backHref="/dashboard"
          backLabel="Dashboard"
          eyebrow="Company"
          title={company.name}
          subtitle={brief.oneLiner || undefined}
          actions={
            <Button asChild>
              <Link href={`/companies/${company.id}/ideas/new`}>+ New idea</Link>
            </Button>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentManager
                  companyId={company.id}
                  initialDocs={company.documents.map((d) => ({
                    id: d.id,
                    filename: d.filename,
                    kind: d.kind,
                    summary: d.summary,
                    createdAt: d.createdAt.toISOString(),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ideas</CardTitle>
              </CardHeader>
              <CardContent>
                {company.ideas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No ideas yet.{" "}
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/companies/${company.id}/ideas/new`}>
                      Create the first one.
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {company.ideas.map((i) => {
                      const meta = pipelineMeta(i.primaryType);
                      const Icon = meta?.icon ?? Sparkles;
                      return (
                        <li key={i.id}>
                          <Link
                            href={`/ideas/${i.id}`}
                            className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-foreground/5"
                          >
                            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta?.tile ?? "bg-muted text-muted-foreground"}`}>
                              <Icon className="h-4 w-4" strokeWidth={2.25} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">{i.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {meta?.label ?? "Untriaged"} · {i.status}
                              </div>
                            </div>
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          <aside>
            <ResearchSummary companyId={company.id} brief={brief} />
          </aside>
        </div>
      </main>
    </>
  );
}
