import { registerHandler } from "@/lib/jobs/runner";
import { getTrackContext } from "./_helpers";
import { renderAnnotatedSketch } from "./_render-annotated-sketch";

interface Input {
  trackId: string;
  /** The user-annotated sketch version (raw composite of sketch + strokes). */
  sourceVersionId: string;
}

interface Output {
  versionId: string;
}

/**
 * Standalone "regenerate sketch with my edits" handler. Takes a user-annotated
 * composite and produces a clean AI-rendered sketch version via describe+
 * generate. Same logic as the mesh pipeline's pre-Meshy refine step, but
 * exposed as its own action so the user can iterate on the 2D sketch without
 * triggering 3D generation.
 */
registerHandler<Input, Output>("REGEN_SKETCH", async (input, ctx) => {
  const { track, ideaRecord, company } = await getTrackContext(input.trackId);
  await ctx.setProgress(5);
  const rendered = await renderAnnotatedSketch({
    sourceVersionId: input.sourceVersionId,
    pathPrefix: `companies/${ideaRecord.companyId}/ideas/${ideaRecord.id}/tracks/${track.id}/sketches`,
    company,
    // Sketch regen: preserve the original look/feel — the user wants to
    // iterate on a 2D sketch, not get a fresh product render.
    mode: "match-source",
    onProgress: (pct) => ctx.setProgress(Math.min(95, 10 + pct * 2)),
    onLog: (msg) => ctx.log(msg),
  });
  await ctx.setProgress(100);
  return { versionId: rendered.id };
});
