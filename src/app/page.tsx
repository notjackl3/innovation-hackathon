import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const companies = await prisma.company.findMany({
    orderBy: { updatedAt: "desc" },
    take: 6,
    include: { _count: { select: { ideas: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
            ✦
          </div>
          <div className="text-lg font-semibold tracking-tight">Spark</div>
        </div>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link href="/companies/new">New company</Link>
          </Button>
        </nav>
      </header>

      <section className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
            Innovation visualization platform
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Turn raw ideas into things you can <em className="not-italic text-primary">see</em>.
          </h1>
          <p className="mt-4 max-w-prose text-muted-foreground">
            Spark takes an innovation idea and a company profile, then routes it into one of three
            interactive pipelines — Product, Service, or Software — so teams can react to a real
            visualization instead of another spreadsheet row.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg">
              <Link href="/companies/new">Start a company</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">View dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          <TrackCard
            label="Product"
            desc="Sketch → editable canvas → 3D model"
            color="bg-amber-100 text-amber-900"
          />
          <TrackCard
            label="Service"
            desc="Storyboard → editable scenes → animated video"
            color="bg-emerald-100 text-emerald-900"
          />
          <TrackCard
            label="Software"
            desc="Spec → editable screens → click-through demo"
            color="bg-sky-100 text-sky-900"
          />
        </div>
      </section>

      {companies.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent companies
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {companies.map((c) => (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c._count.ideas} idea(s)</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/companies/${c.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function TrackCard({ label, desc, color }: { label: string; desc: string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`grid h-12 w-12 place-items-center rounded-lg ${color} text-sm font-semibold`}>
          {label[0]}
        </div>
        <div className="flex-1">
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground">{desc}</div>
        </div>
      </CardContent>
    </Card>
  );
}
