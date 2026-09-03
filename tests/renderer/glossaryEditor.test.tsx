// @vitest-environment happy-dom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import type {
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import type { Translate } from "../../src/shared/i18n";
import { pergamumContextSurfaceAttribute } from "../../src/shared/editContextMenu";
import { GlossaryEditor } from "../../src/renderer/GlossaryEditor";
import {
  createGlossaryEntryDraft,
  updateGlossaryEntryDraftAtomValue,
  type GlossaryEntryDraft
} from "../../src/renderer/glossaryEntryDraft";

const translate: Translate = (key) => key;
const ts = "2026-09-02T00:00:00.000Z";
const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";

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

const tagA = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "武将");
const tagB = tag("018f4b8c-7a2b-7c3d-8e4f-300000000002", "地名");

function entry(): GlossaryEntry {
  return {
    id: entryId,
    description: "王国の首都",
    atoms: [
      {
        id: "a1",
        entryId,
        sortOrder: 0,
        value: "王都アルセリア",
        matchFlags: 0,
        createdAt: ts,
        updatedAt: ts
      },
      {
        id: "a2",
        entryId,
        sortOrder: 1,
        value: "アルセリア",
        matchFlags: setGlossaryAtomBoundaryStartPolicy(
          0,
          GlossaryBoundaryPolicy.Auto
        ),
        createdAt: ts,
        updatedAt: ts
      }
    ],
    tags: [tagA],
    createdAt: ts,
    updatedAt: ts
  };
}

function noopHandlers() {
  return {
    onChangeDescription: vi.fn(),
    onAddAtom: vi.fn(),
    onChangeAtomValue: vi.fn(),
    onChangeAtomMatchFlags: vi.fn(),
    onDeleteAtom: vi.fn(),
    onReorderAtom: vi.fn(),
    onToggleTag: vi.fn(),
    onOpenTagManager: vi.fn(),
    onDeleteEntry: vi.fn(),
    onNavigateToPreviousOccurrence: vi.fn(),
    onNavigateToNextOccurrence: vi.fn()
  };
}

function render(
  draft: GlossaryEntryDraft,
  overrides: {
    availableTags?: readonly GlossaryTag[];
    readOnly?: boolean;
  } = {}
): string {
  return renderToStaticMarkup(
    React.createElement(GlossaryEditor, {
      draft,
      availableTags: overrides.availableTags ?? [tagA, tagB],
      translate,
      readOnly: overrides.readOnly,
      ...noopHandlers()
    })
  );
}

describe("GlossaryEditor (#375)", () => {
  it("renders one row per atom with the representative badge on the first", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("王都アルセリア");
    expect(markup).toContain("アルセリア");
    expect(markup).toContain("glossaryEditor.atoms.representative");
    // Exactly one representative badge.
    expect(
      markup.match(/glossaryEditorAtomRepresentativeBadge/g)
    ).toHaveLength(1);
    // No `kind` / alias / variant / warning-policy vocabulary remains.
    expect(markup).not.toContain("glossaryEditor.kind");
    expect(markup).not.toContain("glossaryEditor.aliases");
    expect(markup).not.toContain("warningPolicy");
  });

  it("renders a ⣿ drag handle per atom row and no ↑ / ↓ move buttons", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    // One labelled handle per atom (2 atoms in the fixture).
    expect(markup.match(/glossaryEditorAtomDragHandle/g)).toHaveLength(2);
    expect(markup.match(/⣿/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="glossaryEditor.atoms.dragHandle"');
    expect(markup).toContain('draggable="true"');

    // The old up/down affordances are gone.
    expect(markup).not.toContain("glossaryEditorAtomMoveButton");
    expect(markup).not.toContain("glossaryEditor.atoms.moveUp");
    expect(markup).not.toContain("glossaryEditor.atoms.moveDown");
    expect(markup).not.toContain("↑");
    expect(markup).not.toContain("↓");
  });

  it("disables the drag handle when there is only one atom (nothing to reorder)", () => {
    const draft = createGlossaryEntryDraft({
      ...entry(),
      atoms: [entry().atoms[0]]
    });
    const markup = render(draft);

    expect(markup).toMatch(/glossaryEditorAtomDragHandle[^>]*disabled/);
  });

  it("renders the per-atom match-flags editor: single-character bit + start/end boundary policy selects", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEditor.atoms.matchFlags.singleCharacter");
    expect(markup).toContain(
      "glossaryEditor.atoms.matchFlags.boundaryStartPolicy"
    );
    expect(markup).toContain(
      "glossaryEditor.atoms.matchFlags.boundaryEndPolicy"
    );
    // Two atoms × two policy selects each.
    expect(markup.match(/<select/g)).toHaveLength(4);
    // a2's start policy is Auto → one option is rendered selected.
    expect(markup).toContain("selected");
  });

  it("marks the atom value inputs as an edit context menu surface", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain(
      `${pergamumContextSurfaceAttribute}="glossaryAtomValue"`
    );
    expect(markup).not.toContain("glossaryCanonicalInput");
    expect(markup).not.toContain("glossaryFormSurface");
  });

  it("renders the tag picker: attached tag pressed, unattached tag muted", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEditor.tags.heading");
    expect(markup).toContain("武将");
    expect(markup).toContain("地名");
    // The attached tag's toggle is aria-pressed="true".
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('data-muted="true"');
  });

  it("shows a 'no project tags' notice when there are none", () => {
    const markup = render(createGlossaryEntryDraft(entry()), {
      availableTags: []
    });

    expect(markup).toContain("glossaryEditor.tags.noProjectTags");
    expect(markup).not.toContain("glossaryEditorTagList");
  });

  it("shows a validity message for a duplicate atom value", () => {
    let draft = createGlossaryEntryDraft(entry());
    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", "王都アルセリア");

    const markup = render(draft);

    expect(markup).toContain("glossaryEditor.validity.duplicateAtomValue");
    expect(markup).toContain('role="alert"');
  });

  it("renders previous/next occurrence buttons and a delete-entry icon button", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEditor.previousOccurrenceLabel");
    expect(markup).toContain("glossaryEditor.nextOccurrenceLabel");
    expect(markup).toContain('aria-label="glossaryEditor.deleteEntry"');
  });

  it("disables every write control in read-only mode but keeps occurrence navigation live", () => {
    const markup = render(createGlossaryEntryDraft(entry()), {
      readOnly: true
    });

    expect(markup).toContain("glossaryEditorAddAtom");
    expect(markup).toMatch(/glossaryEditorAddAtom[^>]*disabled/);
    // Occurrence buttons are never disabled.
    const occurrence = markup.slice(
      markup.indexOf("glossaryEditorOccurrenceButton")
    );
    expect(occurrence.slice(0, 200)).not.toContain("disabled");
  });

  it("renders the draft description as Markdown preview, not raw source", () => {
    const draft = createGlossaryEntryDraft({
      ...entry(),
      description: "# 見出し"
    });

    const markup = render(draft);

    expect(markup).toContain("<h1>見出し</h1>");
    expect(markup).not.toContain("# 見出し");
  });

  it("renders a 'manage tags' link near the tag picker", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEditorTagsManageLink");
    expect(markup).toContain("glossaryEditor.tags.openManager");
  });
});

