import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { IdeaStepper } from "@/components/ideas/idea-stepper";
import { computeCompleted } from "@/components/ideas/idea-stages";

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

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 space-y-2">
        <Link
          href={`/companies/${idea.companyId}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {idea.company.name}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{idea.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{idea.status}</Badge>
            {idea.primaryType && <Badge>{idea.primaryType}</Badge>}
          </div>
        </div>
      </header>
      <IdeaStepper ideaId={idea.id} completed={completed} />
      <div className="mt-6">{children}</div>
    </main>
  );
}
