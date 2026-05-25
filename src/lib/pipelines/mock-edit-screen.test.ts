import { describe, it, expect } from "vitest";
import { mockEditScreen } from "./mock-edit-screen";
import { ScreenSpecSchema, type ScreenSpec } from "@/lib/schemas/screen";

function build(): ScreenSpec {
  return {
    name: "Dashboard",
    title: "Dashboard",
    navLabel: "Home",
    blocks: [
      { type: "Hero", headline: "Welcome", sub: "Hi" },
      {
        type: "Stats",
        items: [
          { label: "Active", value: "1" },
          { label: "Pipeline", value: "2" },
        ],
      },
      {
        type: "List",
        items: [
          { title: "First", to: "Detail" },
          { title: "Second" },
        ],
      },
      { type: "Card", title: "Card title", body: "Card body" },
      {
        type: "Detail",
        title: "Detail title",
        sections: [{ heading: "H", body: "B" }],
      },
      {
        type: "Form",
        fields: [{ label: "Name", kind: "text" }],
        submitLabel: "Go",
      },
      {
        type: "Table",
        columns: ["A", "B"],
        rows: [["1", "2"]],
      },
      {
        type: "Chart",
        kind: "bar",
        series: [{ label: "x", data: [1, 2] }],
        xLabels: ["a", "b"],
      },
    ],
  };
}

describe("mockEditScreen", () => {
  it("always prepends a receipt Card with the instruction", () => {
    const next = mockEditScreen(build(), "make it pop", undefined);
    expect(next.blocks[0]).toMatchObject({
      type: "Card",
      title: "Edit applied",
      body: "make it pop",
    });
  });

  it("tags receipt with selection count when indices are provided", () => {
    const next = mockEditScreen(build(), "do something", [0, 2]);
    expect(next.blocks[0]).toMatchObject({
      type: "Card",
      title: "Edit applied to 2 block(s)",
    });
  });

  it("with no selection, mutates every kind of block that has a text field", () => {
    const src = build();
    const next = mockEditScreen(src, "X", undefined);
    // skip receipt at [0]; original block 0 (Hero) is at next.blocks[1]
    const hero = next.blocks[1];
    if (hero.type !== "Hero") throw new Error("expected Hero");
    expect(hero.headline.startsWith("Welcome (edited:")).toBe(true);
    const stats = next.blocks[2];
    if (stats.type !== "Stats") throw new Error("expected Stats");
    expect(stats.items[0].label.startsWith("Active (edited:")).toBe(true);
    expect(stats.items[1].label).toBe("Pipeline"); // only first item touched
    const list = next.blocks[3];
    if (list.type !== "List") throw new Error("expected List");
    expect(list.items[0].title.startsWith("First (edited:")).toBe(true);
    const card = next.blocks[4];
    if (card.type !== "Card") throw new Error("expected Card");
    expect(card.title.startsWith("Card title (edited:")).toBe(true);
    const detail = next.blocks[5];
    if (detail.type !== "Detail") throw new Error("expected Detail");
    expect(detail.title.startsWith("Detail title (edited:")).toBe(true);
  });

  it("with selection, only modifies the named indices and leaves others verbatim", () => {
    const src = build();
    const next = mockEditScreen(src, "Y", [0, 3]);
    // [0] in src is Hero (index 0), [3] is Card (index 3). Others should be unchanged.
    const hero = next.blocks[1];
    const stats = next.blocks[2];
    const list = next.blocks[3];
    const card = next.blocks[4];
    const detail = next.blocks[5];
    if (hero.type !== "Hero" || stats.type !== "Stats" || list.type !== "List" || card.type !== "Card" || detail.type !== "Detail") {
      throw new Error("unexpected block shape");
    }
    expect(hero.headline).toContain("(edited:");
    expect(stats.items[0].label).toBe("Active"); // untouched
    expect(list.items[0].title).toBe("First"); // untouched
    expect(card.title).toContain("(edited:");
    expect(detail.title).toBe("Detail title"); // untouched
  });

  it("does not mutate the input ScreenSpec", () => {
    const src = build();
    const frozen = JSON.parse(JSON.stringify(src));
    mockEditScreen(src, "Z", [0]);
    expect(src).toEqual(frozen);
  });

  it("produces output that re-parses as a valid ScreenSpec", () => {
    const next = mockEditScreen(build(), "anything", [1]);
    expect(() => ScreenSpecSchema.parse(next)).not.toThrow();
  });

  it("truncates very long instructions in the tag", () => {
    const long = "x".repeat(200);
    const next = mockEditScreen(build(), long, [0]);
    const hero = next.blocks[1];
    if (hero.type !== "Hero") throw new Error("expected Hero");
    // tag uses instruction.slice(0,40)
    expect(hero.headline.length).toBeLessThan(80);
  });

  it("treats empty selection arrays as 'edit all'", () => {
    const next = mockEditScreen(build(), "Q", []);
    const hero = next.blocks[1];
    if (hero.type !== "Hero") throw new Error("expected Hero");
    expect(hero.headline).toContain("(edited:");
    expect(next.blocks[0]).toMatchObject({ title: "Edit applied" });
  });

  it("leaves Form and Table untouched (no editable text we currently mutate)", () => {
    const src = build();
    const next = mockEditScreen(src, "noop", undefined);
    // receipt at [0], then Hero, Stats, List, Card, Detail, Form, Table — Chart trimmed to fit cap.
    const form = next.blocks[6];
    const table = next.blocks[7];
    expect(form).toEqual(src.blocks[5]);
    expect(table).toEqual(src.blocks[6]);
  });

  it("caps total output at 8 blocks (ScreenSpec schema limit)", () => {
    // build() returns 8 blocks; receipt would push to 9, so the last is trimmed.
    const next = mockEditScreen(build(), "x", undefined);
    expect(next.blocks).toHaveLength(8);
    // Original last block (Chart) should be gone.
    expect(next.blocks.some((b) => b.type === "Chart")).toBe(false);
  });

  it("does not cap when there's headroom", () => {
    const small: ScreenSpec = {
      name: "Detail",
      title: "Detail",
      navLabel: "Detail",
      blocks: [{ type: "Hero", headline: "A" }],
    };
    const next = mockEditScreen(small, "x", undefined);
    expect(next.blocks).toHaveLength(2); // receipt + hero
  });

  it("preserves the screen name, title, navLabel", () => {
    const next = mockEditScreen(build(), "R", [0]);
    expect(next.name).toBe("Dashboard");
    expect(next.title).toBe("Dashboard");
    expect(next.navLabel).toBe("Home");
  });
});
