import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/ai/text";
import { registerHandler } from "@/lib/jobs/runner";
import {
  ScreenSpecSchema,
  DemoBundleSchema,
  ProductSpecSchema,
  type ScreenSpec,
  type DemoBundle,
  safeParseBlocks,
} from "@/lib/schemas/screen";
import { getTrackContext } from "./_helpers";
import { mockEditScreen } from "./mock-edit-screen";

interface Input {
  trackId: string;
  productSpecArtifactId: string;
  /** Optional: regenerate a single screen by name. */
  onlyScreen?: string;
  /** Optional: target an existing DEMO_BUNDLE artifact to update. */
  bundleArtifactId?: string;
  /**
   * Optional: when set together with onlyScreen, the LLM revises the existing
   * screen using this instruction instead of generating from scratch.
   */
  editInstruction?: string;
  /**
   * Optional: when set with editInstruction, the LLM is told to only modify
   * blocks at these indices and pass the rest through verbatim.
   */
  selectedBlockIndices?: number[];
}

interface Output {
  artifactId: string;
  versionId: string;
  bundle: DemoBundle;
}

function mockScreen(name: string, screens: string[]): ScreenSpec {
  const navOther = screens.filter((s) => s !== name).slice(0, 3);
  const ctaTo = navOther[0] ?? screens[0];
  if (/dashboard/i.test(name)) {
    return {
      name,
      title: "Dashboard",
      navLabel: "Home",
      blocks: [
        {
          type: "Hero",
          headline: "Welcome back",
          sub: "Here's what's happening today.",
          ctaLabel: "Create new",
          ctaTo: navOther.find((s) => /create/i.test(s)) ?? ctaTo,
        },
        {
          type: "Stats",
          items: [
            { label: "Active", value: "1,284", delta: "+12%" },
            { label: "Pipeline", value: "$48k", delta: "+4%" },
            { label: "Customers", value: "92" },
          ],
        },
        {
          type: "Chart",
          kind: "line",
          xLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          series: [{ label: "Sessions", data: [12, 19, 18, 24, 28, 30, 27] }],
        },
        {
          type: "List",
          items: navOther.map((n) => ({ title: n, sub: `Open ${n}`, to: n })),
        },
      ],
    };
  }
  if (/create/i.test(name)) {
    return {
      name,
      title: "Create",
      navLabel: name,
      blocks: [
        { type: "Hero", headline: "Start something new", sub: "Fill in the details." },
        {
          type: "Form",
          fields: [
            { label: "Title", kind: "text" },
            { label: "Type", kind: "select", options: ["Idea", "Task", "Project"] },
            { label: "Description", kind: "textarea" },
          ],
          submitLabel: "Create",
          submitTo: navOther[0] ?? screens[0],
        },
      ],
    };
  }
  if (/setting/i.test(name)) {
    return {
      name,
      title: "Settings",
      navLabel: name,
      blocks: [
        { type: "Hero", headline: "Settings", sub: "Manage your workspace." },
        {
          type: "Form",
          fields: [
            { label: "Workspace name", kind: "text" },
            { label: "Notifications", kind: "select", options: ["All", "Mentions", "None"] },
          ],
          submitLabel: "Save",
        },
      ],
    };
  }
  return {
    name,
    title: name,
    navLabel: name,
    blocks: [
      { type: "Hero", headline: name, sub: "Detail view." },
      {
        type: "Detail",
        title: name,
        sections: [
          { heading: "Overview", body: "Key information about this item." },
          { heading: "Activity", body: "Recent updates." },
        ],
      },
      {
        type: "Card",
        title: "Next step",
        body: "Move forward with the next action.",
        ctaLabel: "Go",
        ctaTo,
      },
    ],
  };
}

