/**
 * Pure helpers for managing the set of selected block indices in the
 * software workspace. Kept side-effect-free so they can be unit-tested
 * without mounting React.
 */

function sorted(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

/**
 * Single-block click. Without additive: replace selection with [index],
 * unless index was the only selected one (in which case deselect → []).
 * With additive (shift/meta): toggle membership of `index`.
 */
export function toggleBlock(prev: number[], index: number, additive: boolean): number[] {
  const has = prev.includes(index);
  if (additive) {
    return sorted(has ? prev.filter((i) => i !== index) : [...prev, index]);
  }
  if (has && prev.length === 1) return [];
  return [index];
}

/**
 * Marquee finished. Without additive: replace selection with hits (or
 * clear if hits is empty). With additive: union into existing selection.
 */
export function applyMarqueeHits(
  prev: number[],
  indices: number[],
  additive: boolean
): number[] {
  if (indices.length === 0) return additive ? prev : [];
  const merged = additive ? Array.from(new Set([...prev, ...indices])) : indices;
  return sorted(merged);
}
