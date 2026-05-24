export type JobKind =
  | "CLASSIFY_IDEA"
  | "EXTRACT_DOC"
  | "GEN_SKETCHES"
  | "REFINE_SKETCH"
  | "GEN_MESH_SUBMIT"
  | "GEN_MESH_POLL"
  | "GEN_SCENE_PLAN"
  | "GEN_SCENE_FRAME"
  | "GEN_ALL_FRAMES"
  | "ADD_SCENE"
  | "GEN_NARRATION"
  | "ASSEMBLE_VIDEO"
  | "GEN_PRODUCT_SPEC"
  | "GEN_SCREEN_SPEC"
  | "RENDER_DEMO"
  | "EXPORT_REPORT";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface JobContext {
  jobId: string;
  log: (msg: string) => Promise<void>;
  setProgress: (p: number) => Promise<void>;
  setExternalRef: (ref: string) => Promise<void>;
}

export type JobHandler<I = unknown, O = unknown> = (input: I, ctx: JobContext) => Promise<O>;

export interface EnqueueOpts<I> {
  kind: JobKind;
  input: I;
  trackId?: string;
  /** If true, run inline (await the result instead of queuing). Useful for fast jobs. */
  inline?: boolean;
}
