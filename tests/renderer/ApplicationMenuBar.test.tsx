// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import type { AppPlatform } from "../../src/shared/platform";
import { editorCommandIds } from "../../src/shared/commandIds";
import { ApplicationMenuBar } from "../../src/renderer/ApplicationMenuBar";
import type { RendererMenuInvokeTarget } from "../../src/renderer/applicationMenuProjection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translateFor =
  (language: Language): Translate =>
  (key, values) =>
    t(language, key, values);

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

function mount(
  props: {
    platform?: AppPlatform;
    language?: Language;
    onInvoke?: (target: RendererMenuInvokeTarget) => void;
    getShortcutLabel?: (commandId: string) => string | undefined;
    isDisabled?: (commandId: string) => boolean;
  } = {}
): void {
  const translate = translateFor(props.language ?? "en");
  act(() => {
    root.render(
      <ApplicationMenuBar
        platform={props.platform ?? "windows"}
        translate={translate}
        onInvoke={props.onInvoke}
        getShortcutLabel={props.getShortcutLabel}
        isDisabled={props.isDisabled}
      />
    );
  });
}

const triggers = (): HTMLButtonElement[] =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(".applicationMenuBarItem")
  );
const trigger = (label: string): HTMLButtonElement =>
  triggers().find((button) => button.textContent === label)!;
const popups = (): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(".applicationMenuPopup"));
const menuItem = (label: string): HTMLElement =>
  Array.from(
    container.querySelectorAll<HTMLElement>(".applicationMenuItem")
  ).find(
    (item) =>
      item.querySelector(":scope > .applicationMenuItemLabel")?.textContent ===
      label
  )!;

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function hover(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function pressEscape(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
  });
}