registerHandler<Input, Output>("GEN_SCREEN_SPEC", async (input, ctx) => {
  const { track } = await getTrackContext(input.trackId);
  if (track.kind !== "SOFTWARE") throw new Error("GEN_SCREEN_SPEC requires SOFTWARE track");

  const specArtifact = await prisma.artifact.findUnique({
    where: { id: input.productSpecArtifactId },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!specArtifact?.versions[0]?.contentJson) throw new Error("Product spec missing");
  const spec = ProductSpecSchema.parse(JSON.parse(specArtifact.versions[0].contentJson));

  // Determine target screens
  const targetScreens = input.onlyScreen ? [input.onlyScreen] : spec.screens;
  await ctx.log(`Generating ${targetScreens.length} screen(s).`);
  await ctx.setProgress(15);

  // Load or create the bundle
  let bundle: DemoBundle;
  let bundleArtifactId = input.bundleArtifactId;
  let parentVersionId: string | null = null;
  if (bundleArtifactId) {
    const existing = await prisma.artifact.findUnique({
      where: { id: bundleArtifactId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    bundle = DemoBundleSchema.parse(JSON.parse(existing?.versions[0]?.contentJson ?? "{}"));
    parentVersionId = existing?.versions[0]?.id ?? null;
  } else {
    bundle = {
      appName: spec.name,
      tagline: spec.tagline,
      screens: [],
      startScreen: spec.screens[0],
    };
  }

  const editing =
    !!input.editInstruction?.trim() && !!input.onlyScreen && targetScreens.length === 1;

  for (let i = 0; i < targetScreens.length; i++) {
    const name = targetScreens[i];
    await ctx.setProgress(15 + Math.round((i / targetScreens.length) * 75));

    const existing = editing ? bundle.screens.find((s) => s.name === name) ?? null : null;

    const selection = input.selectedBlockIndices?.filter(
      (i) => Number.isInteger(i) && existing && i >= 0 && i < existing.blocks.length
    );
    const hasSelection = !!selection && selection.length > 0;

    const response = await chatJson<ScreenSpec>(
      existing
        ? {
            system: hasSelection
              ? "You revise a single screen of a software demo. The user selected specific block indices to change. Output the FULL updated ScreenSpec JSON: every block whose index is NOT in SELECTED_INDICES must be returned verbatim from CURRENT SCREEN JSON. Only the selected blocks may be modified. Keep the same name. Block types: Hero, Stats, Table, Form, Chart, Card, List, Detail. ctaTo/submitTo/to must reference a provided screen name."
              : "You revise a single screen of a software demo. The user gives you the CURRENT screen spec as JSON and an edit instruction. Output the FULL updated ScreenSpec JSON, preserving anything the instruction does not change. Keep the same name. Blocks may be Hero, Stats, Table, Form, Chart, Card, List, Detail. ctaTo/submitTo/to fields must reference one of the provided screen names.",
            user: `APP: ${spec.name} - ${spec.tagline}\nALL SCREENS: ${spec.screens.join(", ")}\nSCREEN NAME: ${name}\n\nCURRENT SCREEN JSON:\n${JSON.stringify(existing, null, 2)}\n${hasSelection ? `\nSELECTED_INDICES: ${JSON.stringify(selection)}\n` : ""}\nEDIT INSTRUCTION: ${input.editInstruction}\n\nReturn the full updated screen as JSON {name: "${name}", title, navLabel, blocks: [...]}.`,
            jsonSchema: ScreenSpecSchema,
            mockResponse: mockEditScreen(existing, input.editInstruction ?? "", selection),
          }
        : {
            system:
              "You design a single screen for a software demo. Only output JSON matching the ScreenSpec schema. Blocks may be Hero, Stats, Table, Form, Chart, Card, List, Detail. ctaTo/submitTo/to fields must reference one of the provided screen names.",
            user: `APP: ${spec.name} - ${spec.tagline}\nSCREEN NAME: ${name}\nFEATURES: ${spec.features.join(", ")}\nALL SCREENS: ${spec.screens.join(", ")}\n\nReturn JSON {name: "${name}", title, navLabel, blocks: [...]}.`,
            jsonSchema: ScreenSpecSchema,
            mockResponse: mockScreen(name, spec.screens),
          }
    );
    // Defense in depth: validate blocks and drop bad ones.
    const cleaned: ScreenSpec = {
      ...response,
      name,
      blocks: safeParseBlocks(response.blocks),
    };
    bundle.screens = [...bundle.screens.filter((s) => s.name !== name), cleaned];
  }

  // Persist bundle
  let artifact;
  if (bundleArtifactId) {
    artifact = await prisma.artifact.findUnique({ where: { id: bundleArtifactId } });
  } else {
    artifact = await prisma.artifact.create({
      data: { trackId: track.id, kind: "DEMO_BUNDLE", label: "Software demo" },
    });
    bundleArtifactId = artifact!.id;
  }
  const version = await prisma.artifactVersion.create({
    data: {
      artifactId: bundleArtifactId,
      parentVersionId,
      contentJson: JSON.stringify(bundle),
      meta: JSON.stringify({
        screensUpdated: targetScreens,
        ...(editing
          ? {
              editInstruction: input.editInstruction,
              ...(input.selectedBlockIndices?.length
                ? { selectedBlockIndices: input.selectedBlockIndices }
                : {}),
            }
          : {}),
      }),
      createdBy: "ai",
    },
  });
  await prisma.artifact.update({
    where: { id: bundleArtifactId },
    data: { currentVersionId: version.id },
  });
  await prisma.visualizationTrack.update({
    where: { id: track.id },
    data: { status: "READY" },
  });
  await ctx.setProgress(100);
  return { artifactId: bundleArtifactId, versionId: version.id, bundle };
});
