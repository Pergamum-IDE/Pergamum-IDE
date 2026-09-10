// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { GlossaryEntryEditorPane } from "../../src/renderer/GlossaryEntryEditorPane";
import {
  DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE,
  closeGlossaryEntryEditorPane,
  createInitialGlossaryEntryEditorPaneState,
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

describe("GlossaryEntryEditorPane — Slice 2 debug UI (#436)", () => {
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

  function renderPane(
    state: OpenGlossaryEntryEditorPaneState,
    onClose: () => void = () => undefined
  ): void {
    act(() => {
      root.render(
        <GlossaryEntryEditorPane
          state={state}
          translate={translate}
          onClose={onClose}
        />
      );
    });
  }

  function field(name: string): string | undefined {
    return (
      container.querySelector(`[data-field="${name}"]`)?.textContent ??
      undefined
    );
  }

  it("shows mode / source / preset representative for a create-mode pane", () => {
    renderPane(
      openGlossaryEntryCreatePane({
        source: "developer"
      })
    );

    const pane = container.querySelector(".glossaryEntryEditorPane");
    expect(pane?.getAttribute("aria-label")).toBe("語彙登録・編集ペイン");
    expect(pane?.getAttribute("data-pane-mode")).toBe("create");
    expect(pane?.getAttribute("data-pane-source")).toBe("developer");
    expect(field("mode")).toBe("create");
    expect(field("source")).toBe("developer");
    expect(field("presetRepresentative")).toBe("新しい語彙");
    expect(field("entryId")).toBeUndefined();
  });

  it("shows mode / source / entry id for an edit-mode pane", () => {
    renderPane(
      openGlossaryEntryEditPane({
        source: "glossary-settings",
        entryId: "entry-7"
      })
    );

    expect(field("mode")).toBe("edit");
    expect(field("source")).toBe("glossary-settings");
    expect(field("entryId")).toBe("entry-7");
    expect(field("presetRepresentative")).toBeUndefined();
  });

  it("invokes onClose when the close control is clicked", () => {
    const onClose = vi.fn();
    renderPane(
      openGlossaryEntryCreatePane({
        source: "developer"
      }),
      onClose
    );

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
