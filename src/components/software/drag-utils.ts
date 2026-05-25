/**
 * Pure helpers for drag-to-reorder. Kept side-effect-free so unit tests can
 * exercise them without mounting React or stubbing DOM rects.
 */

export interface BlockSlot {
  index: number;
  /** Container-relative top of the block. */
  top: number;
  /** Container-relative bottom of the block (top + height). */
  bottom: number;
}

/**
 * Given the cursor's container-relative Y and the layout of every block,
 * decide which insertion slot the user is hovering over. Returns an index in
 * [0, slots.length] — a value equal to slots.length means "drop at the end".
 *
 * The slot for a row is its midpoint: cursors above the midpoint count as
 * "drop above this row", cursors below count as "drop below this row".
 */
export function computeDropTarget(cursorY: number, slots: BlockSlot[]): number {
  if (slots.length === 0) return 0;
  const sorted = [...slots].sort((a, b) => a.top - b.top);
  for (let i = 0; i < sorted.length; i++) {
    const mid = (sorted[i].top + sorted[i].bottom) / 2;
    if (cursorY < mid) return i;
  }
  return sorted.length;
}

/**
 * Reorder an array by moving the item at `from` so it ends up at position
 * `to` (where `to` is an *insertion* index against the original array, i.e.
 * the values returned by computeDropTarget). Returns a new array; the input
 * is not mutated.
 *
 * Common edge cases:
 *  - move(X, [a,b,c,d], 1, 3) ⇒ [a,c,b,d]
 *  - moving to the same slot or the slot immediately after is a no-op.
 */
export function moveBlock<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  if (to < 0) to = 0;
  if (to > items.length) to = items.length;
  // Dropping into the slot you came from, or the slot immediately after,
  // leaves the array unchanged.
  if (to === from || to === from + 1) return items.slice();
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  // After removal the indices >= from shift down by 1, so adjust `to`.
  const insertAt = to > from ? to - 1 : to;
  next.splice(insertAt, 0, moved);
  return next;
}
