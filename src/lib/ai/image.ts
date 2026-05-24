import type OpenAI from "openai";
import { isMockMode, openai } from "./openai";
import { mockSketchPng } from "./mock-assets";

/**
 * Logical sizes accepted by callers. Mapped to the right size string per model.
 *  - square   → 1024x1024
 *  - landscape → 1536x1024 (gpt-image-1) / 1792x1024 (dall-e-3)
 *  - portrait  → 1024x1536 (gpt-image-1) / 1024x1792 (dall-e-3)
 */
export type LogicalSize = "square" | "landscape" | "portrait";
export type ImageModel = "gpt-image-1" | "dall-e-3";

function resolveSize(model: ImageModel, size?: LogicalSize): string {
  const s = size ?? "square";
  if (model === "gpt-image-1") {
    if (s === "landscape") return "1536x1024";
    if (s === "portrait") return "1024x1536";
    return "1024x1024";
  }
  // dall-e-3
  if (s === "landscape") return "1792x1024";
  if (s === "portrait") return "1024x1792";
  return "1024x1024";
}

export interface GenerateImageOpts {
  prompt: string;
  size?: LogicalSize;
  n?: number;
  model?: ImageModel;
  /** "low" | "medium" | "high" — only used for gpt-image-1. */
  quality?: "low" | "medium" | "high";
  /** Used in mock mode to vary the placeholder output. */
  seed?: string;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: string;
}

export async function generateImages(opts: GenerateImageOpts): Promise<GeneratedImage[]> {
  const n = opts.n ?? 1;
  if (isMockMode()) {
    return Array.from({ length: n }, (_, i) => ({
      bytes: mockSketchPng(`${opts.seed ?? opts.prompt}-${i}`),
      contentType: "image/svg+xml",
    }));
  }
  const model: ImageModel = opts.model ?? "gpt-image-1";
  const size = resolveSize(model, opts.size);
  // dall-e-3 only supports n=1; if asked for more, loop.
  const callOnce = async (oneN: number) => {
    const params = {
      model,
      prompt: opts.prompt,
      n: oneN,
      size,
      ...(model === "gpt-image-1" && opts.quality ? { quality: opts.quality } : {}),
      ...(model === "dall-e-3" ? { response_format: "b64_json" as const } : {}),
    } as OpenAI.Images.ImageGenerateParams;
    const response = await openai().images.generate(params);
    return (response.data ?? []).map((d) => {
      if (!d.b64_json) throw new Error("Image API returned no b64_json");
      return { bytes: Buffer.from(d.b64_json, "base64"), contentType: "image/png" };
    });
  };
  if (model === "dall-e-3" && n > 1) {
    const out: GeneratedImage[] = [];
    for (let i = 0; i < n; i++) out.push(...(await callOnce(1)));
    return out;
  }
  return callOnce(n);
}

export interface EditImageOpts {
  prompt: string;
  /**
   * Reference image(s). gpt-image-1 supports either a single image (with an
   * optional mask) or an array of reference images used as visual context
   * for the prompt. We rely on the multi-image form for "produce a new scene
   * with the same characters" since the API uses every reference as guidance.
   */
  baseImage: Buffer | Buffer[];
  maskImage?: Buffer;
  size?: LogicalSize;
}

export async function editImage(opts: EditImageOpts): Promise<GeneratedImage> {
  if (isMockMode()) {
    return { bytes: mockSketchPng(`edit-${opts.prompt}`), contentType: "image/svg+xml" };
  }
  const buffers = Array.isArray(opts.baseImage) ? opts.baseImage : [opts.baseImage];
  const files = buffers.map(
    (buf, i) => new File([new Uint8Array(buf)], `ref-${i}.png`, { type: "image/png" })
  );
  const maskFile = opts.maskImage
    ? new File([new Uint8Array(opts.maskImage)], "mask.png", { type: "image/png" })
    : undefined;
  const size = resolveSize("gpt-image-1", opts.size);
  // The SDK accepts either a single File or an array of Files for `image`.
  const imageInput = files.length === 1 ? files[0] : (files as unknown as File);
  const response = await openai().images.edit({
    model: "gpt-image-1",
    image: imageInput,
    mask: maskFile,
    prompt: opts.prompt,
    size: size as "1024x1024" | "1536x1024" | "1024x1536" | "auto",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Edit returned no image");
  return { bytes: Buffer.from(b64, "base64"), contentType: "image/png" };
}
