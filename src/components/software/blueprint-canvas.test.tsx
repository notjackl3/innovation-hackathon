// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BlueprintCanvas } from "./blueprint-canvas";
import type { DemoBundle, ProductSpec } from "@/lib/schemas/screen";

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

function spec(screens = ["Home", "Upload", "Review", "Settings"]): ProductSpec {
  return {
    name: "ReceiptParser",
    tagline: "Receipts → JSON",
    problem: "p",
    users: ["acct"],
    features: ["upload"],
    screens,
  };
}

function bundle(): DemoBundle {
  return {
    appName: "ReceiptParser",
    tagline: "Receipts → JSON",
    startScreen: "Home",
    screens: [
      {
        name: "Home",
        title: "Home",
        navLabel: "Home",
        blocks: [
          { type: "Hero", headline: "Hi", ctaTo: "Upload" },
          {
            type: "Stats",
            items: [
              { label: "A", value: "1" },
              { label: "B", value: "2" },
            ],
          },
          { type: "Form", fields: [{ label: "X", kind: "text" }], submitLabel: "Go" },
        ],
      },
      {
        name: "Upload",
        title: "Upload",
        navLabel: "Upload",
        blocks: [{ type: "Hero", headline: "Up" }],
      },
      {
        name: "Review",
        title: "Review",
        navLabel: "Review",
        blocks: [{ type: "Card", title: "R", body: "" }],
      },
    ],
  };
}

function cards(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-blueprint-card]"));
}

function clickType(el: Element, type = "click", init: MouseEventInit = {}) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BlueprintCanvas — rendering", () => {
  it("renders one card per screen", () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    expect(cards()).toHaveLength(4);
    expect(cards().map((c) => c.dataset.screenName)).toEqual([
      "Home",
      "Upload",
      "Review",
      "Settings",
    ]);
  });

  it("marks the bundle startScreen with a Start pill", () => {
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={bundle()} onCommit={vi.fn()} />);
    });
    const home = cards().find((c) => c.dataset.screenName === "Home")!;
    expect(home.textContent).toContain("Start");
  });

  it("marks unbuilt screens with a Not built pill", () => {
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={bundle()} onCommit={vi.fn()} />);
    });
    const settings = cards().find((c) => c.dataset.screenName === "Settings")!;
    expect(settings.textContent).toContain("Not built");
    const home = cards().find((c) => c.dataset.screenName === "Home")!;
    expect(home.textContent).not.toContain("Not built");
  });

  it("skeleton stripes have data-block-type matching the bundle blocks", () => {
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={bundle()} onCommit={vi.fn()} />);
    });
    const home = cards().find((c) => c.dataset.screenName === "Home")!;
    const stripes = Array.from(home.querySelectorAll<HTMLElement>("[data-block-type]"));
    expect(stripes.map((s) => s.dataset.blockType)).toEqual(["Hero", "Stats", "Form"]);
  });
});

describe("BlueprintCanvas — rename", () => {
  it("double-clicking a name opens an input; Enter commits and calls onCommit with the rename mapping", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const home = cards()[0];
    const nameBtn = home.querySelector<HTMLElement>("[data-blueprint-name]")!;
    clickType(nameBtn, "dblclick");
    const input = home.querySelector<HTMLInputElement>("[data-blueprint-rename-input]")!;
    expect(input).toBeTruthy();
    setInputValue(input, "Landing");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [newScreens, renames] = onCommit.mock.calls[0];
    expect(newScreens).toEqual(["Landing", "Upload", "Review", "Settings"]);
    expect(renames).toEqual([{ from: "Home", to: "Landing" }]);
  });

  it("Escape cancels the rename without firing onCommit", () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const home = cards()[0];
    clickType(home.querySelector("[data-blueprint-name]")!, "dblclick");
    const input = home.querySelector<HTMLInputElement>("[data-blueprint-rename-input]")!;
    setInputValue(input, "Whatever");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("rejects rename to an existing screen name without calling onCommit", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const home = cards()[0];
    clickType(home.querySelector("[data-blueprint-name]")!, "dblclick");
    const input = home.querySelector<HTMLInputElement>("[data-blueprint-rename-input]")!;
    setInputValue(input, "Upload"); // already exists
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/already exists/i);
  });

  it("renaming a previously-renamed screen chains rather than producing two renames", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    // Home → Landing
    const home = cards()[0];
    clickType(home.querySelector("[data-blueprint-name]")!, "dblclick");
    let input = home.querySelector<HTMLInputElement>("[data-blueprint-rename-input]")!;
    setInputValue(input, "Landing");
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    // Now Landing → Welcome
    const landing = cards()[0];
    clickType(landing.querySelector("[data-blueprint-name]")!, "dblclick");
    input = landing.querySelector<HTMLInputElement>("[data-blueprint-rename-input]")!;
    setInputValue(input, "Welcome");
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(2);
    const lastCall = onCommit.mock.calls[1];
    expect(lastCall[1]).toEqual([{ from: "Home", to: "Welcome" }]);
  });
});

