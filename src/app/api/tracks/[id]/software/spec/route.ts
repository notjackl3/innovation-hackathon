import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/db";
import {
  DemoBundleSchema,
  ProductSpecSchema,
  type DemoBundle,
  type ProductSpec,
} from "@/lib/schemas/screen";
import {
  propagateSpecChanges,
  SpecChangeError,
} from "@/lib/pipelines/propagate-spec-changes";
import "@/lib/jobs/register";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const jobId = await enqueueJob({
    kind: "GEN_PRODUCT_SPEC",
    input: { trackId },
    trackId,
  });
  return NextResponse.json({ jobId });
}

const PatchBody = z.object({
  productSpecArtifactId: z.string(),
  /** Desired ordered list of screen names after edits. */
  newScreens: z.array(z.string().trim().min(1)).min(1),
  /** Explicit rename mapping (server can't infer from set-diff). */
  renames: z
    .array(z.object({ from: z.string(), to: z.string() }))
    .optional(),
  /** When provided, the matching bundle is also rewritten with cascaded refs. */
  bundleArtifactId: z.string().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await ctx.params;
  const body = PatchBody.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const specArt = await prisma.artifact.findUnique({
    where: { id: body.data.productSpecArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!specArt || specArt.trackId !== trackId) {
    return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  }
  const specHead = specArt.versions[0];
  if (!specHead?.contentJson) {
    return NextResponse.json({ error: "Spec has no content" }, { status: 400 });
  }
  const currentSpec: ProductSpec = ProductSpecSchema.parse(JSON.parse(specHead.contentJson));

  // Load bundle if requested.
  let bundleArt: Awaited<
    ReturnType<
      typeof prisma.artifact.findUnique<{
        where: { id: string };
        include: { versions: { orderBy: { createdAt: "desc" }; take: 1 } };
      }>
    >
  > = null;
  let currentBundle: DemoBundle | null = null;
  let bundleHeadId: string | null = null;
  if (body.data.bundleArtifactId) {
    bundleArt = await prisma.artifact.findUnique({
      where: { id: body.data.bundleArtifactId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!bundleArt || bundleArt.trackId !== trackId) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }
    const head = bundleArt.versions[0];
    if (head?.contentJson) {
      try {
        currentBundle = DemoBundleSchema.parse(JSON.parse(head.contentJson));
        bundleHeadId = head.id;
      } catch {
        currentBundle = null;
      }
    }
  }

  let result;
  try {
    result = propagateSpecChanges({
      spec: currentSpec,
      bundle: currentBundle,
      newScreens: body.data.newScreens,
      renames: body.data.renames,
    });
  } catch (err) {
    if (err instanceof SpecChangeError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  const newSpecVersion = await prisma.artifactVersion.create({
    data: {
      artifactId: specArt.id,
      parentVersionId: specHead.id,
      contentJson: JSON.stringify(result.spec),
      meta: JSON.stringify({
        kind: "blueprint-edit",
        renames: result.renames,
        added: result.added,
        removed: result.removed,
      }),
      createdBy: "user",
    },
  });
  await prisma.artifact.update({
    where: { id: specArt.id },
    data: { currentVersionId: newSpecVersion.id },
  });

  let newBundleVersionId: string | null = null;
  if (bundleArt && result.bundle && currentBundle) {
    const beforeJson = JSON.stringify(currentBundle);
    const afterJson = JSON.stringify(result.bundle);
    if (beforeJson !== afterJson) {
      const v = await prisma.artifactVersion.create({
        data: {
          artifactId: bundleArt.id,
          parentVersionId: bundleHeadId,
          contentJson: afterJson,
          meta: JSON.stringify({
            kind: "blueprint-cascade",
            renames: result.renames,
            removed: result.removed,
          }),
          createdBy: "user",
        },
      });
      await prisma.artifact.update({
        where: { id: bundleArt.id },
        data: { currentVersionId: v.id },
      });
      newBundleVersionId = v.id;
    }
  }

  return NextResponse.json({
    specVersionId: newSpecVersion.id,
    bundleVersionId: newBundleVersionId,
    added: result.added,
    removed: result.removed,
  });
}
