import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DemoBundleSchema } from "@/lib/schemas/screen";
import { PublicDemo } from "@/components/software/public-demo";

export const dynamic = "force-dynamic";

export default async function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shared = await prisma.sharedDemo.findUnique({ where: { slug } });
  if (!shared) notFound();
  const bundleArtifact = await prisma.artifact.findUnique({
    where: { id: shared.bundleId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!bundleArtifact?.versions[0]?.contentJson) notFound();
  const parsed = DemoBundleSchema.safeParse(JSON.parse(bundleArtifact.versions[0].contentJson));
  if (!parsed.success) notFound();

  return (
    <main className="min-h-dvh bg-neutral-100">
      <PublicDemo bundle={parsed.data} />
    </main>
  );
}
