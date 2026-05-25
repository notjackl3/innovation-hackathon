/**
 * Selectors for elements that should "swallow" pointer/click events — i.e.
 * the user is trying to interact with them, not select the surrounding
 * block. Used by BlockRenderer (skip click-to-select) and SelectionMarquee
 * (skip starting a marquee on top of them).
 *
 * Includes [data-drag-handle] so a pointerdown on the drag handle starts a
 * reorder drag instead of being treated as a marquee or a click-toggle.
 */
const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, option, label, a, [role='button'], [contenteditable='true'], [data-drag-handle]";

/**
 * True if the given event target sits inside an element the user actually
 * intends to interact with (form control, link, button, drag handle).
 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest(INTERACTIVE_SELECTOR);
}
