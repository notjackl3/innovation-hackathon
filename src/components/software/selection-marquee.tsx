"use client";

import { useRef, useState, type ReactNode } from "react";
import { isInteractiveTarget } from "./interaction-utils";

const DRAG_THRESHOLD_PX = 5;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarqueeProps {
  children: ReactNode;
  /**
   * Called when a drag completes with the indices of every block whose
   * bounding rect intersects the marquee rect. `additive` is true when the
   * user held Shift or Meta, asking to add to existing selection.
   */
  onMarqueeSelect: (indices: number[], additive: boolean) => void;
  /**
   * Called when the user clicks on the marquee background (i.e. not on a
   * block). Useful for "clear selection on background click". Skipped when
   * the click is actually the end of a drag.
   */
  onBackgroundClick?: () => void;
  className?: string;
}

/**
 * Tests if two rectangles intersect. Pure for testing.
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

/**
 * Given a marquee rect and a list of block rects (all in the same coordinate
 * space), returns the indices of the blocks that intersect the marquee.
 * Pure helper, exported for unit tests.
 */
export function blocksInMarquee(marquee: Rect, blocks: Array<{ index: number; rect: Rect }>): number[] {
  return blocks.filter((b) => rectsIntersect(marquee, b.rect)).map((b) => b.index);
}

export function SelectionMarquee({
  children,
  onMarqueeSelect,
  onBackgroundClick,
  className = "",
}: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; targetWasBlock: boolean } | null>(null);
  const draggedRef = useRef(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  function onPointerDown(ev: React.PointerEvent<HTMLDivElement>) {
    if (ev.button !== 0) return;
    // Let buttons, inputs, drag handles, etc. handle their own pointer events
    // — don't start a marquee on top of them or steal focus.
    if (isInteractiveTarget(ev.target)) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const x = ev.clientX - containerRect.left;
    const y = ev.clientY - containerRect.top;
    const targetWasBlock = !!(ev.target as HTMLElement).closest("[data-block-index]");
    startRef.current = { x, y, targetWasBlock };
    draggedRef.current = false;
    setMarquee(null);
    try {
      container.setPointerCapture(ev.pointerId);
    } catch {
      /* not all environments support pointer capture (e.g. happy-dom) */
    }
  }

  function onPointerMove(ev: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    const container = containerRef.current;
    if (!start || !container) return;
    const containerRect = container.getBoundingClientRect();
    const x = ev.clientX - containerRect.left;
    const y = ev.clientY - containerRect.top;
    const dx = Math.abs(x - start.x);
    const dy = Math.abs(y - start.y);
    if (!draggedRef.current && dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return;
    draggedRef.current = true;
    setMarquee({
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }

  function onPointerUp(ev: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current;
    const container = containerRef.current;
    startRef.current = null;
    if (!start || !container) {
      setMarquee(null);
      return;
    }
    try {
      container.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    if (!draggedRef.current) {
      setMarquee(null);
      if (!start.targetWasBlock) onBackgroundClick?.();
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const x = ev.clientX - containerRect.left;
    const y = ev.clientY - containerRect.top;
    const final: Rect = {
      left: Math.min(start.x, x),
      top: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    };
    const nodes = container.querySelectorAll<HTMLElement>("[data-block-index]");
    const blocks: Array<{ index: number; rect: Rect }> = [];
    nodes.forEach((node) => {
      const idx = Number(node.dataset.blockIndex);
      if (!Number.isInteger(idx)) return;
      const r = node.getBoundingClientRect();
      blocks.push({
        index: idx,
        rect: {
          left: r.left - containerRect.left,
          top: r.top - containerRect.top,
          width: r.width,
          height: r.height,
        },
      });
    });
    const hits = blocksInMarquee(final, blocks);
    onMarqueeSelect(hits, ev.shiftKey || ev.metaKey);
    setMarquee(null);
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        startRef.current = null;
        setMarquee(null);
      }}
      className={`relative select-none ${className}`}
    >
      {children}
      {marquee && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-20 rounded-sm border border-primary/60 bg-primary/10"
          style={{
            left: marquee.left,
            top: marquee.top,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      )}
    </div>
  );
}
