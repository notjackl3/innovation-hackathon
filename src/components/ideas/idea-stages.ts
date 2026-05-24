/**
 * Server-safe helpers for idea-stage navigation. Kept separate from the
 * client-only stepper component so server layouts can import without
 * importing a "use client" boundary.
 */

export type Stage = "brief" | "triage" | "generate" | "share";

export function computeCompleted(idea: {
  briefJson: string | null;
  primaryType: string | null;
  status: string;
  tracks: { artifacts: { id: string }[]; kind: string }[];
}): Record<Stage, boolean> {
  const hasBrief = !!idea.briefJson;
  const hasTriage = !!idea.primaryType;
  const primaryTrack = idea.tracks.find((t) => t.kind === idea.primaryType);
  const hasGenerated = !!primaryTrack && primaryTrack.artifacts.length > 0;
  return {
    brief: hasBrief,
    triage: hasTriage,
    generate: hasGenerated,
    share: false, // share isn't a state, just a destination
  };
}
