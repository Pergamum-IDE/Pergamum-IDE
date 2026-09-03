// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryTagManager } from "../../src/renderer/GlossaryTagManager";

const translate: Translate = (key) => key;

function tag(id: string, label: string, description: string | null): GlossaryTag {
  return {
    id,
    label,
    description,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-03T01:02:03.000Z",
    updatedAt: "2026-09-04T05:06:07.000Z"
  };
}

const tagA = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "武将", "戦国武将");
const tagB = tag("018f4b8c-7a2b-7c3d-8e4f-300000000002", "地名", null);
const tagC = tag("018f4b8c-7a2b-7c3d-8e4f-300000000003", "組織", "勢力");

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
  props: Partial<React.ComponentProps<typeof GlossaryTagManager>> = {}
) {
  const handlers = {
    onCreateTag: vi.fn().mockResolvedValue(undefined),
    onUpdateTag: vi.fn().mockResolvedValue(undefined),
    onDeleteTag: vi.fn().mockResolvedValue(undefined),
    onReorderTags: vi.fn().mockResolvedValue(undefined)
  };
  act(() => {
    root.render(
      React.createElement(GlossaryTagManager, {
        tags: [tagA, tagB],
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

function rows(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      ".glossaryTagManagerTableRow:not(.glossaryTagManagerTableHead)"
    )
  );
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("GlossaryTagManager (#375) — table", () => {
  it("has no page heading; the Add tag button is the primary action, top-left", () => {
    render();
    expect(container.querySelector("h2")).toBeNull();

    const section = query(".glossaryTagManager");
    // The action bar is the first thing in the tab body (above the table).
    expect(section.firstElementChild?.classList.contains(
      "glossaryTagManagerActions"
    )).toBe(true);
    expect(query(".glossaryTagManagerAddButton").textContent).toBe(
      "glossary.tagManager.addTag"
    );
  });

  it("renders a table with a header per column and one row per tag", () => {
    render();
    const table = query('[role="table"]');
    const headers = Array.from(
      table.querySelectorAll('[role="columnheader"]')
    ).map((h) => h.textContent);

    expect(headers).toEqual([
      "glossary.tagManager.columns.reorder",
      "glossary.tagManager.columns.tag",
      "glossary.tagManager.columns.description",
      "glossary.tagManager.columns.entries",
      "glossary.tagManager.columns.createdAt",
      "glossary.tagManager.columns.updatedAt",
      "glossary.tagManager.columns.edit",
      "glossary.tagManager.columns.delete"
    ]);
    expect(rows()).toHaveLength(2);
  });

  it("shows the entry count per tag (entries, not occurrences), 0 when none", () => {
    render({
      tags: [tagA, tagB],
      entryCountByTagId: { [tagA.id]: 3 }
    });

    const first = rows()[0].querySelector(".glossaryTagManagerEntriesCell");
    const second = rows()[1].querySelector(".glossaryTagManagerEntriesCell");
    expect(first?.textContent).toBe("3");
    expect(second?.textContent).toBe("0");
  });

  it("column headers are not buttons and do not sort on click", () => {
    render();
    const headerRow = query(".glossaryTagManagerTableHead");
    expect(headerRow.querySelector("button")).toBeNull();
  });

  it("shows a ⣿ reorder handle (a draggable button) with an accessible label in every row", () => {
    render();
    const handles = container.querySelectorAll<HTMLButtonElement>(
      ".glossaryTagManagerDragHandle"
    );
    expect(handles).toHaveLength(2);
    expect(handles[0].tagName).toBe("BUTTON");
    expect(handles[0].getAttribute("draggable")).toBe("true");
    expect(handles[0].getAttribute("aria-label")).toBe(
      "glossary.tagManager.reorderHint"
    );
    expect(handles[0].getAttribute("title")).toBe(
      "glossary.tagManager.reorderHint"
    );
    expect(handles[0].textContent).toBe("⣿");
  });

  it("makes the handle non-draggable when there is only one tag (nothing to reorder)", () => {
    render({ tags: [tagA] });
    const handle = query<HTMLButtonElement>(".glossaryTagManagerDragHandle");
    expect(handle.disabled).toBe(true);
    expect(handle.getAttribute("draggable")).toBe("false");
  });

  it("renders the tag chip, the description, and a muted placeholder when absent", () => {
    render();
    expect(rows()[0].querySelector(".glossaryTagChip")).not.toBeNull();
    expect(rows()[0].textContent).toContain("戦国武将");
    // tagB has no description → muted "no description".
    expect(
      rows()[1].querySelector(".glossaryTagManagerMuted")?.textContent
    ).toBe("glossary.tagManager.noDescription");
  });

  it("renders created / updated dates as YYYY-MM-DD", () => {
    render();
    const cells = rows()[0].querySelectorAll(
      ".glossaryTagManagerTimestampCell"
    );
    expect(cells[0].textContent).toBe("2026-09-03");
    expect(cells[1].textContent).toBe("2026-09-04");
  });

  it("edit / delete are icon buttons (not text), delete carrying a destructive class", () => {
    render();
    const edit = query<HTMLButtonElement>(".glossaryTagManagerEditButton");
    const del = query<HTMLButtonElement>(".glossaryTagManagerDeleteButton");

    expect(edit.getAttribute("aria-label")).toBe("glossary.tagManager.editTag");
    expect(del.getAttribute("aria-label")).toBe(
      "glossary.tagManager.deleteTag"
    );
    // No visible "Edit" / "Delete" text label.
    expect(edit.textContent).toBe("");
    expect(del.textContent).toBe("");
    expect(del.querySelector("svg")).not.toBeNull();
  });

  it("has no bulk-operation UI", () => {
    render();
    expect(
      container.querySelector('input[type="checkbox"]')
    ).toBeNull();
  });

  it("shows the empty notice when there are no tags", () => {
    render({ tags: [] });
    expect(container.textContent).toContain("glossary.tagManager.empty");
    expect(container.querySelector('[role="table"]')).toBeNull();
  });

  it("asks the host to delete a tag, passing id + label (the host confirms)", () => {
    const handlers = render();
    act(() =>
      query<HTMLButtonElement>(".glossaryTagManagerDeleteButton").click()
    );
    expect(handlers.onDeleteTag).toHaveBeenCalledWith(tagA.id, tagA.label);
  });

  it("column headers carry no reorder / sort controls", () => {
    render();
    const headerRow = query(".glossaryTagManagerTableHead");
    expect(headerRow.querySelector("button")).toBeNull();
    expect(headerRow.querySelector(".glossaryTagManagerDragHandle")).toBeNull();
  });
});

describe("GlossaryTagManager (#375) — tag reorder", () => {
  function handles(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".glossaryTagManagerDragHandle"
      )
    );
  }

  function dataRows(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        ".glossaryTagManagerTableRow:not(.glossaryTagManagerTableHead)"
      )
    );
  }

  it("keyboard: Arrow Down on the first handle asks to move that tag after the next", () => {
    const { onReorderTags } = render({ tags: [tagA, tagB, tagC] });

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true
        })
      );
    });

    expect(onReorderTags).toHaveBeenCalledWith([tagB.id, tagA.id, tagC.id]);
  });

  it("keyboard: Arrow Up on the first handle is a no-op", () => {
    const { onReorderTags } = render({ tags: [tagA, tagB, tagC] });

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
    });

    expect(onReorderTags).not.toHaveBeenCalled();
  });

  it("drag-and-drop: dropping tagA's handle onto the lower half of tagB moves tagA after tagB", () => {
    const { onReorderTags } = render({ tags: [tagA, tagB, tagC] });

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

    // Row rects are 0-height in happy-dom, so any clientY > 0 lands in the
    // lower half → the gap after that row. Dropping onto tagB (index 1) is
    // gap 2; dragging tagA from index 0 into gap 2 resolves to final index 1.
    fire(handles()[0], "dragstart", 0);
    fire(dataRows()[1], "dragover", 5);
    fire(dataRows()[1], "drop", 5);

    expect(onReorderTags).toHaveBeenCalledWith([tagB.id, tagA.id, tagC.id]);
  });

  it("does not call the host when a drop lands back on the same position", () => {
    const { onReorderTags } = render({ tags: [tagA, tagB, tagC] });

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

    // Drop tagA onto the upper half of its own row → gap 0 → final index 0.
    fire(handles()[0], "dragstart", 0);
    fire(dataRows()[0], "drop", 0);

    expect(onReorderTags).not.toHaveBeenCalled();
  });
});

