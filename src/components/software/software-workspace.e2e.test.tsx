// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SoftwareWorkspace } from "./software-workspace";
import type { DemoBundle, ProductSpec } from "@/lib/schemas/screen";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// next/navigation depends on internal Next.js context. Replace useRouter
// with a no-op so the workspace can mount in isolation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// --- Fixture builders ------------------------------------------------------

function buildSpec(): ProductSpec {
  return {
    name: "ReceiptParser",
    tagline: "Receipts → JSON",
    problem: "p",
    users: ["acct"],
    features: ["upload"],
    screens: ["Home", "Upload", "Settings"],
  };
}

function buildBundle(): DemoBundle {
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
          { type: "Hero", headline: "Welcome", ctaLabel: "Get started", ctaTo: "Upload" },
          {
            type: "Stats",
            items: [
              { label: "Total", value: "15" },
              { label: "Done", value: "10" },
            ],
          },
          {
            type: "Form",
            fields: [{ label: "Email", kind: "text" }],
            submitLabel: "Save",
          },
          { type: "Card", title: "Tips", body: "Hi" },
        ],
      },
      {
        name: "Upload",
        title: "Upload",
        navLabel: "Upload",
        blocks: [{ type: "Hero", headline: "Upload" }],
      },
      {
        name: "Settings",
        title: "Settings",
        navLabel: "Settings",
        blocks: [{ type: "Hero", headline: "Settings" }],
      },
    ],
  };
}

function buildArtifacts() {
  return [
    {
      id: "spec-art",
      kind: "PRODUCT_SPEC",
      currentVersionId: "spec-v",
      versions: [
        { id: "spec-v", contentJson: JSON.stringify(buildSpec()), createdAt: "2024-01-01T00:00:00Z" },
      ],
    },
    {
      id: "bundle-art",
      kind: "DEMO_BUNDLE",
      currentVersionId: "bundle-v",
      versions: [
        { id: "bundle-v", contentJson: JSON.stringify(buildBundle()), createdAt: "2024-01-01T00:00:00Z" },
      ],
    },
  ];
}

// --- Fetch stub -----------------------------------------------------------

interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

let captured: CapturedRequest[];
let fetchStub: ReturnType<typeof vi.fn>;

function installFetchStub(overrides: Record<string, (body: unknown) => unknown> = {}) {
  captured = [];
  fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const bodyText = typeof init?.body === "string" ? init.body : undefined;
    const body = bodyText ? JSON.parse(bodyText) : undefined;
    captured.push({ url, method, body });
    const handler = overrides[`${method} ${url}`];
    let payload: unknown;
    if (handler) {
      payload = handler(body);
    } else if (url.startsWith("/api/jobs/")) {
      // Default: any job poll returns SUCCEEDED quickly.
      payload = {
        id: url.split("/").pop(),
        kind: "GEN_SCREEN_SPEC",
        status: "SUCCEEDED",
        progress: 100,
        logs: [],
        output: null,
      };
    } else if (url.startsWith("/api/tracks/") && method === "GET") {
      payload = { artifacts: buildArtifacts() };
    } else {
      payload = { jobId: "job-stub" };
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchStub);
}

function uninstallFetchStub() {
  vi.unstubAllGlobals();
}

// --- DOM scaffolding ------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  installFetchStub();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  uninstallFetchStub();
});

