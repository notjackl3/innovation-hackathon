import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { CompanyBriefSchema } from "@/lib/schemas/brief";
import { DocumentManager } from "@/components/shared/document-manager";
import { ResearchSummary } from "@/components/shared/research-summary";

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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{company.name}</h1>
          {brief.oneLiner && <p className="mt-1 text-muted-foreground">{brief.oneLiner}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/companies/${company.id}/ideas/new`}>+ New idea</Link>
          </Button>
        </div>
      </div>

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
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/companies/${company.id}/ideas/new`}>
                    Create the first one.
                  </Link>
                </p>
              ) : (
                <ul className="divide-y">
                  {company.ideas.map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-3">
                      <div>
                        <Link href={`/ideas/${i.id}`} className="font-medium hover:underline">
                          {i.title}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {i.primaryType ?? "Untriaged"} · {i.status}
                        </div>
                      </div>
                      <Badge variant="outline">{i.primaryType ?? "—"}</Badge>
                    </li>
                  ))}
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
  );
}
