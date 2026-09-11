// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryTag,
  UpdateGlossaryEntryInput
} from "../../src/shared/glossary";
import type { GlossaryEntryDraft } from "../../src/renderer/glossaryEntryDraft";
import { GlossaryEntryEditorPane } from "../../src/renderer/GlossaryEntryEditorPane";
import {
  DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE,
  GLOSSARY_ENTRY_EDITOR_PANE_DEFAULT_HEIGHT,
  GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT,
  clampGlossaryEntryEditorPaneHeight,
  closeGlossaryEntryEditorPane,
  createInitialGlossaryEntryEditorPaneState,
  isSameGlossaryEntryEditorPaneTarget,
  openGlossaryEntryCreatePane,
  openGlossaryEntryEditPane,
  type OpenGlossaryEntryEditorPaneState
} from "../../src/renderer/glossaryEntryEditorPaneState";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

describe("glossaryEntryEditorPaneState — Slice 2 operation API (#436)", () => {
  it("starts closed", () => {
    expect(createInitialGlossaryEntryEditorPaneState()).toEqual({
      isOpen: false
    });
  });

  it("create open sets mode 'create' and keeps the source", () => {
    expect(
      openGlossaryEntryCreatePane({ source: "glossary-pane" })
    ).toMatchObject({
      isOpen: true,
      mode: "create",
      source: "glossary-pane"
    });
  });

  it("create open keeps an explicit presetRepresentative", () => {
    const state = openGlossaryEntryCreatePane({
      source: "editor-selection",
      presetRepresentative: "シズク"
    });

    expect(state).toEqual({
      isOpen: true,
      mode: "create",
      source: "editor-selection",
      presetRepresentative: "シズク"
    });
  });

  it("create open falls back to 新しい語彙 when presetRepresentative is missing or empty", () => {
    expect(DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE).toBe("新しい語彙");

    for (const preset of [undefined, ""]) {
      const state = openGlossaryEntryCreatePane({
        source: "glossary-settings",
        presetRepresentative: preset
      });
      expect(state).toMatchObject({
        mode: "create",
        presetRepresentative: "新しい語彙"
      });
    }
  });

  it("edit open sets mode 'edit' and keeps the entryId and source", () => {
    expect(
      openGlossaryEntryEditPane({
        source: "glossary-settings",
        entryId: "entry-42"
      })
    ).toEqual({
      isOpen: true,
      mode: "edit",
      source: "glossary-settings",
      entryId: "entry-42"
    });
  });

  it("close returns the closed state", () => {
    expect(closeGlossaryEntryEditorPane()).toEqual({ isOpen: false });
  });
});

describe("isSameGlossaryEntryEditorPaneTarget (#436 Slice 11)", () => {
  it("is false when the pane is closed", () => {
    expect(
      isSameGlossaryEntryEditorPaneTarget(
        { isOpen: false },
        openGlossaryEntryEditPane({ source: "glossary-pane", entryId: "e1" })
      )
    ).toBe(false);
  });

  it("is false across different modes", () => {
    expect(
      isSameGlossaryEntryEditorPaneTarget(
        openGlossaryEntryCreatePane({ source: "glossary-pane" }),
        openGlossaryEntryEditPane({ source: "glossary-pane", entryId: "e1" })
      )
    ).toBe(false);
  });

  it("edit mode: true only for the SAME entryId, regardless of source", () => {
    const current = openGlossaryEntryEditPane({
      source: "glossary-pane",
      entryId: "e1"
    });

    expect(
      isSameGlossaryEntryEditorPaneTarget(
        current,
        openGlossaryEntryEditPane({ source: "glossary-settings", entryId: "e1" })
      )
    ).toBe(true);
    expect(
      isSameGlossaryEntryEditorPaneTarget(
        current,
        openGlossaryEntryEditPane({ source: "glossary-pane", entryId: "e2" })
      )
    ).toBe(false);
  });

  it("create mode: true only for the SAME presetRepresentative, regardless of source", () => {
    const current = openGlossaryEntryCreatePane({
      source: "glossary-pane",
      presetRepresentative: "織田信長"
    });

    expect(
      isSameGlossaryEntryEditorPaneTarget(
        current,
        openGlossaryEntryCreatePane({
          source: "glossary-settings",
          presetRepresentative: "織田信長"
        })
      )
    ).toBe(true);
    expect(
      isSameGlossaryEntryEditorPaneTarget(
        current,
        openGlossaryEntryCreatePane({
          source: "glossary-pane",
          presetRepresentative: "豊臣秀吉"
        })
      )
    ).toBe(false);
  });

  it("re-triggering 語彙を追加 twice with no preset resolves to the same default target", () => {
    const current = openGlossaryEntryCreatePane({ source: "glossary-pane" });

    expect(
      isSameGlossaryEntryEditorPaneTarget(
        current,
        openGlossaryEntryCreatePane({ source: "glossary-pane" })
      )
    ).toBe(true);
  });
});