describe("GlossaryTagManager (#375) — editor modal", () => {
  function modal(): HTMLElement | null {
    return container.querySelector(".appDialogBackdrop");
  }

  it("opens no modal by default; Add tag opens the create modal", () => {
    render();
    expect(modal()).toBeNull();

    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());

    expect(modal()).not.toBeNull();
    expect(container.querySelector(".glossaryTagEditor")).not.toBeNull();
    expect(container.textContent).toContain("glossaryTagEditor.titleNew");
  });

  it("#375 blocker: mounting / re-mounting the tab never opens the create modal", () => {
    render();
    expect(modal()).toBeNull();

    // A re-render (tab re-activation) still shows no modal.
    render({ tags: [] });
    expect(modal()).toBeNull();
    render();
    expect(modal()).toBeNull();
  });

  it("#375 blocker: closing the create modal does not let it re-open on re-render", async () => {
    render();
    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());
    expect(modal()).not.toBeNull();

    const cancel = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".appDialogButton")
    ).find((b) => b.textContent === "glossaryTagEditor.cancel")!;
    act(() => cancel.click());
    expect(modal()).toBeNull();

    // Re-render (tab re-activation) — still closed.
    render();
    expect(modal()).toBeNull();
  });

  it("the edit icon opens the edit modal seeded with the tag", () => {
    render();
    act(() =>
      query<HTMLButtonElement>(".glossaryTagManagerEditButton").click()
    );
    expect(container.textContent).toContain("glossaryTagEditor.titleEdit");
    const nameInput = query<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    );
    expect(nameInput.value).toBe("武将");
  });

  it("Cancel closes the modal without calling create/update", () => {
    const handlers = render();
    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());

    const cancel = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".appDialogButton")
    ).find((b) => b.textContent === "glossaryTagEditor.cancel")!;
    act(() => cancel.click());

    expect(modal()).toBeNull();
    expect(handlers.onCreateTag).not.toHaveBeenCalled();
  });

  it("Escape closes the modal without calling create/update", () => {
    const handlers = render();
    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());

    act(() => {
      container
        .querySelector(".appDialog")!
        .dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true
          })
        );
    });

    expect(modal()).toBeNull();
    expect(handlers.onCreateTag).not.toHaveBeenCalled();
  });

  it("Create submits the form → onCreateTag, then closes", async () => {
    const handlers = render();
    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());

    const nameInput = query<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(nameInput, "人物");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      container
        .querySelector(".glossaryTagEditor")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await flush();

    expect(handlers.onCreateTag).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateTag.mock.calls[0][0]).toMatchObject({
      label: "人物"
    });
    expect(container.querySelector(".appDialogBackdrop")).toBeNull();
  });

  it("Save on the edit modal → onUpdateTag with the tag id", async () => {
    const handlers = render();
    act(() =>
      query<HTMLButtonElement>(".glossaryTagManagerEditButton").click()
    );

    const nameInput = query<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(nameInput, "軍人");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      container
        .querySelector(".glossaryTagEditor")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await flush();

    expect(handlers.onUpdateTag).toHaveBeenCalledWith(
      expect.objectContaining({ id: tagA.id, label: "軍人" })
    );
  });

  it("keeps the modal open and surfaces an error when create fails", async () => {
    const handlers = render();
    handlers.onCreateTag.mockRejectedValueOnce(new Error("conflict"));

    act(() => query<HTMLButtonElement>(".glossaryTagManagerAddButton").click());
    const nameInput = query<HTMLInputElement>(
      ".glossaryTagEditor input[type='text']"
    );
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(nameInput, "人物");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      container
        .querySelector(".glossaryTagEditor")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await flush();

    expect(container.querySelector(".appDialogBackdrop")).not.toBeNull();
    expect(container.textContent).toContain("glossaryTagEditor.saveFailed");
  });
});
