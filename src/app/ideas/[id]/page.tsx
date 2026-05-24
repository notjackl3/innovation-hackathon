import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function IdeaIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: { tracks: { include: { artifacts: { select: { id: true } } } } },
  });
  if (!idea) redirect("/dashboard");
  // Route to the most advanced reachable stage so the user lands where they left off.
  if (!idea.primaryType) redirect(`/ideas/${id}/triage`);
  const primaryTrack = idea.tracks.find((t) => t.kind === idea.primaryType);
  if (primaryTrack && primaryTrack.artifacts.length > 0) redirect(`/ideas/${id}/generate`);
  redirect(`/ideas/${id}/generate`);
}
