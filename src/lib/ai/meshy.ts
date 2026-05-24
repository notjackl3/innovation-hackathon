/**
 * Meshy AI image-to-3D wrapper. In MOCK mode returns a deterministic placeholder
 * GLB key so the rest of the pipeline can run without a Meshy account.
 */

export interface MeshyCreateOpts {
  imageUrl: string;
  prompt?: string;
}

export interface MeshyCreateResult {
  taskId: string;
}

export interface MeshyPollResult {
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  progress: number;
  glbUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";

function isMockMeshy(): boolean {
  if (process.env.MOCK_AI === "true") return true;
  if (!process.env.MESHY_API_KEY) return true;
  return false;
}

export async function createMeshyTask(opts: MeshyCreateOpts): Promise<MeshyCreateResult> {
  if (isMockMeshy()) {
    return { taskId: `mock-${Date.now()}` };
  }
  // meshy-4 doesn't support enable_pbr; meshy-5 does. We use meshy-5 by
  // default since it gives better quality, but allow override via env.
  const aiModel = process.env.MESHY_MODEL ?? "meshy-5";
  const body: Record<string, unknown> = {
    image_url: opts.imageUrl,
    ai_model: aiModel,
    should_texture: true,
    should_remesh: true,
  };
  if (aiModel !== "meshy-4") body.enable_pbr = true;
  if (opts.prompt) body.texture_prompt = opts.prompt;

  const res = await fetch(`${MESHY_BASE}/image-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Meshy create failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { result: string };
  return { taskId: json.result };
}

export async function pollMeshyTask(taskId: string): Promise<MeshyPollResult> {
  if (isMockMeshy()) {
    // Pretend it always finishes after a short delay; the job runner handles timing.
    return {
      status: "SUCCEEDED",
      progress: 100,
      glbUrl: "/mock-assets/placeholder.glb",
    };
  }
  const res = await fetch(`${MESHY_BASE}/image-to-3d/${taskId}`, {
    headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Meshy poll failed: ${res.status}`);
  const json = (await res.json()) as {
    status: string;
    progress?: number;
    model_urls?: { glb?: string };
    thumbnail_url?: string;
    task_error?: { message?: string };
  };
  const status = json.status?.toUpperCase() as MeshyPollResult["status"];
  return {
    status,
    progress: json.progress ?? 0,
    glbUrl: json.model_urls?.glb,
    thumbnailUrl: json.thumbnail_url,
    error: json.task_error?.message,
  };
}
