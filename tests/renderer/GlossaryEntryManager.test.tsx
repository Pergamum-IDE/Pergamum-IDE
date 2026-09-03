// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GlossaryAtom,
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryEntryManager } from "../../src/renderer/GlossaryEntryManager";

const translate: Translate = (key) => key;

function atom(entryId: string, sortOrder: number, value: string): GlossaryAtom {
  return {
    id: `atom-${entryId}-${sortOrder}`,
    entryId,
    sortOrder,
    value,
    matchFlags: 0,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-03T01:02:03.000Z"
  };
}

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-03T01:02:03.000Z"
  };
}

function entry(
  id: string,
  surfaces: string[],
  tags: GlossaryTag[] = []
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: surfaces.map((value, index) => atom(id, index, value)),
    tags,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-05T05:06:07.000Z"
  };
}

const entryA = entry(
  "018f4b8c-7a2b-7c3d-8e4f-1000000000a1",
  ["織田信長", "第六天魔王"],
  [tag("t1", "武将"), tag("t2", "勢力")]
);
const entryB = entry("018f4b8c-7a2b-7c3d-8e4f-1000000000a2", ["桶狭間"]);
const entryC = entry(
  "018f4b8c-7a2b-7c3d-8e4f-1000000000a3",
  ["徳川家康"],
  [tag("t3", "武将")]
);

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
  vi.restoreAllMocks();
});

function render(
  props: Partial<React.ComponentProps<typeof GlossaryEntryManager>> = {}
) {
  const handlers = {
    onAddEntry: vi.fn(),
    onOpenEntry: vi.fn(),
    onDeleteEntry: vi.fn().mockResolvedValue(undefined),
    onReorderEntries: vi.fn().mockResolvedValue(undefined)
  };
  act(() => {
    root.render(
      React.createElement(GlossaryEntryManager, {
        entries: [entryA, entryB],
        translate,
        ...handlers,
        ...props
      })
    );
  });
  return handlers;
}

function query<T extends Element>(selector: string): T {
  const el = container.querySelector<T>(selector);
  if (!el) {
    throw new Error(`No element for "${selector}"`);
  }
  return el;
}

function dataRows(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".glossaryEntryManagerTableRow:not(.glossaryEntryManagerTableHead)"
    )
  );
}

function handles(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(".glossaryTagManagerDragHandle")
  );
}

