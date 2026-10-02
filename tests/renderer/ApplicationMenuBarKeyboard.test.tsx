// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationMenuBar } from "../../src/renderer/ApplicationMenuBar";
import type { RendererMenuInvokeTarget } from "../../src/renderer/applicationMenuProjection";
import { editorCommandIds } from "../../src/shared/commandIds";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import type { AppPlatform } from "../../src/shared/platform";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const translateFor =
  (language: Language): Translate =>
  (key, values) =>
    t(language, key, values);

let container: HTMLDivElement;
let root: Root;
let editor: HTMLInputElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  editor = document.createElement("input");
  editor.id = "editor";
  document.body.appendChild(editor);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  editor.remove();
  document.body.innerHTML = "";
});

type Props = Partial<React.ComponentProps<typeof ApplicationMenuBar>> & {
  platform?: AppPlatform;
  language?: Language;
};

function mount(props: Props = {}): void {
  act(() => {
    root.render(
      <ApplicationMenuBar
        platform={props.platform ?? "windows"}
        translate={translateFor(props.language ?? "en")}
        onInvoke={props.onInvoke}
        isDisabled={props.isDisabled}
        isKeyboardBlocked={props.isKeyboardBlocked}
        isImeComposing={props.isImeComposing}
      />
    );
  });
}

function key(
  type: "keydown" | "keyup",
  keyName: string,
  init: KeyboardEventInit & { altGraph?: boolean } = {}
): KeyboardEvent {
  const { altGraph = false, ...eventInit } = init;
  const event = new KeyboardEvent(type, {
    key: keyName,
    altKey: keyName === "Alt" || eventInit.altKey,
    bubbles: true,
    cancelable: true,
    ...eventInit
  });
  // happy-dom reports AltGraph whenever Alt is down; a real browser only does
  // for AltGr. Model the real behavior (AltGr = the `altGraph` flag).
  Object.defineProperty(event, "getModifierState", {
    value: (name: string) =>
      name === "AltGraph" ? altGraph : name === "Alt" ? event.altKey : false
  });

  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });

  return event;
}

const press = (
  keyName: string,
  init: KeyboardEventInit & { altGraph?: boolean } = {}
) =>
  key("keydown", keyName, init);
const altTap = () => {
  press("Alt");
  return key("keyup", "Alt");
};

const focused = (): HTMLElement | null => document.activeElement as HTMLElement | null;
const focusedKey = (): string | undefined => focused()?.dataset.menuKey;
const popups = () => container.querySelectorAll(".applicationMenuPopup");
const labelOf = (element: Element | null) =>
  element?.querySelector(":scope > .applicationMenuItemLabel")?.textContent ??
  element?.textContent;

/** ArrowDown until the focused item has this label (bounded: never loops forever). */
function arrowDownTo(label: string): void {
  for (let guard = 0; guard < 40; guard += 1) {
    if (labelOf(focused()) === label) {
      return;
    }
    press("ArrowDown");
  }
  throw new Error(`never reached "${label}"; focused: ${labelOf(focused())}`);
}

function focusEditor(): void {
  act(() => editor.focus());
  expect(document.activeElement).toBe(editor);
}

