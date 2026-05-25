import type { Block, ScreenSpec } from "@/lib/schemas/screen";

/**
 * Visibly mutate the screen so mock-mode edits actually change pixels. Tags
 * affected block titles/headlines with "(edited: …)" and prepends a Card
 * receipt at the top so the user sees the edit landed.
 *
 * Pure — extracted from gen-screen-spec.ts so unit tests don't pull in Prisma.
 */
export function mockEditScreen(
  existing: ScreenSpec,
  instruction: string,
  selectedIndices: number[] | undefined
): ScreenSpec {
  const targetSet =
    selectedIndices && selectedIndices.length > 0 ? new Set(selectedIndices) : null;
  const tag = (s: string) => `${s} (edited: ${instruction.slice(0, 40)})`;
  const nextBlocks: Block[] = existing.blocks.map((b, i) => {
    if (targetSet && !targetSet.has(i)) return b;
    switch (b.type) {
      case "Hero":
        return { ...b, headline: tag(b.headline) };
      case "Card":
        return { ...b, title: tag(b.title) };
      case "Detail":
        return { ...b, title: tag(b.title) };
      case "Stats":
        return {
          ...b,
          items: b.items.map((it, k) =>
            k === 0 ? { ...it, label: tag(it.label) } : it
          ),
        };
      case "List":
        return {
          ...b,
          items: b.items.map((it, k) =>
            k === 0 ? { ...it, title: tag(it.title) } : it
          ),
        };
      default:
        return b;
    }
  });
  const receipt: Block = {
    type: "Card",
    title: targetSet ? `Edit applied to ${targetSet.size} block(s)` : "Edit applied",
    body: instruction,
  };
  // ScreenSpec caps blocks at 8 — keep the receipt and trim from the bottom.
  const MAX_BLOCKS = 8;
  const combined = [receipt, ...nextBlocks].slice(0, MAX_BLOCKS);
  return { ...existing, blocks: combined };
}