describe("clampGlossaryEntryEditorPaneHeight — Slice 6 remediation (#436)", () => {
  it("defaults above the minimum", () => {
    expect(GLOSSARY_ENTRY_EDITOR_PANE_DEFAULT_HEIGHT).toBeGreaterThan(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
  });

  it("raises a too-small height to the minimum", () => {
    expect(clampGlossaryEntryEditorPaneHeight(40)).toBe(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
    expect(clampGlossaryEntryEditorPaneHeight(40, 1000)).toBe(
      GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT
    );
  });

  it("passes a mid-range height through when the area is roomy", () => {
    expect(clampGlossaryEntryEditorPaneHeight(300, 1000)).toBe(300);
  });

  it("caps the height to 65% of the editor area", () => {
    expect(clampGlossaryEntryEditorPaneHeight(900, 1000)).toBe(650);
  });

  it("keeps a minimum of content visible above the pane in a short area", () => {
    // 400 area, content-min 160 → pane capped at 240 even though 65% = 260.
    expect(clampGlossaryEntryEditorPaneHeight(900, 400)).toBe(240);
  });

  it("lets the pane shrink below its own minimum when the area cannot fit both", () => {
    const clamped = clampGlossaryEntryEditorPaneHeight(900, 200);
    expect(clamped).toBeLessThan(GLOSSARY_ENTRY_EDITOR_PANE_MIN_HEIGHT);
    expect(clamped).toBeGreaterThan(0);
  });
});

function savedEntryFixture(
  overrides: Partial<GlossaryEntry> = {}
): GlossaryEntry {
  return {
    id: "entry-99",
    description: "",
    atoms: [
      {
        id: "atom-99",
        entryId: "entry-99",
        sortOrder: 0,
        value: "徳川家康",
        matchFlags: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

// #436 Slice 9: create and edit both render the SAME `GlossaryEntryEditorSession`
// hosting the EXISTING `GlossaryEditor` — no more separate `GlossaryEntryForm`.
// These tests therefore exercise the pane through `GlossaryEditor`'s own DOM
// (`.glossaryEditorAtomValue`, `.glossaryEditorDeleteButton`, …) rather than
// the retired `.glossaryEntryForm*` classes.
describe("GlossaryEntryEditorPane (#436 Slice 9: unified create/edit via GlossaryEditor)", () => {
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

  function renderPane(options: {
    state: OpenGlossaryEntryEditorPaneState;
    height?: number;
    availableTags?: readonly GlossaryTag[];
    onCreateEntry?: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
    onLoadEntry?: (
      entryId: GlossaryEntryId
    ) => Promise<GlossaryEntry | null>;
    onSaveEntry?: (
      input: UpdateGlossaryEntryInput
    ) => Promise<GlossaryEntry>;
    onDeleteEntry?: (draft: GlossaryEntryDraft) => Promise<boolean>;
    readOnly?: boolean;
    onClose?: () => void;
  }): void {
    act(() => {
      root.render(
        <GlossaryEntryEditorPane
          state={options.state}
          translate={translate}
          height={options.height ?? 280}
          availableTags={options.availableTags ?? []}
          onCreateEntry={
            options.onCreateEntry ??
            (() => Promise.resolve(savedEntryFixture()))
          }
          onLoadEntry={
            options.onLoadEntry ?? (() => new Promise(() => undefined))
          }
          onSaveEntry={
            options.onSaveEntry ??
            (() => Promise.reject(new Error("not used in this test")))
          }
          onDeleteEntry={
            options.onDeleteEntry ?? (() => Promise.resolve(false))
          }
          onOpenTagManager={() => undefined}
          readOnly={options.readOnly ?? false}
          markerGlyph="↓"
          expectedLineEnding="lf"
          newFileLineEndingFallback="lf"
          whitespaceSettings={{
            renderIdeographicSpace: false,
            renderAsciiSpace: false,
            renderTab: false,
            renderOtherUnicodeSpace: false
          }}
          undoHistoryMinDepth={100}
          onClose={options.onClose ?? (() => undefined)}
        />
      );
    });
  }

  function representativeInput(): HTMLInputElement {
    const input = container.querySelector<HTMLInputElement>(
      ".glossaryEditorAtomValue"
    );
    if (!input) {
      throw new Error("no representative atom input");
    }
    return input;
  }

  function setInputValue(input: HTMLInputElement, value: string): void {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function saveButton(): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      ".glossaryEntryEditorPaneSaveButton"
    );
    if (!button) {
      throw new Error("no save button");
    }
    return button;
  }

  function clickSave(): void {
    act(() => {
      saveButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("renders the create session seeded from presetRepresentative, no delete button, Save labeled 作成", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "織田信長"
      })
    });

    const pane = container.querySelector(".glossaryEntryEditorPane");
    expect(pane?.getAttribute("data-pane-mode")).toBe("create");
    expect(pane?.getAttribute("data-pane-source")).toBe("glossary-pane");
    expect(representativeInput().value).toBe("織田信長");
    expect(container.querySelector(".glossaryEditorDeleteButton")).toBeNull();
    expect(saveButton().textContent).toBe("作成");
    // #436 Slice 9: the retired create-only form no longer renders.
    expect(container.querySelector(".glossaryEntryForm")).toBeNull();
    expect(container.querySelector(".glossaryEditor")).not.toBeNull();
  });

  it("seeds the atom with 新しい語彙 for a preset-less side-pane open", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" })
    });
    expect(representativeInput().value).toBe("新しい語彙");
  });

  it("creates the entry on Save, stays open, and flips the session to edit (Save→保存, delete button appears)", async () => {
    const onCreateEntry = vi.fn(() => Promise.resolve(savedEntryFixture()));
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-settings" }),
      onCreateEntry,
      onClose
    });

    setInputValue(representativeInput(), "  徳川家康  ");
    clickSave();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledWith({
      description: "",
      atoms: [{ value: "徳川家康", matchFlags: 0 }],
      tagIds: []
    });
    // #436 Slice 9: create does NOT close the pane — it becomes an edit
    // session for the newly-created entry.
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton().textContent).toBe("保存");
    expect(container.querySelector(".glossaryEditorDeleteButton")).not.toBeNull();
  });

  it("shows an error and stays in create mode when create fails", async () => {
    const onCreateEntry = vi.fn(() => Promise.reject(new Error("boom")));
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "五右衛門"
      }),
      onCreateEntry,
      onClose
    });

    clickSave();
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCreateEntry).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      container.querySelector(".glossaryEntryEditorPaneSaveFailed")
        ?.textContent
    ).toBe("語彙を作成できませんでした。");
    // Still create mode — the draft was never actually persisted.
    expect(saveButton().textContent).toBe("作成");
  });

  it("prevents a double submit while a create is in flight", async () => {
    let resolveCreate: (entry: GlossaryEntry) => void = () => undefined;
    const onCreateEntry = vi.fn(
      () =>
        new Promise<GlossaryEntry>((resolve) => {
          resolveCreate = resolve;
        })
    );
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "半兵衛"
      }),
      onCreateEntry
    });

    clickSave();
    clickSave();
    clickSave();
    expect(onCreateEntry).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(true);

    await act(async () => {
      resolveCreate(savedEntryFixture());
      await Promise.resolve();
    });
  });

  it("disables Save and shows the validity message when the only atom is blanked out", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({
        source: "glossary-pane",
        presetRepresentative: "新しい語彙"
      })
    });

    setInputValue(representativeInput(), "   ");

    expect(saveButton().disabled).toBe(true);
    expect(
      container.querySelector(".glossaryEditorValidityMessage")?.textContent
    ).toBe("表記を1つ以上入力してください。");
  });

  it("delegates edit mode to GlossaryEntryEditorSession, which loads entryId and hosts the EXISTING GlossaryEditor (#436 Slice 8/9)", async () => {
    const onLoadEntry = vi.fn(() =>
      Promise.resolve({
        id: "entry-7",
        description: "",
        atoms: [
          {
            id: "atom-1",
            entryId: "entry-7",
            sortOrder: 0,
            value: "石田三成",
            matchFlags: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        tags: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
    );
    renderPane({
      state: openGlossaryEntryEditPane({
        source: "glossary-settings",
        entryId: "entry-7"
      }),
      onLoadEntry
    });

    expect(onLoadEntry).toHaveBeenCalledWith("entry-7");
    await act(async () => {
      await Promise.resolve();
    });

    // No create-only form ever rendered — the EXISTING GlossaryEditor, mode edit.
    expect(container.querySelector(".glossaryEntryForm")).toBeNull();
    expect(container.querySelector(".glossaryEditor")).not.toBeNull();
    expect(representativeInput().value).toBe("石田三成");
    expect(container.querySelector(".glossaryEditorDeleteButton")).not.toBeNull();
    expect(saveButton().textContent).toBe("保存");
  });

  it("applies the supplied height to the pane (Slice 6 remediation)", () => {
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" }),
      height: 320
    });
    const pane = container.querySelector<HTMLElement>(
      ".glossaryEntryEditorPane"
    );
    expect(pane?.style.height).toBe("320px");
  });

  it("invokes onClose from the header close control", () => {
    const onClose = vi.fn();
    renderPane({
      state: openGlossaryEntryCreatePane({ source: "glossary-pane" }),
      onClose
    });

    const closeButton = container.querySelector<HTMLButtonElement>(
      ".glossaryEntryEditorPaneCloseButton"
    );
    expect(closeButton?.textContent).toBe("閉じる");
    act(() => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
