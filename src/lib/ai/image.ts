import { isMockMode, openai } from "./openai";
import { mockSketchPng } from "./mock-assets";

export interface GenerateImageOpts {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
  n?: number;
  model?: "gpt-image-1" | "dall-e-3";
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
  const model = opts.model ?? "gpt-image-1";
  const response = await openai().images.generate({
    model,
    prompt: opts.prompt,
    n,
    size: opts.size ?? "1024x1024",
  });
  return (response.data ?? []).map((d) => {
    if (!d.b64_json) throw new Error("Image API returned no b64_json");
    return { bytes: Buffer.from(d.b64_json, "base64"), contentType: "image/png" };
  });
}

export interface EditImageOpts {
  prompt: string;
  baseImage: Buffer;
  maskImage?: Buffer;
  size?: "1024x1024";
}

export async function editImage(opts: EditImageOpts): Promise<GeneratedImage> {
  if (isMockMode()) {
    return { bytes: mockSketchPng(`edit-${opts.prompt}`), contentType: "image/svg+xml" };
  }
  // gpt-image-1 supports edits via /images/edits with image + optional mask
  const file = new File([new Uint8Array(opts.baseImage)], "base.png", { type: "image/png" });
  const maskFile = opts.maskImage
    ? new File([new Uint8Array(opts.maskImage)], "mask.png", { type: "image/png" })
    : undefined;
  const response = await openai().images.edit({
    model: "gpt-image-1",
    image: file,
    mask: maskFile,
    prompt: opts.prompt,
    size: opts.size ?? "1024x1024",
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Edit returned no image");
  return { bytes: Buffer.from(b64, "base64"), contentType: "image/png" };
}
