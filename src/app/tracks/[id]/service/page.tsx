import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function ServiceTrackRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const track = await prisma.visualizationTrack.findUnique({ where: { id } });
  if (!track) redirect("/dashboard");
  redirect(`/ideas/${track.ideaId}/generate`);
}
