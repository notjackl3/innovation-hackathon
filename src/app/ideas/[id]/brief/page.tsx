import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IdeaBriefSchema } from "@/lib/schemas/idea";

export const dynamic = "force-dynamic";

export default async function BriefStage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) notFound();
  const briefParsed = idea.briefJson ? IdeaBriefSchema.safeParse(JSON.parse(idea.briefJson)) : null;
  const brief = briefParsed?.success ? briefParsed.data : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Raw idea</CardTitle>
        </CardHeader>
        <CardContent>
          <h2 className="mb-2 text-xl font-semibold">{idea.title}</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{idea.rawInput}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extracted brief</CardTitle>
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
            <p className="text-sm text-muted-foreground">
              The brief is generated during triage. Click <em>Next</em> to start.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="lg:col-span-2 flex justify-end">
        <Button asChild>
          <Link href={`/ideas/${id}/triage`}>Next: Triage →</Link>
        </Button>
      </div>
    </div>
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
