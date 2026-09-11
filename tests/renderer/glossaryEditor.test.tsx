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
import {
  GlossaryEditor,
  type GlossaryEditorMode
} from "../../src/renderer/GlossaryEditor";
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

/** #412 Blocker 1: the global editor settings GlossaryEditor now requires. */
const editorSettingsProps = {
  markerGlyph: "↓" as const,
  expectedLineEnding: "lf" as const,
  newFileLineEndingFallback: "lf" as const,
  whitespaceSettings: {
    renderIdeographicSpace: false,
    renderAsciiSpace: false,
    renderTab: false,
    renderOtherUnicodeSpace: false
  },
  undoHistoryMinDepth: 100
};

function noopHandlers() {
  return {
    ...editorSettingsProps,
    onChangeDescription: vi.fn(),
    onAddAtom: vi.fn(),
    onChangeAtomValue: vi.fn(),
    onChangeAtomMatchFlags: vi.fn(),
    onDeleteAtom: vi.fn(),
    onReorderAtom: vi.fn(),
    onAssignTag: vi.fn(),
    onUnassignTag: vi.fn(),
    onReorderAssignedTag: vi.fn(),
    onOpenTagManager: vi.fn(),
    onDeleteEntry: vi.fn()
  };
}

function render(
  draft: GlossaryEntryDraft,
  overrides: {
    mode?: GlossaryEditorMode;
    availableTags?: readonly GlossaryTag[];
    readOnly?: boolean;
  } = {}
): string {
  return renderToStaticMarkup(
    React.createElement(GlossaryEditor, {
      mode: overrides.mode ?? "edit",
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

  it("renders the two-list tag assignment editor: assigned left, available right", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEditor.tags.heading");
    expect(markup).toContain("glossaryEditor.tags.assignedTitle");
    expect(markup).toContain("glossaryEditor.tags.availableTitle");
    // tagA is assigned (fixture entry.tags = [tagA]); tagB is available.
    expect(markup).toContain("武将");
    expect(markup).toContain("地名");
    // #400: the first assigned tag's chip gets the flag + shadow instead of
    // a separate "Primary" badge — the old badge element is gone.
    expect(markup).not.toContain("glossaryEntryTagAssignmentPrimaryBadge");
    expect(markup.match(/data-primary="true"/g)).toHaveLength(1);
    expect(markup.match(/feather-flag/g)).toHaveLength(1);
    expect(markup).toContain("glossaryEditor.tags.primary");
  });

  it("shows the assigned empty state when no tag is assigned", () => {
    const markup = render(
      createGlossaryEntryDraft({ ...entry(), tags: [] })
    );

    expect(markup).toContain("glossaryEditor.tags.noAssigned");
    expect(markup).not.toContain("glossaryEditor.tags.primary");
  });

  it("shows the available empty state when every tag is assigned", () => {
    const markup = render(
      createGlossaryEntryDraft({ ...entry(), tags: [tagA, tagB] })
    );

    expect(markup).toContain("glossaryEditor.tags.noAvailable");
  });

  it("shows a 'no tags available' notice when the project has none", () => {
    const markup = render(
      createGlossaryEntryDraft({ ...entry(), tags: [] }),
      { availableTags: [] }
    );

    expect(markup).toContain("glossaryEditor.tags.noProjectTags");
  });

  it("shows a validity message for a duplicate atom value", () => {
    let draft = createGlossaryEntryDraft(entry());
    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", "王都アルセリア");

    const markup = render(draft);

    expect(markup).toContain("glossaryEditor.validity.duplicateAtomValue");
    expect(markup).toContain('role="alert"');
  });

  it("renders a delete-entry icon button in edit mode", () => {
    const markup = render(createGlossaryEntryDraft(entry()), {
      mode: "edit"
    });

    expect(markup).toContain('aria-label="glossaryEditor.deleteEntry"');
  });

  it("#436 Slice 9: hides the delete-entry button in create mode (nothing persisted yet)", () => {
    const markup = render(createGlossaryEntryDraft(entry()), {
      mode: "create"
    });

    expect(markup).not.toContain('aria-label="glossaryEditor.deleteEntry"');
  });

  it("#436 Slice 9: no longer renders occurrence navigation UI", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).not.toContain("glossaryEditorOccurrenceButton");
    expect(markup).not.toContain("previousOccurrence");
    expect(markup).not.toContain("nextOccurrence");
  });

  it("disables every write control in read-only mode", () => {
    const markup = render(createGlossaryEntryDraft(entry()), {
      readOnly: true
    });

    expect(markup).toContain("glossaryEditorAddAtom");
    expect(markup).toMatch(/glossaryEditorAddAtom[^>]*disabled/);
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

  it("renders a 'manage tags' link near the tag assignment editor", () => {
    const markup = render(createGlossaryEntryDraft(entry()));

    expect(markup).toContain("glossaryEntryTagAssignmentManageLink");
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
          mode: "edit",
          draft: createGlossaryEntryDraft(entry()),
          availableTags: [tagA, tagB],
          translate,
          ...noopHandlers(),
          onOpenTagManager
        })
      );
    });

    container
      .querySelector<HTMLButtonElement>(
        ".glossaryEntryTagAssignmentManageLink"
      )!
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
          mode: "edit",
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

