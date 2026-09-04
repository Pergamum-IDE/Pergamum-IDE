// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { DocumentMapTagFilter } from "../../src/renderer/DocumentMapTagFilter";

const translate: Translate = (key, values) =>
  values && "count" in values ? `${key}:${values.count}` : key;

function tag(id: string, label: string, backgroundRgb = "#1f77b4"): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb,
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

// Passed in `glossary_tags.sort_order` order.
const person = tag("t-person", "人名", "#11aa11");
const place = tag("t-place", "地名", "#1111aa");
const core = tag("t-core", "コアメンバー", "#aa11aa");
const extraA = tag("t-a", "陣営", "#118811");
const extraB = tag("t-b", "所属", "#881111");

const allTags = [person, place, core];

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
  props: Partial<React.ComponentProps<typeof DocumentMapTagFilter>> = {}
) {
  const onChange = vi.fn();
  act(() => {
    root.render(
      React.createElement(DocumentMapTagFilter, {
        tags: allTags,
        // The panel defaults to every tag selected.
        selectedTagIds: allTags.map((t) => t.id),
        translate,
        onChange,
        ...props
      })
    );
  });
  return { onChange };
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    ".documentMapTagFilterTrigger"
  )!;
}

function openPopup(): void {
  act(() => trigger().click());
}

function options(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(".documentMapTagFilterOption")
  );
}

describe("DocumentMapTagFilter (#375)", () => {
  it("shows the label and, with EVERY tag selected, the 'Show all' status (no chip list)", () => {
    render();
    expect(
      container.querySelector(".documentMapTagFilterLabel")?.textContent
    ).toBe("documentMap.renderTags.label");
    expect(
      trigger().querySelector(".documentMapTagFilterAllSelected")?.textContent
    ).toBe("documentMap.renderTags.showAll");
    // No chip list / "+n" pill while everything is selected.
    expect(trigger().querySelector(".documentMapTagFilterChips")).toBeNull();
    expect(trigger().querySelector(".documentMapTagFilterMore")).toBeNull();
  });

  it("shows first chips + a '+n' pill when SOME (not all) tags are selected", () => {
    render({
      tags: [person, place, core, extraA],
      selectedTagIds: ["t-person", "t-place", "t-core"]
    });
    const chips = Array.from(
      trigger().querySelectorAll(".documentMapTagFilterChips .glossaryTagChip")
    ).map((el) => el.textContent);
    // MAX_VISIBLE_CHIPS = 2 → 人名 / 地名 chips + "+1".
    expect(chips).toEqual(["人名", "地名"]);
    expect(
      trigger().querySelector(".documentMapTagFilterMore")?.textContent
    ).toBe("documentMap.renderTags.moreSelected:1");
  });

  it("shows the muted 'No render tags' text when the selection is empty (NOT 'All')", () => {
    render({ selectedTagIds: [] });
    expect(
      trigger().querySelector(".documentMapTagFilterNoSelection")?.textContent
    ).toBe("documentMap.renderTags.noSelection");
    expect(trigger().textContent).not.toContain("documentMap.renderTags.all");
  });

  it("lists every tag as an option, in the given (sort_order) order, as chips", () => {
    render();
    openPopup();
    const labels = Array.from(
      container.querySelectorAll(".documentMapTagFilterOption .glossaryTagChip")
    ).map((el) => el.textContent);
    expect(labels).toEqual(["人名", "地名", "コアメンバー"]);
  });

  it("clicking anywhere on an option row toggles it (whole row, not just a checkbox square)", () => {
    // Un-select 地名 by clicking the ROW button (its click target spans the
    // check indicator, the chip and the row padding).
    const { onChange } = render();
    openPopup();
    act(() => options()[1].click());
    expect(onChange).toHaveBeenCalledWith(["t-person", "t-core"]);
  });

  it("clicking the tag chip inside an option toggles the same row (single fire)", () => {
    const { onChange } = render({ selectedTagIds: ["t-person"] });
    openPopup();
    act(() =>
      options()[1]
        .querySelector<HTMLElement>(".glossaryTagChip")!
        .click()
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["t-person", "t-place"]);
  });

  it("reflects selection state on each option via aria-pressed / data-checked", () => {
    render({ selectedTagIds: ["t-place"] });
    openPopup();
    const [personOpt, placeOpt, coreOpt] = options();
    expect(personOpt.getAttribute("aria-pressed")).toBe("false");
    expect(placeOpt.getAttribute("aria-pressed")).toBe("true");
    expect(coreOpt.getAttribute("aria-pressed")).toBe("false");
    expect(
      placeOpt.querySelector(".documentMapTagFilterCheck")?.getAttribute(
        "data-checked"
      )
    ).toBe("true");
  });

  it("renders selected values as chips in project order and a selected-count title", () => {
    render({ selectedTagIds: ["t-core", "t-person"] });
    const chips = Array.from(
      trigger().querySelectorAll(".documentMapTagFilterChips .glossaryTagChip")
    ).map((el) => el.textContent);
    // Project order (人名 before コアメンバー), not the selection order.
    expect(chips).toEqual(["人名", "コアメンバー"]);
    expect(trigger().getAttribute("title")).toBe(
      "documentMap.renderTags.selectedCount:2"
    );
  });

  it("collapses extra selected chips into a '+n' pill, in project order", () => {
    // 4 of 5 tags selected (extraB left off), in scrambled selection order.
    render({
      tags: [person, place, core, extraA, extraB],
      selectedTagIds: ["t-core", "t-person", "t-a", "t-place"]
    });
    const chips = Array.from(
      trigger().querySelectorAll(".documentMapTagFilterChips .glossaryTagChip")
    ).map((el) => el.textContent);
    expect(chips).toEqual(["人名", "地名"]); // first 2 in project order
    expect(
      trigger().querySelector(".documentMapTagFilterMore")?.textContent
    ).toBe("documentMap.renderTags.moreSelected:2");
  });

  it("'Show all' re-selects every tag (it does NOT clear), and is hidden when all are selected", () => {
    const { onChange } = render({ selectedTagIds: ["t-place"] });
    openPopup();
    const showAll = container.querySelector<HTMLButtonElement>(
      ".documentMapTagFilterShowAll"
    )!;
    expect(showAll.textContent).toBe("documentMap.renderTags.showAll");
    act(() => showAll.click());
    expect(onChange).toHaveBeenCalledWith(["t-person", "t-place", "t-core"]);

    // With every tag already selected there is nothing to restore.
    render();
    openPopup();
    expect(
      container.querySelector(".documentMapTagFilterShowAll")
    ).toBeNull();
  });

  it("shows 'Show all' when the selection is empty (to restore every tag)", () => {
    render({ selectedTagIds: [] });
    openPopup();
    expect(
      container.querySelector(".documentMapTagFilterShowAll")
    ).not.toBeNull();
  });

  it("is disabled and shows 'No tags available' when there are no tags", () => {
    render({ tags: [], selectedTagIds: [] });
    expect(trigger().disabled).toBe(true);
    expect(trigger().textContent).toContain("documentMap.renderTags.noTags");
    openPopup();
    expect(container.querySelector(".documentMapTagFilterPopup")).toBeNull();
  });

  it("closes the popup on focus-out", () => {
    render();
    openPopup();
    expect(
      container.querySelector(".documentMapTagFilterPopup")
    ).not.toBeNull();

    act(() => {
      trigger().dispatchEvent(
        new window.FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: null
        })
      );
    });
    expect(container.querySelector(".documentMapTagFilterPopup")).toBeNull();
  });
});
