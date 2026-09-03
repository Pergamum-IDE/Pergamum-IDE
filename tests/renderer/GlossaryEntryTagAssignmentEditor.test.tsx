// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryTag } from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { GlossaryEntryTagAssignmentEditor } from "../../src/renderer/GlossaryEntryTagAssignmentEditor";

const translate: Translate = (key) => key;

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#123456",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

const person = tag("t-person", "登場人物");
const place = tag("t-place", "地名");
const org = tag("t-org", "組織");
const projectTags = [person, place, org]; // project sortOrder

function handlers() {
  return {
    onAssignTag: vi.fn(),
    onUnassignTag: vi.fn(),
    onReorderAssignedTag: vi.fn(),
    onOpenTagManager: vi.fn()
  };
}

describe("GlossaryEntryTagAssignmentEditor (#375) — markup", () => {
  it("renders assigned (assignment order) left, available (project order) right, Primary badge on the head", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEntryTagAssignmentEditor, {
        assignedTagIds: [org.id, person.id],
        projectTags,
        translate,
        ...handlers()
      })
    );

    expect(markup).toContain("glossaryEditor.tags.assignedTitle");
    expect(markup).toContain("glossaryEditor.tags.availableTitle");
    // Assigned order = [組織, 登場人物]; available = [地名].
    expect(markup.indexOf("組織")).toBeLessThan(markup.indexOf("登場人物"));
    expect(markup).toContain("地名");
    expect(
      markup.match(/glossaryEntryTagAssignmentPrimaryBadge/g)
    ).toHaveLength(1);
    expect(markup).toContain("glossaryEditor.tags.primary");
  });

  it("shows the assigned empty state and the available empty state", () => {
    const noneAssigned = renderToStaticMarkup(
      React.createElement(GlossaryEntryTagAssignmentEditor, {
        assignedTagIds: [],
        projectTags,
        translate,
        ...handlers()
      })
    );
    expect(noneAssigned).toContain("glossaryEditor.tags.noAssigned");

    const allAssigned = renderToStaticMarkup(
      React.createElement(GlossaryEntryTagAssignmentEditor, {
        assignedTagIds: projectTags.map((t) => t.id),
        projectTags,
        translate,
        ...handlers()
      })
    );
    expect(allAssigned).toContain("glossaryEditor.tags.noAvailable");
  });

  it("shows 'no tags available' when the project has no tags at all", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEntryTagAssignmentEditor, {
        assignedTagIds: [],
        projectTags: [],
        translate,
        ...handlers()
      })
    );
    expect(markup).toContain("glossaryEditor.tags.noProjectTags");
  });

  it("disables every drag handle in read-only mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryEntryTagAssignmentEditor, {
        assignedTagIds: [person.id],
        projectTags,
        translate,
        readOnly: true,
        ...handlers()
      })
    );
    expect(markup).toMatch(/glossaryEntryTagAssignmentDragHandle[^>]*disabled/);
    expect(markup).not.toContain('draggable="true"');
  });
});

describe("GlossaryEntryTagAssignmentEditor (#375) — interaction", () => {
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

  function render(
    assignedTagIds: string[],
    h = handlers()
  ): ReturnType<typeof handlers> {
    act(() => {
      root.render(
        React.createElement(GlossaryEntryTagAssignmentEditor, {
          assignedTagIds,
          projectTags,
          translate,
          ...h
        })
      );
    });
    return h;
  }

  function assignedHandles(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentList-assigned .glossaryEntryTagAssignmentDragHandle"
      )
    );
  }

  function availableHandles(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentList-available .glossaryEntryTagAssignmentDragHandle"
      )
    );
  }

  it("keyboard: Arrow Down on an assigned handle reorders it", () => {
    const h = render([person.id, place.id, org.id]);
    act(() => {
      assignedHandles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(h.onReorderAssignedTag).toHaveBeenCalledWith(person.id, 1);
  });

  it("keyboard: Enter on an available handle assigns it at the end", () => {
    const h = render([person.id]); // available = [地名, 組織]
    act(() => {
      availableHandles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    expect(h.onAssignTag).toHaveBeenCalledWith(place.id, 1);
  });

  it("clicking the manage-tags link opens the Tag Manager", () => {
    const h = render([]);
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          ".glossaryEntryTagAssignmentManageLink"
        )!
        .click()
    );
    expect(h.onOpenTagManager).toHaveBeenCalledTimes(1);
  });

  function fakeDataTransfer() {
    const data = new Map<string, string>();
    return {
      _data: data,
      types: [] as string[],
      dropEffect: "",
      effectAllowed: "",
      setData(type: string, value: string) {
        data.set(type, value);
        this.types = [...data.keys()];
      },
      getData(type: string) {
        return data.get(type) ?? "";
      }
    };
  }

  function fire(
    target: EventTarget,
    type: string,
    dataTransfer: ReturnType<typeof fakeDataTransfer>,
    clientY = 0
  ): void {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    Object.defineProperty(event, "clientY", { value: clientY });
    act(() => {
      target.dispatchEvent(event);
    });
  }

  it("D&D: dragging an available tag onto the assigned list assigns it", () => {
    const h = render([person.id]); // available[0] = 地名
    const dt = fakeDataTransfer();

    fire(availableHandles()[0], "dragstart", dt);
    const assignedList = container.querySelector(
      ".glossaryEntryTagAssignmentList-assigned"
    )!;
    fire(assignedList, "dragover", dt, 5);
    fire(assignedList, "drop", dt, 5);

    expect(h.onAssignTag).toHaveBeenCalledWith(place.id, 1);
    expect(h.onUnassignTag).not.toHaveBeenCalled();
  });

  it("D&D: dragging an assigned tag onto the available list unassigns it", () => {
    const h = render([person.id, place.id]);
    const dt = fakeDataTransfer();

    fire(assignedHandles()[1], "dragstart", dt); // 地名
    const availableList = container.querySelector(
      ".glossaryEntryTagAssignmentList-available"
    )!;
    fire(availableList, "dragover", dt);
    fire(availableList, "drop", dt);

    expect(h.onUnassignTag).toHaveBeenCalledWith(place.id);
    expect(h.onAssignTag).not.toHaveBeenCalled();
  });

  it("D&D: reordering within the assigned list", () => {
    const h = render([person.id, place.id, org.id]);
    const dt = fakeDataTransfer();

    fire(assignedHandles()[2], "dragstart", dt); // 組織 (index 2)
    const firstRow = container.querySelectorAll(
      ".glossaryEntryTagAssignmentList-assigned .glossaryEntryTagAssignmentRow"
    )[0];
    fire(firstRow, "dragover", dt, 0); // upper half → gap 0
    fire(firstRow, "drop", dt, 0);

    expect(h.onReorderAssignedTag).toHaveBeenCalledWith(org.id, 0);
  });
});
