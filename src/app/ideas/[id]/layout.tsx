import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { IdeaStepper } from "@/components/ideas/idea-stepper";
import { computeCompleted } from "@/components/ideas/idea-stages";
import { AppHeader } from "@/components/shared/app-header";
import { PageHeader } from "@/components/shared/page-header";
import { pipelineMeta } from "@/components/shared/pipeline-meta";

export default async function IdeaLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      company: true,
      tracks: { include: { artifacts: { select: { id: true } } } },
    },
  });
  if (!idea) notFound();
  const completed = computeCompleted(idea);
  const meta = pipelineMeta(idea.primaryType);

  return (
    <>
      <AppHeader />
      <main className="relative mx-auto max-w-6xl px-6 py-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-grain opacity-50" />
        <PageHeader
          backHref={`/companies/${idea.companyId}`}
          backLabel={idea.company.name}
          eyebrow={meta?.label ?? "Idea"}
          title={idea.title}
          actions={
            <>
              <Badge variant="outline">{idea.status}</Badge>
              {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
            </>
          }
        />
        <IdeaStepper ideaId={idea.id} completed={completed} />
        <div className="mt-6">{children}</div>
      </main>
    </>
  );
}
