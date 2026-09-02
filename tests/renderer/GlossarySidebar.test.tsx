// @vitest-environment happy-dom
/// <reference path="../../src/renderer/pergamum.d.ts" />
// The reference above keeps the `window.pergamum` ambient type in the
// tsconfig.tests.json program (it has no `src` include); without it every
// `.tsx`-reachable renderer file that touches `window.pergamum` fails to
// type-check. Previously carried by the now-removed
// glossaryNavigatorSearch.test.tsx.
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossarySidebar } from "../../src/renderer/GlossarySidebar";

const translate: Translate = (key, values) =>
  values ? `${key}:${JSON.stringify(values)}` : key;
const ts = "2026-09-02T00:00:00.000Z";

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

function entry(
  id: string,
  values: string[],
  tags: GlossaryTag[] = []
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: values.map((value, index) => ({
      id: `${id}-atom-${index}`,
      entryId: id,
      sortOrder: index,
      value,
      matchFlags: 0,
      createdAt: ts,
      updatedAt: ts
    })),
    tags,
    createdAt: ts,
    updatedAt: ts
  };
}

const tagWarrior = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "武将");
const tagPlace = tag("018f4b8c-7a2b-7c3d-8e4f-300000000002", "地名");
const nobunaga = entry(
  "018f4b8c-7a2b-7c3d-8e4f-100000000001",
  ["織田信長", "第六天魔王", "吉法師"],
  [tagWarrior]
);
const sakuradamon = entry(
  "018f4b8c-7a2b-7c3d-8e4f-100000000002",
  ["桜田門"],
  [tagPlace]
);
// #375: a deliberately tag-less entry.
const ronin = entry("018f4b8c-7a2b-7c3d-8e4f-100000000003", ["浪人"], []);

let container: HTMLDivElement;
let root: Root;
let listMock: ReturnType<typeof vi.fn>;
let listTagsMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  listMock = vi.fn().mockResolvedValue([nobunaga, sakuradamon, ronin]);
  listTagsMock = vi.fn().mockResolvedValue([tagWarrior, tagPlace]);
  Object.defineProperty(window, "pergamum", {
    configurable: true,
    value: { glossary: { list: listMock, listTags: listTagsMock } }
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    projectRootPath: "C:\\Novel",
    highlightedEntryId: null,
    refreshToken: 0,
    translate,
    activeDocumentContent: null,
    onActivateEntry: vi.fn(),
    onCreateEntry: vi.fn().mockResolvedValue(true),
    onNavigateOccurrence: vi.fn(),
    ...overrides
  };
}

async function render(overrides: Record<string, unknown> = {}) {
  const props = baseProps(overrides);
  await act(async () => {
    root.render(React.createElement(GlossarySidebar, props));
    await Promise.resolve();
    await Promise.resolve();
  });
  return props;
}

function rows(): HTMLLIElement[] {
  return Array.from(
    container.querySelectorAll<HTMLLIElement>(".glossarySidebarEntryRow")
  );
}
function button(text: string): HTMLButtonElement {
  const b = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button")
  ).find((btn) => btn.textContent === text);
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

