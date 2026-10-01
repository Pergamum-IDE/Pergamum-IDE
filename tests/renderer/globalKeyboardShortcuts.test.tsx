// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesGlobalKeyboardShortcut,
  useGlobalKeyboardShortcuts,
  type GlobalKeyboardShortcut
} from "../../src/renderer/globalKeyboardShortcuts";
import { rendererShortcutCommandIds } from "../../src/renderer/keybindings/rendererShortcuts";
import { stubRuntimePlatform } from "./helpers/runtimePlatform";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function keydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

function plain(
  key: string,
  modifiers: Partial<
    Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>
  > = {}
) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers
  };
}

const FILE_MODE = rendererShortcutCommandIds.commandPaletteFile; // Mod-o
const HEADING = rendererShortcutCommandIds.commandPaletteHeading; // Mod-#
const GLOSSARY = rendererShortcutCommandIds.commandPaletteGlossary; // Mod-@
const PROJECT_SEARCH = rendererShortcutCommandIds.commandPaletteProjectSearch; // Mod-%
const TOGGLE_FILES = rendererShortcutCommandIds.toggleFiles; // Mod-Shift-e

describe("matchesGlobalKeyboardShortcut (catalog-derived, #643)", () => {
  it("matches Ctrl+O on win32 / linux and Cmd+O on darwin", () => {
    for (const platform of ["win32", "linux"] as const) {
      expect(
        matchesGlobalKeyboardShortcut(plain("o", { ctrlKey: true }), FILE_MODE, platform)
      ).toBe(true);
    }
    expect(
      matchesGlobalKeyboardShortcut(plain("o", { metaKey: true }), FILE_MODE, "darwin")
    ).toBe(true);
  });

  it("does not treat Ctrl+O as Mod on darwin, nor Cmd+O on win32 / linux (#636)", () => {
    const ctrlO = plain("o", { ctrlKey: true });
    const cmdO = plain("o", { metaKey: true });
    expect(matchesGlobalKeyboardShortcut(ctrlO, FILE_MODE, "darwin")).toBe(false);
    expect(matchesGlobalKeyboardShortcut(cmdO, FILE_MODE, "win32")).toBe(false);
    expect(matchesGlobalKeyboardShortcut(cmdO, FILE_MODE, "linux")).toBe(false);
    expect(
      matchesGlobalKeyboardShortcut(
        plain("o", { ctrlKey: true, metaKey: true }),
        FILE_MODE,
        "darwin"
      )
    ).toBe(false);
  });

  it("is case-insensitive on letter keys (logical key, as before)", () => {
    expect(
      matchesGlobalKeyboardShortcut(plain("O", { ctrlKey: true }), FILE_MODE, "win32")
    ).toBe(true);
  });

  it("rejects an unexpected modifier, a missing modifier, and a different key", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        plain("o", { ctrlKey: true, shiftKey: true }),
        FILE_MODE,
        "win32"
      )
    ).toBe(false);
    expect(matchesGlobalKeyboardShortcut(plain("o"), FILE_MODE, "win32")).toBe(false);
    expect(
      matchesGlobalKeyboardShortcut(plain("p", { ctrlKey: true }), FILE_MODE, "win32")
    ).toBe(false);
  });

  it("requires exact Shift for Shift bindings (Mod-Shift-e)", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        plain("E", { ctrlKey: true, shiftKey: true }),
        TOGGLE_FILES,
        "win32"
      )
    ).toBe(true);
    expect(
      matchesGlobalKeyboardShortcut(plain("e", { ctrlKey: true }), TOGGLE_FILES, "win32")
    ).toBe(false);
  });

  // #556: symbol shortcuts (#, @, :, %) match on `event.key` alone, ignoring
  // which modifiers produced that character.
  describe("symbol keys (#556)", () => {
    it("matches Ctrl+# even though # is typed with Shift held", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          plain("#", { ctrlKey: true, shiftKey: true }),
          HEADING,
          "win32"
        )
      ).toBe(true);
    });

    it("matches Ctrl+@ when @ is typed without Shift", () => {
      expect(
        matchesGlobalKeyboardShortcut(plain("@", { ctrlKey: true }), GLOSSARY, "win32")
      ).toBe(true);
    });

    it("does not use event.code as a physical-key fallback", () => {
      const ctrlShift3 = {
        ...plain("3", { ctrlKey: true, shiftKey: true }),
        code: "Digit3"
      };
      expect(matchesGlobalKeyboardShortcut(ctrlShift3, HEADING, "win32")).toBe(false);
    });

    it("still requires Mod", () => {
      expect(
        matchesGlobalKeyboardShortcut(plain("#", { shiftKey: true }), HEADING, "win32")
      ).toBe(false);
    });

    it("darwin has no # / % binding (catalog key is null): nothing matches", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          plain("#", { metaKey: true, shiftKey: true }),
          HEADING,
          "darwin"
        )
      ).toBe(false);
      expect(
        matchesGlobalKeyboardShortcut(
          plain("%", { metaKey: true, shiftKey: true }),
          PROJECT_SEARCH,
          "darwin"
        )
      ).toBe(false);
      expect(
        matchesGlobalKeyboardShortcut(
          plain("%", { ctrlKey: true, shiftKey: true }),
          PROJECT_SEARCH,
          "linux"
        )
      ).toBe(true);
    });
  });

  // #556: AltGr is reported as synthetic ctrlKey+altKey; a Mod shortcut must
  // not misfire when the user types that character via AltGr.
  describe("AltGr guard (#556)", () => {
    it("does not match when getModifierState reports AltGraph", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          {
            ...plain("@", { ctrlKey: true, altKey: true }),
            getModifierState: (key: string) => key === "AltGraph"
          },
          GLOSSARY,
          "win32"
        )
      ).toBe(false);
    });

    it("still matches a real Ctrl chord when getModifierState reports no AltGraph", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          { ...plain("@", { ctrlKey: true }), getModifierState: () => false },
          GLOSSARY,
          "win32"
        )
      ).toBe(true);
    });
  });

  it("never matches during an IME composition", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { ...plain("o", { ctrlKey: true }), isComposing: true },
        FILE_MODE,
        "win32"
      )
    ).toBe(false);
  });
});

