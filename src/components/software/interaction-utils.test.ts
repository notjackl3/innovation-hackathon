// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";
import { isInteractiveTarget } from "./interaction-utils";

function el(html: string): Element {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return wrap.firstElementChild!;
}

describe("isInteractiveTarget", () => {
  it("returns false for null", () => {
    expect(isInteractiveTarget(null)).toBe(false);
  });

  it("returns false for plain divs and spans", () => {
    expect(isInteractiveTarget(el("<div>x</div>"))).toBe(false);
    expect(isInteractiveTarget(el("<span>x</span>"))).toBe(false);
    expect(isInteractiveTarget(el("<h2>x</h2>"))).toBe(false);
  });

  it("returns true for buttons, inputs, textareas, selects, anchors", () => {
    expect(isInteractiveTarget(el("<button>x</button>"))).toBe(true);
    expect(isInteractiveTarget(el("<input />"))).toBe(true);
    expect(isInteractiveTarget(el("<textarea></textarea>"))).toBe(true);
    expect(isInteractiveTarget(el("<select><option>x</option></select>"))).toBe(true);
    expect(isInteractiveTarget(el("<a href='#'>x</a>"))).toBe(true);
  });

  it("returns true for nested children of an interactive element", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = "<button><span class='inner'>label</span></button>";
    const inner = wrap.querySelector(".inner")!;
    expect(isInteractiveTarget(inner)).toBe(true);
  });

  it("returns true for role='button'", () => {
    expect(isInteractiveTarget(el("<div role='button'>x</div>"))).toBe(true);
  });

  it("returns true for elements marked as drag handles", () => {
    expect(isInteractiveTarget(el("<div data-drag-handle>x</div>"))).toBe(true);
  });

  it("returns true for editable content", () => {
    expect(isInteractiveTarget(el("<div contenteditable='true'>x</div>"))).toBe(true);
  });

  it("returns false when only the parent has data-block-index but child isn't interactive", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = "<div data-block-index='0'><h2 class='headline'>Hi</h2></div>";
    const headline = wrap.querySelector(".headline")!;
    expect(isInteractiveTarget(headline)).toBe(false);
  });
});