describe("BlueprintCanvas — delete", () => {
  it("delete button fires onCommit with the screen removed", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const upload = cards().find((c) => c.dataset.screenName === "Upload")!;
    const delBtn = upload.querySelector("[data-blueprint-delete]") as HTMLElement;
    clickType(delBtn);
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toEqual(["Home", "Review", "Settings"]);
  });

  it("refuses to delete the last remaining screen", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec(["Solo"])} bundle={null} onCommit={onCommit} />);
    });
    const solo = cards()[0];
    clickType(solo.querySelector("[data-blueprint-delete]")!);
    await flush();
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/at least one/i);
  });
});

describe("BlueprintCanvas — add", () => {
  it("typing a name into the add tile and clicking + Add fires onCommit", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const addInput = container.querySelector<HTMLInputElement>("[data-blueprint-add-input]")!;
    setInputValue(addInput, "ReceiptDetail");
    const addBtn = container.querySelector<HTMLButtonElement>("[data-blueprint-add-btn]")!;
    clickType(addBtn);
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toEqual([
      "Home",
      "Upload",
      "Review",
      "Settings",
      "ReceiptDetail",
    ]);
    expect(onCommit.mock.calls[0][1]).toEqual([]); // no rename for an add
  });

  it("pressing Enter inside the add input also commits", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const addInput = container.querySelector<HTMLInputElement>("[data-blueprint-add-input]")!;
    setInputValue(addInput, "Onboard");
    act(() => {
      addInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await flush();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toContain("Onboard");
  });

  it("rejects adding a duplicate name", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const addInput = container.querySelector<HTMLInputElement>("[data-blueprint-add-input]")!;
    setInputValue(addInput, "Home");
    clickType(container.querySelector("[data-blueprint-add-btn]")!);
    await flush();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("BlueprintCanvas — optimistic + revert", () => {
  it("reverts local state when onCommit rejects", async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error("boom"));
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    const upload = cards().find((c) => c.dataset.screenName === "Upload")!;
    clickType(upload.querySelector("[data-blueprint-delete]")!);
    await flush();
    // After revert, Upload should still exist.
    expect(cards().some((c) => c.dataset.screenName === "Upload")).toBe(true);
    expect(container.textContent).toMatch(/boom/);
  });

  it("syncs to new spec props (server-confirmed state)", () => {
    const onCommit = vi.fn();
    act(() => {
      root.render(<BlueprintCanvas spec={spec()} bundle={null} onCommit={onCommit} />);
    });
    expect(cards()).toHaveLength(4);
    act(() => {
      root.render(
        <BlueprintCanvas
          spec={spec(["Home", "Upload"])}
          bundle={null}
          onCommit={onCommit}
        />
      );
    });
    expect(cards()).toHaveLength(2);
  });
});

describe("BlueprintCanvas — onSelectScreen", () => {
  it("clicking the name button fires onSelectScreen", () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <BlueprintCanvas
          spec={spec()}
          bundle={null}
          onCommit={vi.fn()}
          onSelectScreen={onSelect}
        />
      );
    });
    const home = cards()[0];
    clickType(home.querySelector("[data-blueprint-name]")!);
    expect(onSelect).toHaveBeenCalledWith("Home");
  });

  it("clicking the delete button does NOT fire onSelectScreen", () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <BlueprintCanvas
          spec={spec()}
          bundle={null}
          onCommit={vi.fn().mockResolvedValue(undefined)}
          onSelectScreen={onSelect}
        />
      );
    });
    const home = cards()[0];
    clickType(home.querySelector("[data-blueprint-delete]")!);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