function pointer(type: string, init: PointerEventInit = {}): PointerEvent {
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent;
  if (Ctor) return new Ctor(type, { bubbles: true, button: 0, pointerId: 1, ...init });
  return new MouseEvent(type, { bubbles: true, button: 0, ...init }) as unknown as PointerEvent;
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

function stubBoundingRects(map: WeakMap<Element, DOMRect>) {
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

function mount() {
  act(() => {
    root.render(<SoftwareWorkspace trackId="track-1" initialArtifacts={buildArtifacts()} />);
  });
  gotoStep(1);
}

/** Click into the named step in the stepper (0=spec, 1=build, 2=publish). */
function gotoStep(index: number) {
  const stepBtn = container
    .querySelectorAll<HTMLButtonElement>("ol button")
    .item(index);
  if (!stepBtn) return;
  act(() => {
    stepBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function blocks(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-block-index]"));
}

function dragContainer(): HTMLElement {
  return container.querySelector<HTMLElement>("[data-drag-container]")!;
}

async function flush() {
  // Allow queued microtasks (fetch resolutions) to settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// --- Tests ----------------------------------------------------------------

describe("SoftwareWorkspace — selection clicks", () => {
  it("renders one wrapper per block on the active screen", () => {
    mount();
    expect(blocks()).toHaveLength(4); // Home has 4 blocks
  });

  it("clicking a block selects it (aria-selected=true)", () => {
    mount();
    const [hero] = blocks();
    act(() => {
      hero.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(hero.getAttribute("aria-selected")).toBe("true");
    // others remain unselected
    expect(blocks()[1].getAttribute("aria-selected")).toBe("false");
  });

  it("clicking a CTA button inside a Hero does NOT toggle selection (and navigates)", () => {
    mount();
    const [hero] = blocks();
    const cta = Array.from(hero.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent?.trim() === "Get started"
    )!;
    expect(cta).toBeTruthy();
    act(() => {
      cta.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // After clicking the CTA, the hero should NOT be selected and the
    // active screen should have switched to Upload (1 block).
    expect(hero.getAttribute("aria-selected")).toBe("false");
    expect(blocks()).toHaveLength(1);
  });

  it("clicking inside a Form Input does NOT toggle the surrounding block", () => {
    mount();
    const formBlock = blocks()[2]; // Form at index 2
    const input = formBlock.querySelector("input")!;
    act(() => {
      input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(formBlock.getAttribute("aria-selected")).toBe("false");
  });

  it("clicking the drag handle does NOT toggle selection", () => {
    mount();
    const [hero] = blocks();
    const handle = hero.querySelector("[data-drag-handle]") as HTMLElement;
    expect(handle).toBeTruthy();
    act(() => {
      handle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(hero.getAttribute("aria-selected")).toBe("false");
  });

  it("shift-click adds blocks to the selection", () => {
    mount();
    const [b0, b1] = blocks();
    act(() => {
      b0.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      b1.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    });
    expect(b0.getAttribute("aria-selected")).toBe("true");
    expect(b1.getAttribute("aria-selected")).toBe("true");
  });
});

describe("SoftwareWorkspace — marquee", () => {
  it("dragging a rectangle selects intersecting blocks", () => {
    mount();
    const marqueeRoot = container.querySelector<HTMLElement>(".select-none")!;
    const blockEls = blocks();
    const rects = new WeakMap<Element, DOMRect>();
    rects.set(marqueeRoot, rect(0, 0, 400, 600));
    rects.set(blockEls[0], rect(0, 0, 400, 80));
    rects.set(blockEls[1], rect(0, 100, 400, 80));
    rects.set(blockEls[2], rect(0, 200, 400, 80));
    rects.set(blockEls[3], rect(0, 300, 400, 80));
    const restore = stubBoundingRects(rects);

    act(() => {
      marqueeRoot.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 50 }));
      marqueeRoot.dispatchEvent(pointer("pointermove", { clientX: 200, clientY: 250 }));
      marqueeRoot.dispatchEvent(pointer("pointerup", { clientX: 200, clientY: 250 }));
    });

    const fresh = blocks();
    expect(fresh[0].getAttribute("aria-selected")).toBe("true");
    expect(fresh[1].getAttribute("aria-selected")).toBe("true");
    expect(fresh[2].getAttribute("aria-selected")).toBe("true");
    expect(fresh[3].getAttribute("aria-selected")).toBe("false");

    restore();
  });

  it("pointerdown on an input does NOT start a marquee that hijacks focus", () => {
    mount();
    const formBlock = blocks()[2];
    const input = formBlock.querySelector("input")!;
    const marqueeRoot = container.querySelector<HTMLElement>(".select-none")!;

    act(() => {
      input.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 220 }));
      input.dispatchEvent(pointer("pointermove", { clientX: 60, clientY: 230 }));
      input.dispatchEvent(pointer("pointerup", { clientX: 60, clientY: 230 }));
    });

    // No selection should have been made and no marquee overlay should be
    // showing.
    const indicator = marqueeRoot.querySelector(".bg-primary\\/10");
    expect(indicator).toBeNull();
    expect(blocks().every((b) => b.getAttribute("aria-selected") === "false")).toBe(true);
  });
});

describe("SoftwareWorkspace — AI edit POST", () => {
  it("POSTs to /screens with editInstruction when nothing is selected", async () => {
    mount();
    const editInput = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Edit Home"]'
    )!;
    expect(editInput).toBeTruthy();
    act(() => {
      // happy-dom respects 'input' events on inputs.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(editInput, "make it bolder");
      editInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const aiBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "AI edit"
    )!;
    expect(aiBtn).toBeTruthy();
    act(() => {
      aiBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const post = captured.find(
      (c) => c.url === "/api/tracks/track-1/software/screens" && c.method === "POST"
    );
    expect(post).toBeTruthy();
    expect(post!.body).toMatchObject({
      productSpecArtifactId: "spec-art",
      bundleArtifactId: "bundle-art",
      onlyScreen: "Home",
      editInstruction: "make it bolder",
    });
    expect((post!.body as { selectedBlockIndices?: number[] }).selectedBlockIndices).toBeUndefined();
  });

  it("POSTs with selectedBlockIndices when blocks are selected", async () => {
    mount();
    const [b0, , b2] = blocks();
    act(() => {
      b0.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      b2.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    });
    const editInput = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Edit"]'
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(editInput, "tighten copy");
      editInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const aiBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.trim() === "AI edit"
    )!;
    act(() => {
      aiBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const post = captured.find(
      (c) => c.url === "/api/tracks/track-1/software/screens" && c.method === "POST"
    );
    expect(post).toBeTruthy();
    expect((post!.body as { selectedBlockIndices: number[] }).selectedBlockIndices).toEqual([0, 2]);
    expect((post!.body as { editInstruction: string }).editInstruction).toBe("tighten copy");
  });
});

describe("SoftwareWorkspace — drag-to-reorder", () => {
  it("dragging block 0 down to slot 3 POSTs /screens/order with the right permutation", async () => {
    mount();
    const blockEls = blocks();
    const dragC = dragContainer();
    const rects = new WeakMap<Element, DOMRect>();
    rects.set(dragC, rect(0, 0, 400, 600));
    rects.set(blockEls[0], rect(0, 0, 400, 80));
    rects.set(blockEls[1], rect(0, 100, 400, 80));
    rects.set(blockEls[2], rect(0, 200, 400, 80));
    rects.set(blockEls[3], rect(0, 300, 400, 80));
    const restore = stubBoundingRects(rects);

    const handle = blockEls[0].querySelector<HTMLElement>("[data-drag-handle]")!;
    act(() => {
      handle.dispatchEvent(pointer("pointerdown", { clientX: 380, clientY: 40 }));
    });
    // Cursor passes midpoint of block 2 (mid=240) but is above mid of block 3
    // (mid=340), so slot index should be 3.
    act(() => {
      window.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 260 }));
    });
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientX: 380, clientY: 260 }));
    });
    await flush();

    const post = captured.find(
      (c) => c.url === "/api/tracks/track-1/software/screens/order" && c.method === "POST"
    );
    expect(post).toBeTruthy();
    expect(post!.body).toMatchObject({
      bundleArtifactId: "bundle-art",
      screenName: "Home",
      order: [1, 2, 0, 3],
    });

    restore();
  });

  it("dropping in your own slot does NOT issue a reorder POST", async () => {
    mount();
    const blockEls = blocks();
    const dragC = dragContainer();
    const rects = new WeakMap<Element, DOMRect>();
    rects.set(dragC, rect(0, 0, 400, 600));
    rects.set(blockEls[0], rect(0, 0, 400, 80));
    rects.set(blockEls[1], rect(0, 100, 400, 80));
    rects.set(blockEls[2], rect(0, 200, 400, 80));
    rects.set(blockEls[3], rect(0, 300, 400, 80));
    const restore = stubBoundingRects(rects);

    const handle = blockEls[1].querySelector<HTMLElement>("[data-drag-handle]")!;
    act(() => {
      handle.dispatchEvent(pointer("pointerdown", { clientX: 380, clientY: 140 }));
    });
    act(() => {
      // Stay over block 1; cursor at y=120 is below mid of block 0 (40) and
      // above mid of block 1 (140), so slot is 1 — the same row → no-op.
      window.dispatchEvent(pointer("pointermove", { clientX: 380, clientY: 120 }));
    });
    act(() => {
      window.dispatchEvent(pointer("pointerup", { clientX: 380, clientY: 120 }));
    });
    await flush();

    expect(
      captured.some((c) => c.url === "/api/tracks/track-1/software/screens/order")
    ).toBe(false);

    restore();
  });
});