describe("useGlobalKeyboardShortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;
  let restorePlatform: (() => void) | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    restorePlatform?.();
    restorePlatform = null;
    vi.restoreAllMocks();
  });

  function Harness({ shortcuts }: { shortcuts: GlobalKeyboardShortcut[] }) {
    useGlobalKeyboardShortcuts(shortcuts);
    return null;
  }

  function render(shortcuts: GlobalKeyboardShortcut[]) {
    act(() => {
      root.render(<Harness shortcuts={shortcuts} />);
    });
  }

  it("invokes the handler when the shortcut is pressed anywhere in the document", () => {
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire while an editable text input has focus", () => {
    // Appended to `document.body` directly, NOT `container` — `createRoot`
    // takes ownership of `container`'s children on render.
    const handler = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      input.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not fire while a modal dialog is open", () => {
    const handler = vi.fn();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("ignores events that were already default-prevented", () => {
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    const event = keydown({ key: "o", ctrlKey: true });
    event.preventDefault();
    act(() => {
      window.dispatchEvent(event);
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("is suppressed during IME composition", () => {
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true, isComposing: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("consumes the event when it fires", () => {
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    const event = keydown({ key: "o", ctrlKey: true });
    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not register a binding where the catalog key is null (darwin # / %)", () => {
    restorePlatform = stubRuntimePlatform("macos");
    const heading = vi.fn();
    const search = vi.fn();
    render([
      { id: "h", commandId: HEADING, handler: heading },
      { id: "s", commandId: PROJECT_SEARCH, handler: search }
    ]);

    act(() => {
      window.dispatchEvent(keydown({ key: "#", metaKey: true, shiftKey: true }));
      window.dispatchEvent(keydown({ key: "%", metaKey: true, shiftKey: true }));
    });

    expect(heading).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("uses Cmd (not Ctrl) on darwin", () => {
    restorePlatform = stubRuntimePlatform("macos");
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });
    expect(handler).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(keydown({ key: "o", metaKey: true }));
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("reads the latest shortcuts array without re-attaching the listener", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler: firstHandler }]);
    render([{ id: "test", commandId: FILE_MODE, handler: secondHandler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
  });

  it("does not fire for an unrelated key", () => {
    const handler = vi.fn();
    render([{ id: "test", commandId: FILE_MODE, handler }]);

    act(() => {
      window.dispatchEvent(keydown({ key: "p", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
