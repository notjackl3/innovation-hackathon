import { describe, it, expect } from "vitest";
import {
  propagateSpecChanges,
  SpecChangeError,
} from "./propagate-spec-changes";
import type { DemoBundle, ProductSpec } from "@/lib/schemas/screen";

function makeSpec(screens: string[] = ["Home", "Upload", "Review", "Settings"]): ProductSpec {
  return {
    name: "ReceiptParser",
    tagline: "Receipts → JSON",
    problem: "P",
    users: ["acct"],
    features: ["upload"],
    screens,
  };
}

function makeBundle(): DemoBundle {
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
          { type: "Hero", headline: "Hi", ctaLabel: "Go", ctaTo: "Upload" },
          {
            type: "List",
            items: [
              { title: "Review", to: "Review" },
              { title: "Settings", to: "Settings" },
            ],
          },
        ],
      },
      {
        name: "Upload",
        title: "Upload",
        navLabel: "Upload",
        blocks: [
          {
            type: "Form",
            fields: [{ label: "File", kind: "text" }],
            submitLabel: "Save",
            submitTo: "Review",
          },
        ],
      },
      {
        name: "Review",
        title: "Review",
        navLabel: "Review",
        blocks: [{ type: "Card", title: "Done", body: "x", ctaTo: "Home" }],
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

describe("propagateSpecChanges — spec-only", () => {
  it("returns the new screens list verbatim and preserves other spec fields", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: null,
      newScreens: ["Home", "Upload", "Review", "Errors"],
      renames: [{ from: "Settings", to: "Errors" }],
    });
    expect(out.spec.screens).toEqual(["Home", "Upload", "Review", "Errors"]);
    expect(out.spec.name).toBe("ReceiptParser");
    expect(out.spec.features).toEqual(["upload"]);
    expect(out.bundle).toBeNull();
  });

  it("computes added and removed sets after applying renames", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: null,
      newScreens: ["Home", "Scan", "Review", "New"],
      renames: [{ from: "Upload", to: "Scan" }],
    });
    // Settings was dropped, New was added. Scan is a rename (not added).
    expect(out.added).toEqual(["New"]);
    expect(out.removed).toEqual(["Settings"]);
  });

  it("throws on empty screens list", () => {
    expect(() =>
      propagateSpecChanges({ spec: makeSpec(), bundle: null, newScreens: [] })
    ).toThrowError(SpecChangeError);
  });

  it("throws on duplicate names in newScreens", () => {
    expect(() =>
      propagateSpecChanges({
        spec: makeSpec(),
        bundle: null,
        newScreens: ["Home", "Home"],
      })
    ).toThrowError(/duplicate/i);
  });

  it("throws on whitespace-only name", () => {
    expect(() =>
      propagateSpecChanges({
        spec: makeSpec(),
        bundle: null,
        newScreens: ["Home", "   "],
      })
    ).toThrowError(/empty/i);
  });

  it("throws when a rename source isn't in the current spec", () => {
    expect(() =>
      propagateSpecChanges({
        spec: makeSpec(),
        bundle: null,
        newScreens: ["Home", "Upload", "Review", "Settings"],
        renames: [{ from: "Nope", to: "Maybe" }],
      })
    ).toThrowError(/RENAME_SOURCE_MISSING|not in spec/);
  });

  it("throws when a rename target isn't in newScreens", () => {
    expect(() =>
      propagateSpecChanges({
        spec: makeSpec(),
        bundle: null,
        newScreens: ["Home", "Upload", "Review", "Settings"],
        renames: [{ from: "Settings", to: "Errors" }],
      })
    ).toThrowError(/RENAME_TARGET_MISSING|not in the new/);
  });

  it("ignores no-op renames (from===to)", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: null,
      newScreens: ["Home", "Upload", "Review", "Settings"],
      renames: [{ from: "Home", to: "Home" }],
    });
    expect(out.renames).toEqual([]);
  });
});

describe("propagateSpecChanges — bundle cascade: rename", () => {
  it("renames the screen in the bundle", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Home", "Scan", "Review", "Settings"],
      renames: [{ from: "Upload", to: "Scan" }],
    });
    const names = out.bundle!.screens.map((s) => s.name);
    expect(names).toContain("Scan");
    expect(names).not.toContain("Upload");
  });

  it("rewrites ctaTo / submitTo / List item.to that pointed to the renamed screen", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Home", "Scan", "Review", "Settings"],
      renames: [{ from: "Upload", to: "Scan" }],
    });
    const home = out.bundle!.screens.find((s) => s.name === "Home")!;
    const hero = home.blocks[0];
    if (hero.type !== "Hero") throw new Error("expected Hero");
    expect(hero.ctaTo).toBe("Scan");
  });

  it("propagates a rename of the startScreen", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Landing", "Upload", "Review", "Settings"],
      renames: [{ from: "Home", to: "Landing" }],
    });
    expect(out.bundle!.startScreen).toBe("Landing");
  });
});

