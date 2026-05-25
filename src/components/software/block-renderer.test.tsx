// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BlockRenderer } from "./block-renderer";
import type { ScreenSpec } from "@/lib/schemas/screen";

// React 19 expects this global so act() warnings stay silent.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buildSpec(): ScreenSpec {
  return {
    name: "Dashboard",
    title: "Dashboard",
    navLabel: "Home",
    blocks: [
      { type: "Hero", headline: "Welcome" },
      { type: "Card", title: "Card", body: "body" },
      { type: "Detail", title: "Detail", sections: [{ heading: "h", body: "b" }] },
    ],
  };
}

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

describe("BlockRenderer (non-selectable)", () => {
  it("does not attach data-block-index when selectable is omitted", () => {
    act(() => {
      root.render(
        <BlockRenderer spec={buildSpec()} screenIndex={{}} onNavigate={() => {}} />
      );
    });
    expect(container.querySelectorAll("[data-block-index]")).toHaveLength(0);
  });
});

describe("BlockRenderer (selectable)", () => {
  it("wraps every block with data-block-index in order", () => {
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
        />
      );
    });
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-block-index]")
    );
    expect(wrappers).toHaveLength(3);
    expect(wrappers.map((w) => w.dataset.blockIndex)).toEqual(["0", "1", "2"]);
  });

  it("applies the selection ring class only to indices in selectedIndices", () => {
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
          selectedIndices={[0, 2]}
        />
      );
    });
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-block-index]")
    );
    expect(wrappers[0].getAttribute("aria-selected")).toBe("true");
    expect(wrappers[1].getAttribute("aria-selected")).toBe("false");
    expect(wrappers[2].getAttribute("aria-selected")).toBe("true");
    expect(wrappers[0].className).toContain("outline-primary");
    expect(wrappers[1].className).not.toContain("outline-primary");
  });

  it("fires onToggleSelect with the index when a wrapper is clicked", () => {
    const onToggle = vi.fn();
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
          onToggleSelect={onToggle}
        />
      );
    });
    const wrappers = Array.from(
      container.querySelectorAll<HTMLElement>("[data-block-index]")
    );
    act(() => {
      wrappers[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle.mock.calls[0][0]).toBe(1);
  });

  it("shows the index badge only when selected", () => {
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
          selectedIndices={[1]}
        />
      );
    });
    const badges = container.querySelectorAll("span.bg-primary");
    // exactly one selected block → exactly one #N badge
    const indexBadges = Array.from(badges).filter((b) => /^#\d+$/.test(b.textContent ?? ""));
    expect(indexBadges).toHaveLength(1);
    expect(indexBadges[0].textContent).toBe("#1");
  });

  it("re-renders cleanly when selectedIndices changes", () => {
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
          selectedIndices={[0]}
        />
      );
    });
    const initial = container.querySelectorAll<HTMLElement>("[aria-selected='true']");
    expect(initial).toHaveLength(1);
    act(() => {
      root.render(
        <BlockRenderer
          spec={buildSpec()}
          screenIndex={{}}
          onNavigate={() => {}}
          selectable
          selectedIndices={[1, 2]}
        />
      );
    });
    const after = container.querySelectorAll<HTMLElement>("[aria-selected='true']");
    expect(after).toHaveLength(2);
  });
});
