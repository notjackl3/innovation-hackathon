/**
 * Central registration point — imported by every API route so all job handlers
 * are available regardless of which route is hit first.
 *
 * Handler modules call registerHandler() at module load.
 */
import "@/lib/pipelines/extract-doc";
import "@/lib/pipelines/classify-idea";
import "@/lib/pipelines/gen-sketches";
import "@/lib/pipelines/refine-sketch";
import "@/lib/pipelines/gen-mesh";
import "@/lib/pipelines/gen-scene-plan";
import "@/lib/pipelines/gen-scene-frame";
import "@/lib/pipelines/gen-narration";
import "@/lib/pipelines/assemble-video";
import "@/lib/pipelines/gen-product-spec";
import "@/lib/pipelines/gen-screen-spec";
