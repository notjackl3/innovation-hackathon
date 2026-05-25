/**
 * Seedance image-to-video.
 *
 * Default provider: OpenRouter (https://openrouter.ai/) calling
 * `bytedance/seedance-1-lite` (or whatever `SEEDANCE_MODEL` resolves to).
 *
 * Alternate provider: Replicate (set `SEEDANCE_PROVIDER=replicate` +
 * `REPLICATE_API_TOKEN`). Kept around so we can swap without touching the
 * call site if OpenRouter's video surface changes.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const REPLICATE_BASE = "https://api.replicate.com/v1";

const PROVIDER = (process.env.SEEDANCE_PROVIDER ?? "openrouter").toLowerCase();
// Honour the user's exact env names. Fall back to the standard single-
// underscore variants so the project remains portable.
const MODEL =
  process.env.OPENROUTER__VIDEO_MODEL ??
  process.env.SEEDANCE_MODEL ??
  (PROVIDER === "replicate" ? "bytedance/seedance-1-pro" : "bytedance/seedance-1-lite");

export interface SeedanceOpts {
  /** Starting frame the model animates from. */
  imageBytes: Buffer;
  /** Action description — what should happen during the clip. */
  prompt: string;
  /** Clip duration in seconds. Seedance accepts 5 or 10. */
  durationSec?: 5 | 10;
  /** Output resolution. */
  resolution?: "480p" | "720p" | "1080p";
  /** Cinema aspect. Defaults to 16:9. */
  aspectRatio?: "16:9" | "9:16" | "1:1";
}

export interface SeedanceResult {
  bytes: Buffer;
  contentType: "video/mp4";
  durationSec: number;
}

function openRouterKey(): string | null {
  return process.env.OPENROUTER__API_KEY ?? process.env.OPENROUTER_API_KEY ?? null;
}
function replicateKey(): string | null {
  return process.env.REPLICATE_API_TOKEN ?? process.env.REPLICATE_API_KEY ?? null;
}

export function isSeedanceAvailable(): boolean {
  if (process.env.MOCK_AI === "true") return false;
  if (PROVIDER === "replicate") return !!replicateKey();
  return !!openRouterKey();
}

export class SeedanceUnavailableError extends Error {
  constructor() {
    super(
      PROVIDER === "replicate"
        ? "Seedance via Replicate requires REPLICATE_API_TOKEN in .env."
        : "Seedance via OpenRouter requires OPENROUTER_API_KEY in .env (format: sk-or-v1-…). Get one at https://openrouter.ai/settings/keys, set it, and restart the dev server."
    );
    this.name = "SeedanceUnavailableError";
  }
}

export async function generateSceneVideo(
  opts: SeedanceOpts,
  onProgress?: (msg: string) => Promise<void>
): Promise<SeedanceResult> {
  if (!isSeedanceAvailable()) throw new SeedanceUnavailableError();
  if (PROVIDER === "replicate") return generateViaReplicate(opts, onProgress);
  return generateViaOpenRouter(opts, onProgress);
}

// ───────────────────────────────────────────────────────────── OpenRouter ──
// OpenRouter exposes Seedance via a dedicated `/api/v1/videos` endpoint (NOT
// chat completions). Body uses `frame_images` (first_frame and optionally
// last_frame as base64 data URIs). Response returns a job id; poll
// `/api/v1/videos/{id}` until status is "completed" (or another terminal
// state), then fetch the rendered video from `unsigned_urls[0]` with the
// Authorization header.
//
// Schema verified against a working Python implementation in osiris-hackathon.

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "expired"]);

interface OpenRouterVideoJob {
  id?: string;
  status?: string;
  error?: string | { message?: string; code?: number } | null;
  unsigned_urls?: string[] | null;
}

function describeJobError(job: OpenRouterVideoJob): string {
  if (!job.error) return "unknown";
  if (typeof job.error === "string") return job.error;
  return job.error.message ?? `code ${job.error.code ?? "?"}`;
}

