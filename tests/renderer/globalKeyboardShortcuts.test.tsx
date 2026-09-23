// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesGlobalKeyboardShortcut,
  useGlobalKeyboardShortcuts,
  type GlobalKeyboardShortcut
} from "../../src/renderer/globalKeyboardShortcuts";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function keydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("matchesGlobalKeyboardShortcut", () => {
  it("matches Ctrl+P on Windows/Linux", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "p", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(true);
  });

  it("matches Cmd+P on macOS", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "p", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(true);
  });

  it("is case-insensitive on the key", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "P", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(true);
  });

  it("rejects when an unexpected modifier is also held", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "p", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(false);
  });

  it("rejects when the required modifier is missing", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "p", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(false);
  });

  it("rejects a different key", () => {
    expect(
      matchesGlobalKeyboardShortcut(
        { key: "o", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
        { key: "p", ctrlOrCmd: true }
      )
    ).toBe(false);
  });

  // #556: symbol shortcuts (#, @, :, %) must match on `event.key` alone,
  // ignoring which modifiers produced that character — e.g. `#` requires
  // Shift on a US keyboard layout but may not on others.
  describe("ignoreShiftAndAltState (#556)", () => {
    it("matches Ctrl+# even though # is typed with Shift held", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          { key: "#", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
          { key: "#", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(true);
    });

    it("matches Ctrl+@ when @ is typed without Shift (layout without a Shift requirement)", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          { key: "@", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false },
          { key: "@", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(true);
    });

    it("does not use event.code as a physical-key fallback", () => {
      // Ctrl+Digit3 with a "3" key (not "#") must never match the # shortcut,
      // even on layouts where # is physically Shift+3 — only event.key
      // identifies the shortcut, per #556's keyboard layout policy.
      expect(
        matchesGlobalKeyboardShortcut(
          { key: "3", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false },
          { key: "#", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(false);
    });

    it("still requires ctrlOrCmd even when shift/alt state is ignored", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          { key: "#", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false },
          { key: "#", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(false);
    });
  });

  // #556: AltGr (common on European keyboard layouts for typing @ / # / etc.)
  // is reported by Chromium as synthetic ctrlKey+altKey, indistinguishable
  // from a real Ctrl+Alt chord by those flags alone. A ctrlOrCmd-requiring
  // shortcut must not misfire when the user is simply typing that character
  // via AltGr with no literal Ctrl held.
  describe("AltGr guard (#556)", () => {
    it("does not match when getModifierState reports AltGraph", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          {
            key: "@",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: true,
            getModifierState: (key) => key === "AltGraph"
          },
          { key: "@", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(false);
    });

    it("still matches a real Ctrl chord when getModifierState reports no AltGraph", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          {
            key: "@",
            ctrlKey: true,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            getModifierState: () => false
          },
          { key: "@", ctrlOrCmd: true, ignoreShiftAndAltState: true }
        )
      ).toBe(true);
    });

    it("ignores AltGraph state for shortcuts that do not require ctrlOrCmd", () => {
      expect(
        matchesGlobalKeyboardShortcut(
          {
            key: "p",
            ctrlKey: false,
            metaKey: false,
            shiftKey: false,
            altKey: false,
            getModifierState: (key) => key === "AltGraph"
          },
          { key: "p" }
        )
      ).toBe(true);
    });
  });
});

describe("useGlobalKeyboardShortcuts", () => {
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
    vi.restoreAllMocks();
  });

  function Harness({ shortcuts }: { shortcuts: GlobalKeyboardShortcut[] }) {
    useGlobalKeyboardShortcuts(shortcuts);
    return null;
  }

  it("invokes the handler when the shortcut is pressed anywhere in the document", () => {
    const handler = vi.fn();
    act(() => {
      root.render(
        <Harness
          shortcuts={[{ id: "test", match: { key: "p", ctrlOrCmd: true }, handler }]}
        />
      );
    });

    act(() => {
      window.dispatchEvent(keydown({ key: "p", ctrlKey: true }));
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire while an editable text input has focus", () => {
    // Appended to `document.body` directly, NOT `container` — `createRoot`
    // takes ownership of `container`'s children on render and would
    // otherwise silently remove this fixture before the event dispatches.
    const handler = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      root.render(
        <Harness
          shortcuts={[{ id: "test", match: { key: "p", ctrlOrCmd: true }, handler }]}
        />
      );
    });

    act(() => {
      input.dispatchEvent(keydown({ key: "p", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not fire while a modal dialog is open", () => {
    // Matches InfoDialog.tsx's own `aria-modal="true"` (the global half of
    // isModalOrDialogActive's check — the event target here is `window`
    // itself, not an element inside the dialog). Appended to `document.body`
    // directly for the same reason as the input fixture above.
    const handler = vi.fn();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);

    act(() => {
      root.render(
        <Harness
          shortcuts={[{ id: "test", match: { key: "p", ctrlOrCmd: true }, handler }]}
        />
      );
    });

    act(() => {
      window.dispatchEvent(keydown({ key: "p", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("reads the latest shortcuts array without re-attaching the listener", () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    act(() => {
      root.render(
        <Harness
          shortcuts={[
            { id: "test", match: { key: "p", ctrlOrCmd: true }, handler: firstHandler }
          ]}
        />
      );
    });

    act(() => {
      root.render(
        <Harness
          shortcuts={[
            { id: "test", match: { key: "p", ctrlOrCmd: true }, handler: secondHandler }
          ]}
        />
      );
    });

    act(() => {
      window.dispatchEvent(keydown({ key: "p", ctrlKey: true }));
    });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledOnce();
  });

  it("does not fire for an unrelated key", () => {
    const handler = vi.fn();
    act(() => {
      root.render(
        <Harness
          shortcuts={[{ id: "test", match: { key: "p", ctrlOrCmd: true }, handler }]}
        />
      );
    });

    act(() => {
      window.dispatchEvent(keydown({ key: "o", ctrlKey: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