describe("GlossarySidebar (#375)", () => {
  it("renders one row per entry, labelled by the representative atom value", async () => {
    await render();
    expect(rows()).toHaveLength(3);
    expect(rows()[0].textContent).toContain("織田信長");
    expect(rows()[0].textContent).not.toContain("第六天魔王"); // collapsed
  });

  it("expands a row: tags + hit total + edit button, and NO non-representative atom chips", async () => {
    const props = await render({
      activeDocumentContent: "織田信長は第六天魔王と呼ばれた。第六天魔王。"
    });

    act(() => button("＞").click());
    const row = rows()[0];
    // #375: the non-representative atom chips were removed from the sidebar.
    expect(row.querySelector(".glossarySidebarAtomChip")).toBeNull();
    expect(row.textContent).not.toContain("吉法師");
    // Tag chips still render.
    expect(row.querySelector(".glossaryTagChip")).not.toBeNull();
    // hit total = all atoms of the entry (織田信長 x1 + 第六天魔王 x2 = 3)
    expect(row.textContent).toContain('glossary.hitCount:{"count":3}');

    row
      .querySelector<HTMLButtonElement>(".glossarySidebarEditButton")!
      .click();
    expect(props.onActivateEntry).toHaveBeenCalledWith(nobunaga.id);
  });

  it("shows the [no tags] marker on a tag-less entry when expanded", async () => {
    await render();
    // ronin is the 3rd row and carries no tags.
    const row = rows()[2];
    act(() =>
      row
        .querySelector<HTMLButtonElement>(".glossarySidebarExpandButton")!
        .click()
    );

    expect(row.querySelector(".glossarySidebarNoTagsChip")).not.toBeNull();
    expect(row.textContent).toContain("glossary.noTags");
    // It is not a real tag chip.
    expect(row.querySelector(".glossaryTagChip")).toBeNull();
  });

  it("routes the ◀ / ▶ buttons to onNavigateOccurrence with the entry, when the active Markdown doc has hits", async () => {
    const props = await render({ activeDocumentContent: "織田信長の話。" });
    const row = rows()[0];
    const [prev, next] = Array.from(
      row.querySelectorAll<HTMLButtonElement>(
        ".glossarySidebarOccurrenceButton"
      )
    );
    expect(prev.disabled).toBe(false);

    prev.click();
    next.click();

    expect(props.onNavigateOccurrence).toHaveBeenNthCalledWith(
      1,
      nobunaga,
      "previous"
    );
    expect(props.onNavigateOccurrence).toHaveBeenNthCalledWith(
      2,
      nobunaga,
      "next"
    );
  });

  it("disables the ◀ / ▶ buttons when there is no active Markdown document", async () => {
    await render({ activeDocumentContent: null });
    for (const btn of Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".glossarySidebarOccurrenceButton"
      )
    )) {
      expect(btn.disabled).toBe(true);
    }
  });

  it("disables the ◀ / ▶ buttons for an entry with 0 hits in the active document", async () => {
    await render({ activeDocumentContent: "まったく無関係な本文。" });
    const nobunagaRow = rows()[0];
    for (const btn of Array.from(
      nobunagaRow.querySelectorAll<HTMLButtonElement>(
        ".glossarySidebarOccurrenceButton"
      )
    )) {
      expect(btn.disabled).toBe(true);
    }
  });

  it("keeps the tag filter operable with no visible label, only an aria-label", async () => {
    await render();
    const select = container.querySelector<HTMLSelectElement>(
      ".glossarySidebarTagFilter select"
    )!;

    expect(select.getAttribute("aria-label")).toBe("glossary.tagFilter");
    // No visible label element — the filter wrapper holds only the <select>.
    const filterWrapper = container.querySelector(
      ".glossarySidebarTagFilter"
    )!;
    expect(filterWrapper.querySelector("span")).toBeNull();
    expect(
      Array.from(filterWrapper.children).map((el) => el.tagName)
    ).toEqual(["SELECT"]);
    // The search input keeps its own accessible name + placeholder.
    const search = container.querySelector<HTMLInputElement>(
      ".glossarySidebarSearch"
    )!;
    expect(search.getAttribute("aria-label")).toBe("glossaryNavigator.search");
    expect(search.getAttribute("placeholder")).toBe(
      "glossaryNavigator.searchPlaceholder"
    );
  });

  it("filters entries by tag: all / a tag / the `no tags` pseudo-option", async () => {
    await render();
    const select = container.querySelector<HTMLSelectElement>(
      ".glossarySidebarTagFilter select"
    )!;
    const choose = (value: string) =>
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value"
        )!.set!;
        setter.call(select, value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

    expect(rows()).toHaveLength(3);

    choose(tagPlace.id);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("桜田門");

    choose("__none__");
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("浪人");

    choose("");
    expect(rows()).toHaveLength(3);
  });

  it("creates an entry from the bottom form with the representative atom value and selected tags", async () => {
    const props = await render();

    act(() => button("glossary.addEntry").click());
    const valueInput = container.querySelector<HTMLInputElement>(
      ".glossaryCreateForm input[type='text']"
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(valueInput, "徳川家康");
      valueInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() =>
      container
        .querySelectorAll<HTMLButtonElement>(".glossaryCreateFormTagToggle")[0]
        .click()
    );
    await act(async () => {
      container
        .querySelector("form.glossaryCreateForm")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true })
        );
      await Promise.resolve();
    });

    expect(props.onCreateEntry).toHaveBeenCalledWith({
      description: "",
      atoms: [{ value: "徳川家康", matchFlags: 0 }],
      tagIds: [tagWarrior.id]
    });
  });

  it("no longer hosts any tag CRUD UI (moved to the Glossary Tag Manager tab)", async () => {
    await render();
    expect(container.querySelector(".glossaryTagManager")).toBeNull();
    expect(container.textContent).not.toContain("glossary.manageTags");
  });

  it("shows the no-project placeholder without a project", async () => {
    await render({ projectRootPath: null });
    expect(container.textContent).toContain("glossary.noProject");
    expect(listMock).not.toHaveBeenCalled();
  });
});
