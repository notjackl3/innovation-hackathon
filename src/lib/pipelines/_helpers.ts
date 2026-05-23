import { prisma } from "@/lib/db";
import { CompanyBriefSchema, type CompanyBrief } from "@/lib/schemas/brief";
import { IdeaBriefSchema, type IdeaBrief } from "@/lib/schemas/idea";

export async function getTrackContext(trackId: string) {
  const track = await prisma.visualizationTrack.findUnique({
    where: { id: trackId },
    include: { idea: { include: { company: true } } },
  });
  if (!track) throw new Error(`Track ${trackId} not found`);
  const company: CompanyBrief = CompanyBriefSchema.parse(JSON.parse(track.idea.company.briefJson));
  const idea: IdeaBrief | null = track.idea.briefJson
    ? IdeaBriefSchema.parse(JSON.parse(track.idea.briefJson))
    : null;
  return { track, idea, company, ideaRecord: track.idea };
}

export async function createArtifactVersion(opts: {
  trackId: string;
  kind: string;
  label?: string;
  storageKey?: string;
  contentJson?: unknown;
  meta?: unknown;
  parentVersionId?: string;
  reuseArtifactId?: string;
}) {
  const artifact = opts.reuseArtifactId
    ? await prisma.artifact.findUnique({ where: { id: opts.reuseArtifactId } })
    : await prisma.artifact.create({
        data: { trackId: opts.trackId, kind: opts.kind, label: opts.label ?? null },
      });
  if (!artifact) throw new Error("Artifact not found");
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      parentVersionId: opts.parentVersionId ?? null,
      storageKey: opts.storageKey ?? null,
      contentJson: opts.contentJson ? JSON.stringify(opts.contentJson) : null,
      meta: JSON.stringify(opts.meta ?? {}),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id },
  });
  return { artifact, version };
}

export function brandPromptPrefix(company: CompanyBrief): string {
  const sketch = company.visualStyle.sketchStyle || "clean modern concept sketch";
  const palette = company.visualStyle.palette.slice(0, 3).join(", ");
  const adjectives = company.brandVoice.adjectives.slice(0, 3).join(", ");
  return [
    sketch ? `Style: ${sketch}.` : "",
    palette ? `Palette accents: ${palette}.` : "",
    adjectives ? `Brand voice cues: ${adjectives}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
