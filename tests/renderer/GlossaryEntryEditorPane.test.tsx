// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import { GlossaryEntryEditorPane } from "../../src/renderer/GlossaryEntryEditorPane";
import {
  closeGlossaryEntryEditorPane,
  createInitialGlossaryEntryEditorPaneState,
  openGlossaryEntryEditorPane,
  toggleGlossaryEntryEditorPane
} from "../../src/renderer/glossaryEntryEditorPaneState";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translate: Translate = (key, values) => t("ja", key, values);

describe("glossaryEntryEditorPaneState (#436 Slice 1)", () => {
  it("starts closed", () => {
    expect(createInitialGlossaryEntryEditorPaneState()).toEqual({
      isOpen: false
    });
  });

  it("opens with the mode and the later-slice payload fields", () => {
    expect(
      openGlossaryEntryEditorPane({
        mode: "edit",
        entryId: "e1",
        presetRepresentative: "シズク"
      })
    ).toEqual({
      isOpen: true,
      mode: "edit",
      entryId: "e1",
      presetRepresentative: "シズク"
    });
  });

  it("toggles closed -> open -> closed", () => {
    const opened = toggleGlossaryEntryEditorPane(
      createInitialGlossaryEntryEditorPaneState(),
      { mode: "create" }
    );
    expect(opened.isOpen).toBe(true);

    const closed = toggleGlossaryEntryEditorPane(opened, { mode: "create" });
    expect(closed).toEqual({ isOpen: false });
  });

  it("close always returns the closed state", () => {
    expect(closeGlossaryEntryEditorPane()).toEqual({ isOpen: false });
  });
});

describe("GlossaryEntryEditorPane (#436 Slice 1)", () => {
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

  it("renders the pane frame, title and PoC notice while open", () => {
    act(() => {
      root.render(
        <GlossaryEntryEditorPane
          mode="create"
          translate={translate}
          onClose={() => undefined}
        />
      );
    });

    const pane = container.querySelector(".glossaryEntryEditorPane");
    expect(pane).not.toBeNull();
    expect(pane?.getAttribute("aria-label")).toBe("語彙登録・編集ペイン");
    expect(
      container.querySelector(".glossaryEntryEditorPaneTitle")?.textContent
    ).toBe("語彙登録・編集ペイン");
    expect(
      container.querySelector(".glossaryEntryEditorPaneNotice")?.textContent
    ).toBe("このペインは #436 PoC で導入中です。");
  });

  it("invokes onClose when the close control is clicked", () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        <GlossaryEntryEditorPane
          mode="create"
          translate={translate}
          onClose={onClose}
        />
      );
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