describe("propagateSpecChanges — bundle cascade: delete", () => {
  it("removes the deleted screen from the bundle", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Home", "Upload", "Review"],
    });
    expect(out.bundle!.screens.map((s) => s.name)).not.toContain("Settings");
  });

  it("nulls out List item.to refs that pointed to the deleted screen", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Home", "Upload", "Review"],
    });
    const home = out.bundle!.screens.find((s) => s.name === "Home")!;
    const list = home.blocks[1];
    if (list.type !== "List") throw new Error("expected List");
    const settingsItem = list.items.find((it) => it.title === "Settings")!;
    expect(settingsItem.to).toBeUndefined();
    // The other item (Review) should be preserved.
    expect(list.items.find((it) => it.title === "Review")?.to).toBe("Review");
  });

  it("nulls out Hero ctaTo and Form submitTo when their target is deleted", () => {
    const bundle = makeBundle();
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle,
      newScreens: ["Home", "Upload", "Settings"],
    });
    // Review was deleted — Home Hero.ctaTo=Upload should survive, but Upload's
    // Form.submitTo=Review must now be undefined, and Review screen is gone.
    const upload = out.bundle!.screens.find((s) => s.name === "Upload")!;
    const form = upload.blocks[0];
    if (form.type !== "Form") throw new Error("expected Form");
    expect(form.submitTo).toBeUndefined();
  });

  it("falls back the startScreen when it was deleted", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Upload", "Review", "Settings"],
    });
    // Home was deleted; startScreen should fall back to the first remaining bundle screen.
    expect(out.bundle!.startScreen).toBe("Upload");
  });

  it("handles rename+delete in the same patch", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      // Upload→Scan, Settings deleted, Home and Review unchanged.
      newScreens: ["Home", "Scan", "Review"],
      renames: [{ from: "Upload", to: "Scan" }],
    });
    const names = out.bundle!.screens.map((s) => s.name);
    expect(names).toEqual(["Home", "Scan", "Review"]);
    const home = out.bundle!.screens.find((s) => s.name === "Home")!;
    const hero = home.blocks[0];
    if (hero.type !== "Hero") throw new Error("expected Hero");
    expect(hero.ctaTo).toBe("Scan");
    const list = home.blocks[1];
    if (list.type !== "List") throw new Error("expected List");
    expect(list.items.find((i) => i.title === "Settings")?.to).toBeUndefined();
  });
});

describe("propagateSpecChanges — additions and reorders", () => {
  it("adding a name doesn't add a bundle screen (waiting on Generate screens)", () => {
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Home", "Upload", "Review", "Settings", "Help"],
    });
    expect(out.bundle!.screens.map((s) => s.name)).not.toContain("Help");
    expect(out.added).toEqual(["Help"]);
  });

  it("reordering names does not modify the bundle's order field", () => {
    // Order in spec is independent from order in bundle. Both lists can have
    // their own order.
    const out = propagateSpecChanges({
      spec: makeSpec(),
      bundle: makeBundle(),
      newScreens: ["Settings", "Home", "Upload", "Review"],
    });
    expect(out.spec.screens).toEqual(["Settings", "Home", "Upload", "Review"]);
    // Bundle screen names should still be the same set; only ref updates
    // would change anything, and none are needed here.
    expect(new Set(out.bundle!.screens.map((s) => s.name))).toEqual(
      new Set(["Home", "Upload", "Review", "Settings"])
    );
  });

  it("does not mutate the input spec or bundle", () => {
    const spec = makeSpec();
    const bundle = makeBundle();
    const frozenSpec = JSON.stringify(spec);
    const frozenBundle = JSON.stringify(bundle);
    propagateSpecChanges({
      spec,
      bundle,
      newScreens: ["Home", "Scan", "Review"],
      renames: [{ from: "Upload", to: "Scan" }],
    });
    expect(JSON.stringify(spec)).toBe(frozenSpec);
    expect(JSON.stringify(bundle)).toBe(frozenBundle);
  });
});