describe("keyboard operation of the Renderer menu (#665)", () => {
  it("bare Alt focuses File (popup closed); a second tap returns to the editor", () => {
    mount();
    focusEditor();

    const keyup = altTap();

    expect(focusedKey()).toBe("0");
    expect(labelOf(focused())).toBe("File");
    expect(popups()).toHaveLength(0);
    // The bare Alt tap must not reach the OS menu activation.
    expect(keyup.defaultPrevented).toBe(true);

    altTap();
    expect(document.activeElement).toBe(editor);
    expect(container.querySelector('[data-focused="true"]')).toBeNull();
  });

  it("Alt+F opens File and focuses its first item; Alt+mnemonic works for ja too", () => {
    mount({ language: "ja" });
    focusEditor();

    const event = press("a", { altKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(popups()).toHaveLength(1);
    expect(labelOf(container.querySelector('[aria-expanded="true"]'))).toBe(
      "アシスト(A)"
    );
    expect(focused()?.getAttribute("role")).toBe("menuitem");
    expect(focusedKey()).toBe("3/0");
  });

  it("(Alt, release,) then a letter opens the menu", () => {
    mount();
    focusEditor();

    altTap();
    press("v");

    expect(popups()).toHaveLength(1);
    expect(focusedKey()).toBe("2/0");
  });

  it("Left / Right / Home / End move between top-level menus (wrapping)", () => {
    mount();
    focusEditor();
    altTap();

    press("ArrowRight");
    expect(focusedKey()).toBe("1");
    press("End");
    expect(focusedKey()).toBe("4");
    press("ArrowRight");
    expect(focusedKey()).toBe("0");
    press("ArrowLeft");
    expect(focusedKey()).toBe("4");
    press("Home");
    expect(focusedKey()).toBe("0");
  });

  it("Down opens the menu; Up / Down move, skipping separators and disabled items", () => {
    mount({ isDisabled: (id) => id === editorCommandIds.newFile });
    focusEditor();
    altTap();
    press("ArrowDown");

    const visited: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      visited.push(labelOf(focused()) ?? "");
      press("ArrowDown");
    }

    expect(visited).not.toContain("New File");
    expect(visited).not.toContain("");
    expect(visited).toContain("Save");
    // Wrapped around: the first item appears again.
    expect(visited.filter((label) => label === visited[0]).length).toBeGreaterThan(1);
    // No focus ever rests on a separator or a disabled item.
    expect(
      Array.from(container.querySelectorAll('[role="separator"]')).includes(focused() as Element)
    ).toBe(false);
  });

  it("Right / Enter open the Import submenu, Left returns, Escape climbs the staircase", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    arrowDownTo("Import");

    press("ArrowRight");
    expect(popups()).toHaveLength(2);
    expect(labelOf(focused())).toBe("Bulk Import Text Files...");

    press("ArrowLeft");
    expect(popups()).toHaveLength(1);
    expect(labelOf(focused())).toBe("Import");

    press("Enter");
    expect(popups()).toHaveLength(2);

    // Escape #1: child -> Import item
    press("Escape");
    expect(popups()).toHaveLength(1);
    expect(labelOf(focused())).toBe("Import");
    // Escape #2: root popup -> File top-level
    press("Escape");
    expect(popups()).toHaveLength(0);
    expect(focusedKey()).toBe("0");
    // Escape #3: leave to the original focus owner
    press("Escape");
    expect(document.activeElement).toBe(editor);
  });

  it("Tab is not trapped: it leaves the menu, restores focus and is not consumed", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    const tab = press("Tab");

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(editor);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe("focus order of keyboard activation (#665)", () => {
  it("restores the original focus owner BEFORE onInvoke runs", () => {
    const order: string[] = [];
    const onInvoke = vi.fn((target: RendererMenuInvokeTarget) => {
      order.push(
        document.activeElement === editor ? "editor-focused" : "other-focused"
      );
      order.push(target.type === "command" ? target.commandId : target.role);
    });
    mount({ onInvoke });
    focusEditor();
    press("e", { altKey: true });

    arrowDownTo("Copy");
    press("Enter");

    expect(onInvoke).toHaveBeenCalledTimes(1);
    // The editor already owned focus when the native role was invoked.
    expect(order).toEqual(["editor-focused", "copy"]);
    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(editor);
  });

  it("Space activates like Enter", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke });
    focusEditor();
    press("f", { altKey: true });
    arrowDownTo("Save");

    press(" ");

    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(onInvoke.mock.calls[0][0]).toMatchObject({
      type: "command",
      commandId: editorCommandIds.saveDocument
    });
  });

  it("a command that opens a new surface keeps focus: no delayed restore steals it", async () => {
    vi.useFakeTimers();
    try {
      const palette = document.createElement("input");
      document.body.appendChild(palette);
      mount({
        onInvoke: () => {
          // What a command opening a dialog / palette does.
          palette.focus();
        }
      });
      focusEditor();
      press("f", { altKey: true });
      press("Enter");

      expect(document.activeElement).toBe(palette);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(document.activeElement).toBe(palette);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a disabled item is never activated by the keyboard", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke, isDisabled: (id) => id === editorCommandIds.saveDocument });
    focusEditor();
    press("f", { altKey: true });

    for (let index = 0; index < 20; index += 1) {
      expect(labelOf(focused())).not.toBe("Save");
      press("ArrowDown");
    }
    expect(onInvoke).not.toHaveBeenCalled();
  });
});

describe("close reasons and focus policy (#665)", () => {
  it("outside pointer click: closes without restoring the editor", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);

    act(() => {
      elsewhere.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).not.toBe(editor);
  });

  it("window blur: closes without restoring", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).not.toBe(editor);
  });

  it("a modal taking over closes the menu and does NOT take focus back", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });
    expect(popups()).toHaveLength(1);

    const paletteInput = document.createElement("input");
    document.body.appendChild(paletteInput);
    act(() => {
      root.render(
        <ApplicationMenuBar
          platform="windows"
          translate={translateFor("en")}
          isKeyboardBlocked={true}
        />
      );
      paletteInput.focus();
    });

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(paletteInput);
  });

  it("Alt / Alt+F do nothing behind a modal", () => {
    mount({ isKeyboardBlocked: true });
    focusEditor();

    altTap();
    press("f", { altKey: true });

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(editor);
  });

  it("does not activate during IME composition", () => {
    mount({ isImeComposing: () => true });
    focusEditor();

    altTap();
    press("f", { altKey: true });
    press("Escape");

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(editor);

    // Per-event signals too.
    mount({});
    press("f", { altKey: true, isComposing: true });
    expect(popups()).toHaveLength(0);
  });

  it("AltGr / Ctrl+Alt + letter never open a menu", () => {
    mount();
    focusEditor();

    press("f", { altKey: true, ctrlKey: true });
    // A real AltGr press: the browser reports the AltGraph modifier.
    press("f", { altKey: true, ctrlKey: true, altGraph: true });
    press("f", { altKey: true, altGraph: true });

    expect(popups()).toHaveLength(0);
    expect(document.activeElement).toBe(editor);
  });
});