async function generateViaOpenRouter(
  opts: SeedanceOpts,
  onProgress?: (msg: string) => Promise<void>
): Promise<SeedanceResult> {
  const key = openRouterKey()!;
  const durationSec = opts.durationSec ?? 5;
  const resolution = opts.resolution ?? "480p";
  const aspectRatio = opts.aspectRatio ?? "16:9";

  const dataUri = `data:image/png;base64,${opts.imageBytes.toString("base64")}`;

  const body = {
    model: MODEL,
    prompt: opts.prompt,
    aspect_ratio: aspectRatio,
    duration: durationSec,
    resolution,
    generate_audio: false,
    frame_images: [
      {
        image_url: { url: dataUri },
        type: "image_url",
        frame_type: "first_frame",
      },
    ],
  };

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://spark.local",
    "X-Title": "Spark Innovation Visualizer",
  };

  await onProgress?.(`Submitting Seedance job (${MODEL}, ${durationSec}s @ ${resolution})…`);
  const submit = await fetch(`${OPENROUTER_BASE}/videos`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    const text = await submit.text().catch(() => "");
    throw new Error(`OpenRouter videos submit failed: ${submit.status} ${text.slice(0, 600)}`);
  }
  let job = (await submit.json()) as OpenRouterVideoJob;
  // If the submit response is already a wrapped error (e.g. content moderation
  // rejected the input image), bail out immediately with the real message.
  if (job.error || !job.id) {
    throw new Error(`Seedance submit rejected: ${describeJobError(job)}`);
  }
  await onProgress?.(`Job ${job.id} status=${job.status ?? "submitted"}`);

  // Poll until terminal. Budget scales with the requested duration.
  const startedAt = Date.now();
  const budgetMs = Math.max(15 * 60 * 1000, 150 * 1000 * durationSec);
  while (!TERMINAL_STATUSES.has(job.status ?? "pending")) {
    if (Date.now() - startedAt > budgetMs) {
      throw new Error(`Seedance polling timed out after ${Math.round(budgetMs / 1000)}s`);
    }
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${OPENROUTER_BASE}/videos/${job.id}`, { headers });
    if (!poll.ok) {
      const text = await poll.text().catch(() => "");
      throw new Error(`OpenRouter videos poll failed: ${poll.status} ${text.slice(0, 300)}`);
    }
    job = (await poll.json()) as OpenRouterVideoJob;
    await onProgress?.(`Job ${job.id} status=${job.status}`);
  }

  if (job.status !== "completed") {
    throw new Error(`Seedance job ${job.status}: ${describeJobError(job)}`);
  }
  const contentUrl = job.unsigned_urls?.[0];
  if (!contentUrl) {
    throw new Error(
      `Seedance completed but no unsigned_urls returned. Job: ${JSON.stringify(job).slice(0, 400)}`
    );
  }

  await onProgress?.(`Downloading rendered video…`);
  // unsigned_urls require the same Bearer to fetch (private content).
  const dl = await fetch(contentUrl, { headers: { Authorization: `Bearer ${key}` } });
  if (!dl.ok) throw new Error(`Failed to fetch rendered video: ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  return { bytes, contentType: "video/mp4", durationSec };
}

async function fetchVideoBytes(urlOrDataUri: string): Promise<Buffer> {
  if (urlOrDataUri.startsWith("data:")) {
    const comma = urlOrDataUri.indexOf(",");
    return Buffer.from(urlOrDataUri.slice(comma + 1), "base64");
  }
  const res = await fetch(urlOrDataUri);
  if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─────────────────────────────────────────────────────────────── Replicate ──

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
}

async function generateViaReplicate(
  opts: SeedanceOpts,
  onProgress?: (msg: string) => Promise<void>
): Promise<SeedanceResult> {
  const key = replicateKey()!;
  const durationSec = opts.durationSec ?? 5;
  const imageDataUri = `data:image/png;base64,${opts.imageBytes.toString("base64")}`;

  const submit = await fetch(`${REPLICATE_BASE}/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    },
    body: JSON.stringify({
      input: {
        image: imageDataUri,
        prompt: opts.prompt,
        duration: durationSec,
        resolution: opts.resolution ?? "720p",
        aspect_ratio: opts.aspectRatio ?? "16:9",
      },
    }),
  });
  if (!submit.ok) throw new Error(`Replicate submit failed: ${submit.status} ${await submit.text().catch(() => "")}`);
  let prediction = (await submit.json()) as ReplicatePrediction;

  const startedAt = Date.now();
  while (prediction.status === "starting" || prediction.status === "processing") {
    if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error("Replicate timed out");
    await new Promise((r) => setTimeout(r, 4000));
    if (!prediction.urls?.get) throw new Error("Replicate response missing poll URL");
    const poll = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${key}` } });
    if (!poll.ok) throw new Error(`Replicate poll failed: ${poll.status}`);
    prediction = (await poll.json()) as ReplicatePrediction;
    await onProgress?.(`status=${prediction.status}`);
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate ${prediction.status}: ${prediction.error ?? "unknown"}`);
  }
  const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!videoUrl) throw new Error("Replicate returned no output");
  const bytes = await fetchVideoBytes(videoUrl);
  return { bytes, contentType: "video/mp4", durationSec };
}