describe("GlossaryEntryManager (#375)", () => {
  it("renders a table with every column header and no bulk-select UI", () => {
    render();
    const section = query<HTMLElement>("section.glossaryEntryManager");
    expect(section.getAttribute("aria-label")).toBe(
      "glossary.entryManager.title"
    );

    const headers = Array.from(
      container.querySelectorAll(".glossaryEntryManagerTableHead span")
    ).map((el) => el.textContent);
    expect(headers).toEqual([
      "glossary.entryManager.columns.reorder",
      "glossary.entryManager.columns.entry",
      "glossary.entryManager.columns.tags",
      "glossary.entryManager.columns.tagCount",
      "glossary.entryManager.columns.atomCount",
      "glossary.entryManager.columns.createdAt",
      "glossary.entryManager.columns.updatedAt",
      "glossary.entryManager.columns.edit",
      "glossary.entryManager.columns.delete"
    ]);

    expect(
      container.querySelectorAll('input[type="checkbox"]')
    ).toHaveLength(0);
  });

  it("shows the Add entry button top-left and calls onAddEntry when pressed", () => {
    const { onAddEntry } = render();
    const button = query<HTMLButtonElement>(".glossaryEntryManagerAddButton");
    expect(button.textContent).toBe("glossary.entryManager.addEntry");
    // It is placed above the table, in the actions row.
    expect(
      button.closest(".glossaryEntryManagerActions")
    ).not.toBeNull();

    act(() => button.click());
    expect(onAddEntry).toHaveBeenCalledTimes(1);
  });

  it("shows every assigned tag in assignment order, the first flagged as primary", () => {
    render({ entries: [entryA, entryB, entryC] });
    const [rowA, rowB, rowC] = dataRows();

    expect(
      rowA.querySelector(".glossaryEntryManagerSurfaceCell")?.textContent
    ).toBe("織田信長");

    // Entry A: two chips in assignment order (武将 then 勢力).
    const chipsA = Array.from(
      rowA.querySelectorAll(".glossaryEntryManagerTagsCell .glossaryTagChip")
    ).map((el) => el.textContent);
    expect(chipsA).toEqual(["武将", "勢力"]);

    // The first tag item is marked primary and carries a badge.
    const tagItemsA = rowA.querySelectorAll(
      ".glossaryEntryManagerTagsCell .glossaryEntryManagerTagItem"
    );
    expect(tagItemsA[0].getAttribute("data-primary")).toBe("true");
    expect(tagItemsA[1].hasAttribute("data-primary")).toBe(false);
    expect(
      tagItemsA[0].querySelector(".glossaryEntryManagerPrimaryBadge")
        ?.textContent
    ).toBe("glossary.entryManager.primaryTag");

    // Counts: tag count then atom count.
    const countsA = Array.from(
      rowA.querySelectorAll(".glossaryTagManagerEntriesCell")
    ).map((el) => el.textContent);
    expect(countsA).toEqual(["2", "2"]);

    // Entry B has no tags → muted "No tags", no chip.
    expect(
      rowB.querySelector(".glossaryEntryManagerTagsCell .glossaryTagChip")
    ).toBeNull();
    expect(
      rowB.querySelector(".glossaryEntryManagerTagsCell .glossaryTagManagerMuted")
        ?.textContent
    ).toBe("glossary.entryManager.noTags");
    expect(
      Array.from(
        rowB.querySelectorAll(".glossaryTagManagerEntriesCell")
      ).map((el) => el.textContent)
    ).toEqual(["0", "1"]);

    // Entry C has a single tag → one chip, marked primary.
    expect(
      Array.from(
        rowC.querySelectorAll(
          ".glossaryEntryManagerTagsCell .glossaryTagChip"
        )
      ).map((el) => el.textContent)
    ).toEqual(["武将"]);
  });

  it("opens the entry editor when the row itself is clicked", () => {
    const { onOpenEntry } = render();
    const [rowA] = dataRows();

    act(() => rowA.click());
    expect(onOpenEntry).toHaveBeenCalledWith(entryA.id);
    expect(onOpenEntry).toHaveBeenCalledTimes(1);
  });

  it("opens the entry editor on Enter / Space when the row is focused", () => {
    const { onOpenEntry } = render();
    const [rowA] = dataRows();
    expect(rowA.getAttribute("tabindex")).toBe("0");

    act(() => {
      rowA.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    act(() => {
      rowA.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: " ", bubbles: true })
      );
    });
    expect(onOpenEntry).toHaveBeenCalledTimes(2);
  });

  it("puts a ⣿ drag handle at the head of every row", () => {
    render({ entries: [entryA, entryB, entryC] });
    const rowHandles = handles();
    expect(rowHandles).toHaveLength(3);
    for (const handle of rowHandles) {
      expect(handle.textContent).toBe("⣿");
      expect(handle.getAttribute("aria-label")).toBe(
        "glossary.entryManager.dragHandle"
      );
    }
  });

  it("keyboard: Arrow Down on the first handle asks to move that entry after the next", () => {
    const { onReorderEntries } = render({
      entries: [entryA, entryB, entryC]
    });

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true
        })
      );
    });

    expect(onReorderEntries).toHaveBeenCalledWith([
      entryB.id,
      entryA.id,
      entryC.id
    ]);
  });

  it("drag-and-drop: dropping entryA's handle onto the lower half of entryB moves entryA after entryB", () => {
    const { onReorderEntries } = render({
      entries: [entryA, entryB, entryC]
    });

    const dataTransfer = {
      _data: new Map<string, string>(),
      types: [] as string[],
      dropEffect: "",
      effectAllowed: "",
      setData(type: string, value: string) {
        this._data.set(type, value);
        this.types = [...this._data.keys()];
      },
      getData(type: string) {
        return this._data.get(type) ?? "";
      }
    };

    function fire(target: EventTarget, type: string, clientY: number): void {
      const event = new window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientY", { value: clientY });
      act(() => {
        target.dispatchEvent(event);
      });
    }

    fire(handles()[0], "dragstart", 0);
    fire(dataRows()[1], "dragover", 5);
    fire(dataRows()[1], "drop", 5);

    expect(onReorderEntries).toHaveBeenCalledWith([
      entryB.id,
      entryA.id,
      entryC.id
    ]);
  });

  it("edit icon opens the entry exactly once (no double-fire from the row click)", () => {
    const { onOpenEntry, onDeleteEntry } = render();
    const [rowA] = dataRows();

    act(() => {
      rowA
        .querySelector<HTMLButtonElement>(".glossaryEntryManagerEditButton")!
        .click();
    });
    expect(onOpenEntry).toHaveBeenCalledTimes(1);
    expect(onOpenEntry).toHaveBeenCalledWith(entryA.id);
    expect(onDeleteEntry).not.toHaveBeenCalled();
  });

  it("delete icon asks the host to delete and never opens the editor", () => {
    const { onOpenEntry, onDeleteEntry } = render();
    const [rowA] = dataRows();

    act(() => {
      rowA
        .querySelector<HTMLButtonElement>(".glossaryEntryManagerDeleteButton")!
        .click();
    });
    expect(onDeleteEntry).toHaveBeenCalledWith(entryA.id, "織田信長");
    expect(onOpenEntry).not.toHaveBeenCalled();
  });

  it("clicking the drag handle never opens the editor", () => {
    const { onOpenEntry } = render({ entries: [entryA, entryB, entryC] });

    act(() => handles()[0].click());
    expect(onOpenEntry).not.toHaveBeenCalled();
  });

  it("Arrow-key reorder on the handle does not also open the editor", () => {
    const { onOpenEntry, onReorderEntries } = render({
      entries: [entryA, entryB, entryC]
    });

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true
        })
      );
    });

    expect(onReorderEntries).toHaveBeenCalledTimes(1);
    expect(onOpenEntry).not.toHaveBeenCalled();
  });

  it("renders an empty-state message but still shows the Add entry button", () => {
    render({ entries: [] });
    expect(
      container.querySelector(".glossaryEntryManagerEmpty")?.textContent
    ).toBe("glossary.entryManager.empty");
    expect(container.querySelector(".glossaryEntryManagerTable")).toBeNull();
    expect(
      container.querySelector(".glossaryEntryManagerAddButton")
    ).not.toBeNull();
  });
});