describe("GlossaryEditor — Preview project-local image links (#412)", () => {
  function draftWithDescription(description: string): GlossaryEntryDraft {
    return { ...createGlossaryEntryDraft(entry()), description };
  }

  it("rewrites a project-root-relative image link to pergamum-asset:// in the Preview", () => {
    const markup = render(
      draftWithDescription("![](assets/images/foo.png)")
    );
    expect(markup).toContain(
      "pergamum-asset://project/assets/images/foo.png"
    );
  });

  it("rewrites a leading ./ link against the project root", () => {
    const markup = render(
      draftWithDescription("![](./assets/characters/shizuku.png)")
    );
    expect(markup).toContain(
      "pergamum-asset://project/assets/characters/shizuku.png"
    );
  });

  it("neutralizes a ../ link — the Glossary has no source folder, so it escapes the root", () => {
    const markup = render(
      draftWithDescription("![](../assets/images/foo.png)")
    );
    expect(markup).toContain('src="data:,"');
    expect(markup).not.toContain("pergamum-asset:");
  });

  it("leaves external http(s) / data / blob images untouched", () => {
    for (const src of [
      "http://example.com/a.png",
      "https://example.com/a.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "blob:https://x/abcd"
    ]) {
      const markup = render(draftWithDescription(`![](${src})`));
      expect(markup).not.toContain("pergamum-asset:");
      expect(markup).not.toContain('src="data:,"');
    }
  });

  it("leaves .svg / .bmp / .avif links untouched (unsupported formats)", () => {
    for (const ext of ["svg", "bmp", "avif"]) {
      const markup = render(draftWithDescription(`![](assets/pic.${ext})`));
      expect(markup).toContain(`src="assets/pic.${ext}"`);
      expect(markup).not.toContain("pergamum-asset:");
    }
  });

  it("does not mutate the draft's description string (render-only, no DB normalization)", () => {
    const original = "![](assets/images/foo.png) and ![](../up.png)";
    const draft = draftWithDescription(original);
    render(draft);
    expect(draft.description).toBe(original);
  });
});

describe("GlossaryEditor — description editor line-break marker (#412 Blocker 1)", () => {
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

  function mount(markerGlyph: "none" | "⏎" | "↵" | "↓"): void {
    act(() => {
      root.render(
        React.createElement(GlossaryEditor, {
          mode: "edit",
          draft: draftWithMultilineDescription(),
          availableTags: [tagA, tagB],
          translate,
          ...noopHandlers(),
          markerGlyph
        })
      );
    });
  }

  function draftWithMultilineDescription(): GlossaryEntryDraft {
    return {
      ...createGlossaryEntryDraft(entry()),
      description: "first line\nsecond line\nthird line\n"
    };
  }

  function markerGlyphs(): string[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(".pergamum-line-end-marker")
    ).map((el) => el.textContent ?? "");
  }

  it("renders the CONFIGURED glyph (↓), not MarkdownEditor's built-in ⏎ default", () => {
    mount("↓");
    const glyphs = markerGlyphs();
    expect(glyphs.length).toBeGreaterThan(0);
    expect(new Set(glyphs)).toEqual(new Set(["↓"]));
  });

  it("draws no marker when the setting is 'none'", () => {
    mount("none");
    expect(markerGlyphs()).toEqual([]);
  });

  it("keeps the marker after an unmount + remount (tab switch away and back)", () => {
    mount("↓");
    expect(markerGlyphs().length).toBeGreaterThan(0);

    act(() => root.unmount());
    root = createRoot(container);
    mount("↓");

    const glyphs = markerGlyphs();
    expect(glyphs.length).toBeGreaterThan(0);
    expect(new Set(glyphs)).toEqual(new Set(["↓"]));
  });
});