describe("ApplicationMenuBar structure (#663)", () => {
  it.each(["windows", "linux"] as const)("is rendered on %s", (platform) => {
    mount({ platform });

    expect(container.querySelector('[role="menubar"]')).not.toBeNull();
  });

  it.each(["macos", "other"] as const)("renders nothing on %s", (platform) => {
    mount({ platform });

    expect(container.querySelector(".applicationMenuBar")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("lists the top-level menus in canonical model order, popups closed", () => {
    mount();

    expect(triggers().map((button) => button.textContent)).toEqual([
      "File",
      "Edit",
      "View",
      "Assist",
      "Help"
    ]);
    expect(popups()).toHaveLength(0);
  });

  it("renders translated labels for ja", () => {
    mount({ language: "ja" });

    expect(triggers().map((button) => button.textContent)).toEqual([
      "ファイル",
      "編集",
      "表示",
      "支援",
      "ヘルプ"
    ]);
  });

  it("renders menu items, separators and a submenu chevron from the model", () => {
    mount();
    click(trigger("File"));

    expect(popups()).toHaveLength(1);
    expect(menuItem("New File")).toBeTruthy();
    expect(
      popups()[0].querySelectorAll('[role="separator"]').length
    ).toBeGreaterThan(2);
    expect(
      menuItem("Import").querySelector(".applicationMenuItemChevron")
    ).not.toBeNull();
  });

  it("shows no shortcut label and nothing disabled by default", () => {
    mount();
    click(trigger("File"));

    expect(container.querySelector(".applicationMenuItemShortcut")).toBeNull();
    expect(container.querySelector('[data-disabled="true"]')).toBeNull();
  });

  it("shows injected shortcut labels and disabled state", () => {
    mount({
      getShortcutLabel: (id) =>
        id === editorCommandIds.saveDocument ? "Ctrl+S" : undefined,
      isDisabled: (id) => id === editorCommandIds.saveAll
    });
    click(trigger("File"));

    expect(
      menuItem("Save").querySelector(".applicationMenuItemShortcut")
        ?.textContent
    ).toBe("Ctrl+S");
    expect(menuItem("Save All").getAttribute("aria-disabled")).toBe("true");
  });
});

describe("ApplicationMenuBar interaction (#663)", () => {
  it("opens a top-level popup on click and closes it on the same click again", () => {
    mount();

    click(trigger("File"));
    expect(popups()).toHaveLength(1);
    expect(trigger("File").getAttribute("aria-expanded")).toBe("true");

    click(trigger("File"));
    expect(popups()).toHaveLength(0);
    expect(trigger("File").getAttribute("aria-expanded")).toBe("false");
  });

  it("switches menus on hover only while a menu is open", () => {
    mount();

    hover(trigger("Edit"));
    expect(popups()).toHaveLength(0);

    click(trigger("File"));
    hover(trigger("View"));

    expect(popups()).toHaveLength(1);
    expect(trigger("View").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("File").getAttribute("aria-expanded")).toBe("false");
    expect(menuItem("Command Palette...")).toBeTruthy();
  });

  it("closes on an outside mousedown but not on a mousedown inside the menu", () => {
    mount();
    click(trigger("File"));

    act(() => {
      menuItem("New File").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    expect(popups()).toHaveLength(1);

    act(() => {
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    expect(popups()).toHaveLength(0);
  });

  it("closes on Escape", () => {
    mount();
    click(trigger("File"));

    pressEscape();

    expect(popups()).toHaveLength(0);
  });

  it("ignores Escape while no menu is open", () => {
    mount();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("opens the nested Import submenu on hover and on click", () => {
    mount();
    click(trigger("File"));
    expect(popups()).toHaveLength(1);

    hover(menuItem("Import"));
    expect(popups()).toHaveLength(2);
    expect(menuItem("Import").getAttribute("aria-expanded")).toBe("true");

    // Hovering a plain sibling closes it again; a click opens it.
    hover(menuItem("New File"));
    expect(popups()).toHaveLength(1);
    click(menuItem("Import"));
    expect(popups()).toHaveLength(2);
  });

  it("calls onInvoke once with the command target and closes the menu", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke });
    click(trigger("File"));

    click(menuItem("Save"));

    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(onInvoke).toHaveBeenCalledWith({
      type: "command",
      commandId: editorCommandIds.saveDocument
    });
    expect(popups()).toHaveLength(0);
  });

  it("calls onInvoke once for an item in a nested submenu", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke });
    click(trigger("File"));
    hover(menuItem("Import"));

    click(menuItem("Bulk Import Text Files..."));

    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(onInvoke.mock.calls[0][0]).toMatchObject({ type: "command" });
    expect(popups()).toHaveLength(0);
  });

  it("hands native-role items to onInvoke as role targets", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke });
    click(trigger("Edit"));

    click(menuItem("Copy"));

    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(onInvoke).toHaveBeenCalledWith({
      type: "nativeRole",
      role: "copy",
      commandId: editorCommandIds.copySelection
    });
  });

  it("does not call onInvoke for a disabled item and keeps the menu open", () => {
    const onInvoke = vi.fn();
    mount({
      onInvoke,
      isDisabled: (id) => id === editorCommandIds.saveDocument
    });
    click(trigger("File"));

    click(menuItem("Save"));

    expect(onInvoke).not.toHaveBeenCalled();
    expect(popups()).toHaveLength(1);
  });

  it("hangs a top-level popup from the trigger's left edge and the bar's bottom edge (real DOMRects)", () => {
    // Regression: a DOMRect's fields are prototype getters, so spreading one
    // loses them. Use genuine DOMRect instances like the browser does.
    const spy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains("applicationMenuBar")) {
          return new DOMRect(0, 0, 600, 28);
        }
        if (this.classList.contains("applicationMenuBarItem")) {
          return new DOMRect(10, 2, 60, 23);
        }
        return new DOMRect(0, 0, 0, 0);
      });

    try {
      mount();
      click(trigger("File"));

      expect(popups()[0].style.left).toBe("10px");
      expect(popups()[0].style.top).toBe("28px");
    } finally {
      spy.mockRestore();
    }
  });

  it("does not steal editor focus on mousedown", () => {
    mount();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });

    act(() => {
      trigger("File").dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("works without an onInvoke callback", () => {
    mount();
    click(trigger("File"));

    expect(() => click(menuItem("Save"))).not.toThrow();
    expect(popups()).toHaveLength(0);
  });
});
