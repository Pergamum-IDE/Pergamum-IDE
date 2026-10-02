// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditContextMenu } from "../../src/renderer/EditContextMenu";
import { editorCommandIds, type EditCommandId } from "../../src/shared/commandIds";
import { editContextMenuItems } from "../../src/shared/editContextMenu";
import { t } from "../../src/shared/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const enabledByCommand: Record<string, boolean> = {
  [editorCommandIds.cutSelection]: false,
  [editorCommandIds.copySelection]: true,
  [editorCommandIds.pasteSelection]: true,
  [editorCommandIds.selectAllSelection]: true
};

// Cut is disabled but still carries its binding; Copy is unbound.
const shortcutByCommand: Record<string, string | undefined> = {
  [editorCommandIds.cutSelection]: "Ctrl+X",
  [editorCommandIds.copySelection]: undefined,
  [editorCommandIds.pasteSelection]: "Ctrl+V",
  [editorCommandIds.selectAllSelection]: "Ctrl+A"
};

describe("EditContextMenu (#685)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSelect: ReturnType<typeof vi.fn<(commandId: EditCommandId) => void>>;
  let onClose: ReturnType<typeof vi.fn<() => void>>;

  function render(x = 40, y = 50): void {
    act(() => {
      root.render(
        <EditContextMenu
          x={x}
          y={y}
          ariaLabel="Edit actions"
          items={editContextMenuItems.map((item) => ({
            commandId: item.commandId,
            label: t("en", item.labelKey),
            enabled: enabledByCommand[item.commandId],
            shortcut: shortcutByCommand[item.commandId]
          }))}
          onSelect={onSelect}
          onClose={onClose}
        />
      );
    });
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    );
  }

  function press(key: string, init: KeyboardEventInit = {}): void {
    act(() => {
      (document.activeElement ?? container).dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...init
        })
      );
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onSelect = vi.fn();
    onClose = vi.fn();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1000
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 800
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders a menu with Cut / Copy / Paste / Select All in order", () => {
    render();

    expect(
      container.querySelector('[role="menu"]')?.getAttribute("aria-label")
    ).toBe("Edit actions");
    expect(
      buttons().map(
        (button) => button.querySelector(".contextMenuItemLabel")?.textContent
      )
    ).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select All"
    ]);
    expect(buttons().map((button) => button.disabled)).toEqual([
      true,
      false,
      false,
      false
    ]);
  });

  it("renders the shortcut column aria-hidden, keeps it on disabled items and omits it when unbound", () => {
    render();

    const shortcuts = buttons().map(
      (button) =>
        button.querySelector(".contextMenuItemShortcut")?.textContent ?? null
    );
    expect(shortcuts).toEqual(["Ctrl+X", null, "Ctrl+V", "Ctrl+A"]);
    expect(buttons()[0].disabled).toBe(true);
    expect(
      buttons()[0]
        .querySelector(".contextMenuItemShortcut")
        ?.getAttribute("aria-hidden")
    ).toBe("true");
    expect(
      buttons().map(
        (button) => button.querySelector(".contextMenuItemLabel")?.textContent
      )
    ).toEqual(["Cut", "Copy", "Paste", "Select All"]);
  });

  it("focuses the first enabled item on open", () => {
    render();

    expect(document.activeElement).toBe(buttons()[1]);
  });

  it("moves focus with ArrowDown / ArrowUp / Home / End, skipping disabled items", () => {
    render();

    press("ArrowDown");
    expect(document.activeElement).toBe(buttons()[2]);
    press("ArrowDown");
    expect(document.activeElement).toBe(buttons()[3]);
    press("ArrowDown");
    expect(document.activeElement).toBe(buttons()[1]);
    press("ArrowUp");
    expect(document.activeElement).toBe(buttons()[3]);
    press("Home");
    expect(document.activeElement).toBe(buttons()[1]);
    press("End");
    expect(document.activeElement).toBe(buttons()[3]);
  });

  it("closes on Escape and Tab", () => {
    render();

    press("Escape");
    press("Tab");

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not react to keys while an IME composition is active", () => {
    render();

    press("Escape", { isComposing: true });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("selects the clicked enabled item and ignores disabled ones", () => {
    render();

    act(() => buttons()[0].click());
    expect(onSelect).not.toHaveBeenCalled();

    act(() => buttons()[2].click());
    expect(onSelect).toHaveBeenCalledWith(editorCommandIds.pasteSelection);
  });

  it("closes on outside (backdrop) click but not on menu click", () => {
    render();

    act(() => {
      container
        .querySelector<HTMLElement>(".editContextMenu")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLElement>(".editContextMenuBackdrop")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clamps the position to the viewport edge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 160,
      height: 120,
      top: 0,
      left: 0,
      right: 160,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });

    render(990, 790);

    const style = container.querySelector<HTMLElement>(".editContextMenu")!
      .style;
    expect(style.getPropertyValue("--edit-context-menu-x")).toBe("832px");
    expect(style.getPropertyValue("--edit-context-menu-y")).toBe("672px");
  });
});
