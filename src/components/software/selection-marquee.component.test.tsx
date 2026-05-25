// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SelectionMarquee } from "./selection-marquee";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * happy-dom doesn't run layout, so getBoundingClientRect returns zeros by
 * default. Stub it on the marquee container and on each block wrapper so
 * the intersection math runs against predictable rects.
 */
function stubRects(map: WeakMap<Element, DOMRect>) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const r = map.get(this);
    if (r) return r;
    return original.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  // happy-dom ships PointerEvent; fall back to MouseEvent for safety.
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  if (Ctor) return new Ctor(type, { bubbles: true, button: 0, pointerId: 1, ...init });
  return new MouseEvent(type, { bubbles: true, button: 0, ...init }) as unknown as PointerEvent;
}

function renderMarquee(onMarqueeSelect: ReturnType<typeof vi.fn>, onBackgroundClick?: ReturnType<typeof vi.fn>) {
  act(() => {
    root.render(
      <SelectionMarquee onMarqueeSelect={onMarqueeSelect} onBackgroundClick={onBackgroundClick}>
        <div data-block-index={0} style={{ height: 80 }}>
          A
        </div>
        <div data-block-index={1} style={{ height: 80 }}>
          B
        </div>
        <div data-block-index={2} style={{ height: 80 }}>
          C
        </div>
      </SelectionMarquee>
    );
  });
}

describe("SelectionMarquee", () => {
  it("does not call onMarqueeSelect for a sub-threshold drag (treated as a click)", () => {
    const onMarqueeSelect = vi.fn();
    const onBackgroundClick = vi.fn();
    renderMarquee(onMarqueeSelect, onBackgroundClick);
    const marquee = container.firstElementChild as HTMLElement;

    const rects = new WeakMap<Element, DOMRect>();
    rects.set(marquee, rect(0, 0, 400, 400));
    const restore = stubRects(rects);

    act(() => {
      marquee.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
      marquee.dispatchEvent(pointer("pointermove", { clientX: 12, clientY: 12 }));
      marquee.dispatchEvent(pointer("pointerup", { clientX: 12, clientY: 12 }));
    });

    expect(onMarqueeSelect).not.toHaveBeenCalled();
    // Background click should fire (no block under pointer in this stub layout)
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);

    restore();
  });

  it("calls onMarqueeSelect with indices of intersected blocks on a real drag", () => {
    const onMarqueeSelect = vi.fn();
    renderMarquee(onMarqueeSelect);
    const marquee = container.firstElementChild as HTMLElement;
    const blocks = container.querySelectorAll<HTMLElement>("[data-block-index]");

    const rects = new WeakMap<Element, DOMRect>();
    rects.set(marquee, rect(0, 0, 400, 400));
    rects.set(blocks[0], rect(0, 0, 400, 80));
    rects.set(blocks[1], rect(0, 100, 400, 80));
    rects.set(blocks[2], rect(0, 200, 400, 80));
    const restore = stubRects(rects);

    act(() => {
      marquee.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 50 }));
      marquee.dispatchEvent(pointer("pointermove", { clientX: 200, clientY: 150 }));
      marquee.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 150 }));
    });

    expect(onMarqueeSelect).toHaveBeenCalledTimes(1);
    const [hits, additive] = onMarqueeSelect.mock.calls[0];
    expect(hits.sort()).toEqual([0, 1]);
    expect(additive).toBe(false);

    restore();
  });

  it("passes additive=true when shift is held during pointerup", () => {
    const onMarqueeSelect = vi.fn();
    renderMarquee(onMarqueeSelect);
    const marquee = container.firstElementChild as HTMLElement;
    const blocks = container.querySelectorAll<HTMLElement>("[data-block-index]");

    const rects = new WeakMap<Element, DOMRect>();
    rects.set(marquee, rect(0, 0, 400, 400));
    rects.set(blocks[0], rect(0, 0, 400, 80));
    rects.set(blocks[1], rect(0, 100, 400, 80));
    rects.set(blocks[2], rect(0, 200, 400, 80));
    const restore = stubRects(rects);

    act(() => {
      marquee.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 210 }));
      marquee.dispatchEvent(pointer("pointermove", { clientX: 100, clientY: 260 }));
      marquee.dispatchEvent(pointer("pointerup", { clientX: 100, clientY: 260, shiftKey: true }));
    });

    expect(onMarqueeSelect).toHaveBeenCalledTimes(1);
    const [hits, additive] = onMarqueeSelect.mock.calls[0];
    expect(hits).toEqual([2]);
    expect(additive).toBe(true);

    restore();
  });

  it("emits an empty array when the drag misses every block", () => {
    const onMarqueeSelect = vi.fn();
    renderMarquee(onMarqueeSelect);
    const marquee = container.firstElementChild as HTMLElement;
    const blocks = container.querySelectorAll<HTMLElement>("[data-block-index]");

    const rects = new WeakMap<Element, DOMRect>();
    rects.set(marquee, rect(0, 0, 400, 400));
    rects.set(blocks[0], rect(0, 0, 50, 50));
    rects.set(blocks[1], rect(0, 100, 50, 50));
    rects.set(blocks[2], rect(0, 200, 50, 50));
    const restore = stubRects(rects);

    act(() => {
      marquee.dispatchEvent(pointer("pointerdown", { clientX: 300, clientY: 300 }));
      marquee.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 380 }));
      marquee.dispatchEvent(pointer("pointerup", { clientX: 380, clientY: 380 }));
    });

    expect(onMarqueeSelect).toHaveBeenCalledTimes(1);
    expect(onMarqueeSelect.mock.calls[0][0]).toEqual([]);

    restore();
  });

  it("does NOT trigger onBackgroundClick when the click lands on a block", () => {
    const onMarqueeSelect = vi.fn();
    const onBackgroundClick = vi.fn();
    renderMarquee(onMarqueeSelect, onBackgroundClick);
    const blocks = container.querySelectorAll<HTMLElement>("[data-block-index]");

    act(() => {
      blocks[0].dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
      blocks[0].dispatchEvent(pointer("pointerup", { clientX: 11, clientY: 11 }));
    });

    expect(onMarqueeSelect).not.toHaveBeenCalled();
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });

  it("ignores non-primary buttons", () => {
    const onMarqueeSelect = vi.fn();
    const onBackgroundClick = vi.fn();
    renderMarquee(onMarqueeSelect, onBackgroundClick);
    const marquee = container.firstElementChild as HTMLElement;

    act(() => {
      marquee.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10, button: 2 }));
      marquee.dispatchEvent(pointer("pointermove", { clientX: 200, clientY: 200 }));
      marquee.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 200, button: 2 }));
    });

    expect(onMarqueeSelect).not.toHaveBeenCalled();
    expect(onBackgroundClick).not.toHaveBeenCalled();
  });
});
