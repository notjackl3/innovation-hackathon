import {
  type DemoBundle,
  type ProductSpec,
  type ScreenSpec,
  type Block,
} from "@/lib/schemas/screen";

export interface Rename {
  from: string;
  to: string;
}

export interface PropagateInput {
  spec: ProductSpec;
  /** Optional — when present, also cascade renames/deletes into bundle. */
  bundle: DemoBundle | null;
  /** The desired ordered list of screen names after edits. */
  newScreens: string[];
  /** Explicit rename mapping. Server cannot infer renames from set-diff alone. */
  renames?: Rename[];
}

export interface PropagateResult {
  spec: ProductSpec;
  bundle: DemoBundle | null;
  /** Names added compared to the previous spec (after applying renames). */
  added: string[];
  /** Names removed compared to the previous spec (after applying renames). */
  removed: string[];
  /** The applied renames (post-validation). */
  renames: Rename[];
}

export class SpecChangeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Pure: apply screen-list edits and rename mapping to the spec, and cascade
 * the same changes into the bundle when present.
 *
 * - Renames update screen.name and every navigation ref (ctaTo, submitTo,
 *   List item.to) across all bundle screens.
 * - Deletes remove the screen from the bundle and null out refs that pointed
 *   to it.
 * - startScreen survives via the rename map, or — when deleted — falls back
 *   to the first remaining bundle screen (or null if none).
 *
 * Throws SpecChangeError on:
 * - duplicate names in newScreens
 * - empty/whitespace name
 * - rename `from` not present in current spec
 * - rename `to` collides with another retained name
 */
export function propagateSpecChanges(input: PropagateInput): PropagateResult {
  const oldScreens = input.spec.screens;
  const renames = (input.renames ?? []).filter((r) => r.from !== r.to);
  const renameMap = new Map<string, string>();
  for (const r of renames) {
    if (!oldScreens.includes(r.from)) {
      throw new SpecChangeError("RENAME_SOURCE_MISSING", `Cannot rename '${r.from}' — not in spec.`);
    }
    if (renameMap.has(r.from)) {
      throw new SpecChangeError("RENAME_DUPLICATE_SOURCE", `Duplicate rename for '${r.from}'.`);
    }
    renameMap.set(r.from, r.to);
  }

  // Validate the resulting list.
  if (input.newScreens.length === 0) {
    throw new SpecChangeError("EMPTY_SCREENS", "At least one screen is required.");
  }
  const seen = new Set<string>();
  for (const name of input.newScreens) {
    if (!name || !name.trim()) {
      throw new SpecChangeError("EMPTY_NAME", "Screen names cannot be empty.");
    }
    if (seen.has(name)) {
      throw new SpecChangeError("DUPLICATE_NAME", `Duplicate screen name '${name}'.`);
    }
    seen.add(name);
  }

  // Cross-check: every rename target must appear in newScreens.
  for (const [, to] of renameMap) {
    if (!seen.has(to)) {
      throw new SpecChangeError(
        "RENAME_TARGET_MISSING",
        `Rename target '${to}' is not in the new screens list.`
      );
    }
  }

  // Compute add/remove sets (after applying renames).
  const oldEffectiveNames = oldScreens.map((n) => renameMap.get(n) ?? n);
  const oldEffectiveSet = new Set(oldEffectiveNames);
  const newSet = new Set(input.newScreens);
  const added = input.newScreens.filter((n) => !oldEffectiveSet.has(n));
  const removed = oldEffectiveNames.filter((n) => !newSet.has(n));

  // Build new spec — preserve everything but screens.
  const nextSpec: ProductSpec = { ...input.spec, screens: [...input.newScreens] };

  if (!input.bundle) {
    return { spec: nextSpec, bundle: null, added, removed, renames };
  }

  // --- Cascade to bundle ---
  const removedSet = new Set(removed);
  const remapRef = (ref: string | undefined): string | undefined => {
    if (!ref) return ref;
    const mapped = renameMap.get(ref) ?? ref;
    return removedSet.has(mapped) ? undefined : mapped;
  };
  const remapBlock = (b: Block): Block => {
    switch (b.type) {
      case "Hero":
        return { ...b, ctaTo: remapRef(b.ctaTo) };
      case "Card":
        return { ...b, ctaTo: remapRef(b.ctaTo) };
      case "Form":
        return { ...b, submitTo: remapRef(b.submitTo) };
      case "List":
        return {
          ...b,
          items: b.items.map((it) => ({ ...it, to: remapRef(it.to) })),
        };
      default:
        return b;
    }
  };

  const renamedScreens = input.bundle.screens
    .filter((s) => !removedSet.has(renameMap.get(s.name) ?? s.name))
    .map<ScreenSpec>((s) => {
      const newName = renameMap.get(s.name) ?? s.name;
      return {
        ...s,
        name: newName,
        blocks: s.blocks.map(remapBlock),
      };
    });

  // startScreen: rename through, fall back if deleted.
  const newStart =
    renameMap.get(input.bundle.startScreen) ?? input.bundle.startScreen;
  const startScreen = removedSet.has(newStart)
    ? renamedScreens[0]?.name ?? input.newScreens[0]
    : newStart;

  const nextBundle: DemoBundle = {
    ...input.bundle,
    screens: renamedScreens,
    startScreen,
  };

  return { spec: nextSpec, bundle: nextBundle, added, removed, renames };
}