describe("GlossaryEditor (#375) — tag manager link", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("calls onOpenTagManager when the manage-tags link is clicked", () => {
    const onOpenTagManager = vi.fn();

    act(() => {
      root.render(
        React.createElement(GlossaryEditor, {
          draft: createGlossaryEntryDraft(entry()),
          availableTags: [tagA, tagB],
          translate,
          ...noopHandlers(),
          onOpenTagManager
        })
      );
    });

    container
      .querySelector<HTMLButtonElement>(".glossaryEditorTagsManageLink")!
      .click();

    expect(onOpenTagManager).toHaveBeenCalledTimes(1);
  });
});

describe("GlossaryEditor (#375) — atom drag-reorder", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(): { onReorderAtom: ReturnType<typeof vi.fn> } {
    const onReorderAtom = vi.fn();
    act(() => {
      root.render(
        React.createElement(GlossaryEditor, {
          draft: createGlossaryEntryDraft(entry()),
          availableTags: [tagA, tagB],
          translate,
          ...noopHandlers(),
          onReorderAtom
        })
      );
    });
    return { onReorderAtom };
  }

  function handles(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".glossaryEditorAtomDragHandle"
      )
    );
  }

  function rows(): HTMLLIElement[] {
    return Array.from(
      container.querySelectorAll<HTMLLIElement>(".glossaryEditorAtomRow")
    );
  }

  it("keyboard: Arrow Down on the first handle asks to move a1 to index 1", () => {
    const { onReorderAtom } = mount();

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true
        })
      );
    });

    expect(onReorderAtom).toHaveBeenCalledWith("a1", 1);
  });

  it("keyboard: Arrow Up on the second handle asks to move a2 to index 0", () => {
    const { onReorderAtom } = mount();

    act(() => {
      handles()[1].dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
    });

    expect(onReorderAtom).toHaveBeenCalledWith("a2", 0);
  });

  it("keyboard: Arrow Up on the first (representative) handle is a no-op", () => {
    const { onReorderAtom } = mount();

    act(() => {
      handles()[0].dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
      );
    });

    expect(onReorderAtom).not.toHaveBeenCalled();
  });

  it("drag-and-drop: dragging a1's handle onto the lower half of a2 asks to move a1 to index 1", () => {
    const { onReorderAtom } = mount();

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
      const event = new window.Event(type, {
        bubbles: true,
        cancelable: true
      });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      Object.defineProperty(event, "clientY", { value: clientY });
      act(() => {
        target.dispatchEvent(event);
      });
    }

    // Row rects are 0-height in happy-dom, so any clientY > 0 lands in the
    // lower half → the gap after that row. Dropping onto a2 (index 1) means
    // gap 2; dragging a1 from index 0 into gap 2 resolves to final index 1.
    fire(handles()[0], "dragstart", 0);
    fire(rows()[1], "dragover", 5);
    fire(rows()[1], "drop", 5);

    expect(onReorderAtom).toHaveBeenCalledWith("a1", 1);
  });
});
