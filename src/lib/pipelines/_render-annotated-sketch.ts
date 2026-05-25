import { prisma } from "@/lib/db";
import { editImage } from "@/lib/ai/image";
import { openai } from "@/lib/ai/openai";
import { getStorage } from "@/lib/storage";
import { brandPromptPrefix } from "./_helpers";

interface RenderArgs {
  /** The user-annotated source artifact version (sketch + raw strokes composite). */
  sourceVersionId: string;
  /** Storage path prefix: companies/{cid}/ideas/{iid}/tracks/{tid}/sketches */
  pathPrefix: string;
  company: Parameters<typeof brandPromptPrefix>[0];
  /**
   * - "match-source" (default): runs `images.edit` so the output preserves the
   *   original sketch's style, colors, line work, and proportions, only
   *   integrating the user's drawn annotation. Best for iterating on the 2D
   *   sketch itself.
   * - "photoreal-render": runs vision describe + `images.generate` to produce
   *   a fresh, fully-shaded product image where the annotation reads as real
   *   3D geometry. Best when feeding the result into Meshy.
   */
  mode?: "match-source" | "photoreal-render";
  /** Optional progress callback (10..30 range during this step). */
  onProgress?: (pct: number) => Promise<void> | void;
  onLog?: (msg: string) => Promise<void> | void;
}

/**
 * Takes a user-annotated sketch (sketch + raw freehand strokes flattened into
 * a single PNG) and produces a CLEAN, fully-rendered new sketch version using
 * describe-then-generate:
 *   1) GPT-4o vision describes the product + the user's annotation
 *   2) gpt-image-1 GENERATE produces a fresh photoreal-style render where the
 *      annotation reads as real 3D-looking geometry (not as overlay strokes)
 *
 * Saves the result as a new ArtifactVersion under the same sketch artifact,
 * sets the artifact's currentVersionId to the new version, and returns it.
 *
 * Used by both the standalone "Regenerate sketch" action and the mesh
 * pipeline (so Meshy gets a clean silhouette to extract geometry from).
 */
export async function renderAnnotatedSketch(args: RenderArgs) {
  const mode = args.mode ?? "match-source";
  const source = await prisma.artifactVersion.findUnique({
    where: { id: args.sourceVersionId },
  });
  if (!source?.storageKey) throw new Error("Annotated source version missing");

  const storage = getStorage();
  const inBytes = await storage.get(source.storageKey);

  await args.onProgress?.(10);

  // Step 1: vision-describe what the user added. We pass the description into
  // BOTH branches so the model understands the intent of the annotation.
  const dataUrl = `data:image/png;base64,${inBytes.toString("base64")}`;
  const visionResponse = await openai().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          mode === "photoreal-render"
            ? "You are a product designer. The user provides a product concept image with rough hand-drawn annotations on top. Write a single tight image-generation prompt for a NEW image that depicts the SAME product with the annotation rendered as a real three-dimensional part of the object (proper materials, shading, attachment, perspective). Describe the product (form, color, material), the annotation (what it depicts, where it attaches, suggested material and proportions), and the pose/angle/background. Output only the prompt — no preamble."
            : "You are a product designer reviewing a concept sketch with rough hand-drawn annotations on top. In 1-3 sentences, describe ONLY what the user added with their annotation: what it appears to depict, where it attaches to the existing object, and the material/proportions that would make it look like a natural extension of the same hand-drawn style. Do not redescribe the original product. Output plain text.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe the user's annotation." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0.3,
  });
  const description =
    visionResponse.choices[0]?.message?.content?.trim() ??
    "Integrate the user's annotation as a natural part of the object.";
  await args.onLog?.(`Vision: ${description.slice(0, 200)}${description.length > 200 ? "…" : ""}`);
  await args.onProgress?.(20);

  let outBytes: Buffer;
  let outContentType: string;
  let usedPrompt: string;

  if (mode === "photoreal-render") {
    // Photoreal prep for Meshy: use images.edit so the design (colors,
    // proportions, shape, identity) is preserved from the source — Meshy was
    // turning sketch-style images into black 3D because it interpreted the
    // bold outlines as dark material. We strip the outlines and add realistic
    // shading while keeping every other visual property unchanged.
    usedPrompt = `${brandPromptPrefix(args.company)} This is a product concept image. It may contain rough hand-drawn user annotations (lines, shapes) added on top of the design. ${description} Produce a PHOTOREAL product render where: (1) the ORIGINAL product is preserved exactly — same colors, proportions, materials, pose, framing, and background; (2) any user annotations are integrated as natural three-dimensional parts of the object, in materials and colors that match the rest of the product; (3) ALL sketch lines, outlines, hatching, and rough strokes are REMOVED — replaced with smooth realistic surface shading and lighting; (4) the result looks like a studio product photograph of the design. Critically: do NOT recolor the object dark or black unless the source itself is dark. If the source is light-colored, the output must remain light-colored. Do NOT redesign, restyle, or restructure anything. The output product must be visibly the same design as the input, just photorealistically rendered.`;
    const edited = await editImage({ prompt: usedPrompt, baseImage: inBytes });
    outBytes = edited.bytes;
    outContentType = edited.contentType;
  } else {
    // Match-source edit — preserves the original sketch's style, line work,
    // color palette, proportions, and pose. The model only fills in/cleans
    // up the user's annotation as a natural extension of the same drawing.
    usedPrompt = `${brandPromptPrefix(args.company)} This is an existing product concept sketch with a rough hand-drawn annotation added by the user (typically in a contrasting color). ${description} Produce a new version of THIS EXACT image where the annotation is rendered in the SAME artistic style, line work, color palette, shading, lighting, proportions, pose, and background as the rest of the original sketch — so it looks like the original artist drew the annotated element as part of the object. Do NOT redesign, restyle, recolor, or reframe the original product. Keep every existing line and detail intact. Remove only the raw annotation strokes themselves, replacing them with a properly integrated version of what they depict.`;
    const edited = await editImage({ prompt: usedPrompt, baseImage: inBytes });
    outBytes = edited.bytes;
    outContentType = edited.contentType;
  }

  const renderedExt = outContentType.includes("svg") ? "svg" : "png";
  const renderedKey = `${args.pathPrefix}/${source.artifactId}-rendered-${Date.now()}.${renderedExt}`;
  await storage.put(renderedKey, outBytes, outContentType);
  const renderedVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: source.artifactId,
      parentVersionId: source.id,
      storageKey: renderedKey,
      meta: JSON.stringify({
        source: mode === "photoreal-render" ? "ai-photoreal-render" : "ai-rendered-from-annotation",
        contentType: outContentType,
        mode,
        usedPrompt,
        visionDescription: description,
      }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: source.artifactId },
    data: { currentVersionId: renderedVersion.id },
  });

  await args.onProgress?.(30);
  await args.onLog?.(`Rendered sketch saved as version ${renderedVersion.id} (mode=${mode}).`);
  return renderedVersion;
}