describe("accelerators while the menu is open (#665)", () => {
  it.each([
    ["F1", {}],
    ["p", { ctrlKey: true }],
    ["s", { ctrlKey: true }],
    ["w", { ctrlKey: true }],
    [",", { ctrlKey: true }]
  ] as const)(
    "%s: closes the menu, restores the editor and leaves the event to the existing accelerator",
    (keyName, init) => {
      const onInvoke = vi.fn();
      mount({ onInvoke });
      focusEditor();
      press("f", { altKey: true });

      const event = press(keyName, init);

      expect(popups()).toHaveLength(0);
      expect(document.activeElement).toBe(editor);
      expect(event.defaultPrevented).toBe(false);
      // The menu itself runs nothing: no duplicate execution.
      expect(onInvoke).not.toHaveBeenCalled();
    }
  );

  it("Escape is consumed by the menu (it must not also reach the editor)", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    expect(press("Escape").defaultPrevented).toBe(true);
  });
});

describe("accessibility (#665)", () => {
  it("exposes menubar / menu / menuitem / separator with expanded, haspopup and disabled states", () => {
    mount({ isDisabled: (id) => id === editorCommandIds.saveDocument });
    focusEditor();

    expect(container.querySelector('[role="menubar"]')).not.toBeNull();
    const triggers = Array.from(container.querySelectorAll(".applicationMenuBarItem"));
    expect(triggers).toHaveLength(5);
    for (const trigger of triggers) {
      expect(trigger.getAttribute("role")).toBe("menuitem");
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    }

    press("f", { altKey: true });

    expect(triggers[0].getAttribute("aria-expanded")).toBe("true");
    expect(triggers[1].getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="menu"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="separator"]').length).toBeGreaterThan(2);

    const submenu = Array.from(
      container.querySelectorAll<HTMLElement>('[role="menuitem"][aria-haspopup="menu"]')
    ).find((element) => labelOf(element) === "Import")!;
    expect(submenu.getAttribute("aria-expanded")).toBe("false");

    const save = Array.from(container.querySelectorAll<HTMLElement>(".applicationMenuItem")).find(
      (element) => labelOf(element) === "Save"
    )!;
    expect(save.getAttribute("aria-disabled")).toBe("true");
  });

  it("the keyboard focus state and the DOM focus agree", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    for (let index = 0; index < 5; index += 1) {
      const marked = container.querySelectorAll('[data-focused="true"]');

      expect(marked).toHaveLength(1);
      expect(marked[0]).toBe(document.activeElement);
      press("ArrowDown");
    }
  });

  it("menu items are never in the Tab order (tabindex -1), also while inactive", () => {
    mount();
    focusEditor();

    for (const element of Array.from(container.querySelectorAll("[role=menuitem]"))) {
      expect(element.getAttribute("tabindex")).toBe("-1");
    }
    press("f", { altKey: true });
    for (const element of Array.from(container.querySelectorAll("[role=menuitem]"))) {
      expect(element.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("draws the mnemonic as text only (no underline element or style)", () => {
    mount({ language: "ja" });

    for (const trigger of Array.from(container.querySelectorAll(".applicationMenuBarItem"))) {
      expect(trigger.querySelector("u, ins, [style*='underline']")).toBeNull();
    }
  });
});

describe("macOS boundary (#665)", () => {
  it("renders nothing and no Alt / mnemonic behavior is active", () => {
    mount({ platform: "macos" });
    focusEditor();

    expect(container.innerHTML).toBe("");

    altTap();
    press("f", { altKey: true });

    expect(document.activeElement).toBe(editor);
    expect(container.innerHTML).toBe("");
  });

  it("does not register any window listener on macOS", () => {
    const add = vi.spyOn(window, "addEventListener");
    try {
      mount({ platform: "macos" });
      const registered = add.mock.calls.map(([type]) => type);

      expect(registered).not.toContain("keydown");
      expect(registered).not.toContain("keyup");
    } finally {
      add.mockRestore();
    }
  });
});

describe("mouse coexistence (#665)", () => {
  const click = (element: Element) =>
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  const hover = (element: Element) =>
    act(() => {
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

  it("a mouse-opened menu does not move DOM focus off the editor", () => {
    mount();
    focusEditor();

    click(container.querySelector(".applicationMenuBarItem")!);

    expect(popups()).toHaveLength(1);
    expect(document.activeElement).toBe(editor);
  });

  it("a mouse click on an item restores nothing odd and invokes once", () => {
    const onInvoke = vi.fn();
    mount({ onInvoke });
    focusEditor();
    click(container.querySelector(".applicationMenuBarItem")!);

    const save = Array.from(container.querySelectorAll<HTMLElement>(".applicationMenuItem")).find(
      (element) => labelOf(element) === "Save"
    )!;
    click(save);

    expect(onInvoke).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(editor);
  });

  it("in keyboard mode, hovering with the mouse keeps keyboard focus on the hovered item", () => {
    mount();
    focusEditor();
    press("f", { altKey: true });

    const target = Array.from(container.querySelectorAll<HTMLElement>(".applicationMenuItem")).find(
      (element) => labelOf(element) === "Save"
    )!;
    hover(target);

    expect(document.activeElement).toBe(target);
  });
});
