import { describe, expect, it } from "vitest";
import {
  captureKeyEvent,
  isValidKeybindingKey,
  keyboardEventToKeybindingNotation,
  type CapturedKeyInput,
  type PergamumPlatform
} from "../../src/shared/keybindings";

function input(
  key: string,
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
  code = ""
): CapturedKeyInput {
  return {
    key,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers
  };
}

function notation(
  platform: PergamumPlatform,
  key: string,
  modifiers: Parameters<typeof input>[1] = {},
  code = ""
): string | null {
  return keyboardEventToKeybindingNotation(input(key, modifiers, code), platform);
}

describe("keyboardEventToKeybindingNotation (#647)", () => {
  it.each(["win32", "linux"] as const)("%s: Ctrl becomes Mod", (platform) => {
    expect(notation(platform, "s", { ctrlKey: true })).toBe("Mod-s");
    expect(notation(platform, "P", { ctrlKey: true, shiftKey: true })).toBe("Mod-Shift-p");
    expect(notation(platform, "f", { ctrlKey: true, altKey: true })).toBe("Mod-Alt-f");
  });

  it("darwin: Cmd becomes Mod, Option becomes Alt, a physical Ctrl stays Ctrl", () => {
    expect(notation("darwin", "s", { metaKey: true })).toBe("Mod-s");
    expect(notation("darwin", "f", { metaKey: true, altKey: true })).toBe("Mod-Alt-f");
    expect(notation("darwin", "m", { altKey: true, shiftKey: true }, "KeyM")).toBe("Alt-Shift-m");
    expect(notation("darwin", "b", { ctrlKey: true })).toBe("Ctrl-b");
    expect(notation("darwin", "f", { ctrlKey: true, metaKey: true })).toBe("Ctrl-Mod-f");
  });

  it("the Windows / Super key is unsupported off macOS", () => {
    expect(captureKeyEvent(input("s", { metaKey: true }), "win32")).toEqual({
      kind: "unsupported"
    });
    expect(captureKeyEvent(input("s", { metaKey: true }), "linux")).toEqual({
      kind: "unsupported"
    });
  });

  it("modifier-only and dead / IME keys are ignored", () => {
    for (const key of ["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "Dead", "Process"]) {
      expect(captureKeyEvent(input(key, { ctrlKey: true }), "win32")).toEqual({ kind: "ignore" });
      expect(notation("win32", key, { ctrlKey: true })).toBeNull();
    }
  });

  it("plain Escape cancels and never becomes a key; modified Escape is unsupported", () => {
    expect(captureKeyEvent(input("Escape"), "win32")).toEqual({ kind: "cancel" });
    expect(notation("win32", "Escape")).toBeNull();
    expect(captureKeyEvent(input("Escape", { ctrlKey: true }), "win32")).toEqual({
      kind: "unsupported"
    });
  });

  it("function keys, bare or modified", () => {
    expect(notation("win32", "F2")).toBe("F2");
    expect(notation("win32", "F12")).toBe("F12");
    expect(notation("win32", "F3", { shiftKey: true })).toBe("Shift-F3");
    expect(notation("linux", "F5", { ctrlKey: true })).toBe("Mod-F5");
    expect(notation("darwin", "F1", { metaKey: true })).toBe("Mod-F1");
  });

  it("arrows, Home / End, Enter, Tab and Space need a command modifier", () => {
    expect(notation("win32", "ArrowLeft", { altKey: true })).toBe("Alt-ArrowLeft");
    expect(notation("darwin", "ArrowLeft", { metaKey: true, altKey: true })).toBe(
      "Mod-Alt-ArrowLeft"
    );
    expect(notation("win32", "Enter", { ctrlKey: true })).toBe("Mod-Enter");
    expect(notation("win32", "Tab", { ctrlKey: true })).toBe("Mod-Tab");
    expect(notation("win32", " ", { ctrlKey: true }, "Space")).toBe("Mod-Space");
    expect(notation("win32", "Home", { ctrlKey: true })).toBe("Mod-Home");
    // Bare ones would hijack typing / navigation.
    for (const key of ["ArrowLeft", "Enter", "Tab", " ", "Home", "Backspace"]) {
      expect(captureKeyEvent(input(key), "win32"), key).toEqual({ kind: "unsupported" });
    }
  });

  it("Delete may stand alone; Backspace may not (and neither is an unbind action)", () => {
    expect(notation("win32", "Delete")).toBe("Delete");
    expect(notation("win32", "Delete", { ctrlKey: true })).toBe("Mod-Delete");
    expect(captureKeyEvent(input("Backspace"), "win32")).toEqual({ kind: "unsupported" });
    expect(notation("win32", "Backspace", { ctrlKey: true })).toBe("Mod-Backspace");
  });

  it("a bare letter or digit, or Shift alone, is unsupported", () => {
    expect(captureKeyEvent(input("b"), "win32")).toEqual({ kind: "unsupported" });
    expect(captureKeyEvent(input("B", { shiftKey: true }), "win32")).toEqual({
      kind: "unsupported"
    });
    expect(captureKeyEvent(input("7"), "win32")).toEqual({ kind: "unsupported" });
  });

  it("digits and punctuation", () => {
    expect(notation("win32", "0", { ctrlKey: true })).toBe("Mod-0");
    expect(notation("win32", ",", { ctrlKey: true })).toBe("Mod-,");
    expect(notation("win32", ".", { ctrlKey: true })).toBe("Mod-.");
    expect(notation("win32", "-", { ctrlKey: true })).toBe("Mod--");
    expect(notation("win32", "=", { ctrlKey: true })).toBe("Mod-=");
    expect(notation("win32", "[", { ctrlKey: true })).toBe("Mod-[");
  });

  it("a shifted symbol drops Shift (the character already encodes it): Mod-#, Mod-+, Mod-%", () => {
    expect(notation("win32", "#", { ctrlKey: true, shiftKey: true })).toBe("Mod-#");
    expect(notation("win32", "+", { ctrlKey: true, shiftKey: true })).toBe("Mod-+");
    expect(notation("darwin", "%", { metaKey: true, shiftKey: true })).toBe("Mod-%");
    expect(notation("win32", "@", { ctrlKey: true, shiftKey: true })).toBe("Mod-@");
  });

  it("uses the visible letter (layout aware) rather than the physical key", () => {
    // Dvorak: the key labelled "b" sits where QWERTY has "n".
    expect(notation("win32", "b", { ctrlKey: true }, "KeyN")).toBe("Mod-b");
  });

  it("falls back to the physical key for a composed macOS Option character", () => {
    expect(notation("darwin", "å", { altKey: true, metaKey: true }, "KeyA")).toBe("Mod-Alt-a");
    expect(notation("darwin", "Dead", { altKey: true }, "Backquote")).toBeNull();
    expect(notation("darwin", "`", { altKey: true }, "Backquote")).toBe("Alt-`");
    expect(notation("darwin", "¡", { altKey: true }, "Digit1")).toBe("Alt-1");
    expect(captureKeyEvent(input("あ", { ctrlKey: true }, "IntlRo"), "win32")).toEqual({
      kind: "unsupported"
    });
  });

  it("every produced notation is valid catalog notation", () => {
    const samples: Array<[PergamumPlatform, CapturedKeyInput]> = [
      ["win32", input("s", { ctrlKey: true })],
      ["darwin", input("ArrowUp", { metaKey: true, altKey: true })],
      ["linux", input("F24", { shiftKey: true })],
      ["win32", input("#", { ctrlKey: true, shiftKey: true })]
    ];
    for (const [platform, sample] of samples) {
      const result = captureKeyEvent(sample, platform);
      expect(result.kind).toBe("key");
      if (result.kind === "key") {
        expect(isValidKeybindingKey(result.notation)).toBe(true);
      }
    }
  });
});
