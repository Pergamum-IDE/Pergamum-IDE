/**
 * #647: converts a captured keyboard event into catalog key notation, for the
 * Keyboard Shortcuts editing UI.
 *
 * Pure. Accepts any event-like object (a DOM `KeyboardEvent`, or the fields
 * the main process forwards while it is capturing). Chords are not supported.
 *
 * Rules:
 * - Mod is Ctrl on win32 / linux and Cmd on darwin; on darwin a physical Ctrl
 *   stays `Ctrl`; on win32 / linux the Windows / Super key is unsupported.
 * - Letters are lowercased and keep Shift; a shifted symbol (`#`, `+`, ...)
 *   already encodes Shift in the character, so Shift is dropped (`Mod-#`).
 * - When the key is a composed / non-ASCII character (macOS Option), the
 *   physical `code` is used instead.
 * - A plain key needs a command modifier (Mod / Ctrl / Alt), so it cannot
 *   hijack typing; F1-F24 and Delete are the only allowed bare keys.
 * - Escape is reserved for cancelling the capture and never becomes a key.
 */

import { isValidKeybindingKey } from "./format";
import type { PergamumPlatform } from "./types";

export interface CapturedKeyInput {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export type CapturedKeyResult =
  | { readonly kind: "key"; readonly notation: string }
  /** A modifier was pressed on its own (or a dead / IME key): keep waiting. */
  | { readonly kind: "ignore" }
  /** Plain Escape: cancel the capture. */
  | { readonly kind: "cancel" }
  /** A real key that cannot be a shortcut (bare letter, Win key, ...). */
  | { readonly kind: "unsupported" };

const modifierOnlyKeys: ReadonlySet<string> = new Set([
  "Control",
  "Shift",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super"
]);

const ignoredKeys: ReadonlySet<string> = new Set([
  "Dead",
  "Process",
  "Unidentified",
  "Compose"
]);

const namedKeys: ReadonlySet<string> = new Set([
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
]);

/** Physical key -> notation, for events whose `key` is not usable ASCII. */
const codeToKey: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\"
};

function keyFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter !== null) {
    return (letter[1] as string).toLowerCase();
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit !== null) {
    return digit[1] as string;
  }
  return codeToKey[code] ?? null;
}

export function captureKeyEvent(
  input: CapturedKeyInput,
  platform: PergamumPlatform
): CapturedKeyResult {
  const { key } = input;

  if (modifierOnlyKeys.has(key) || ignoredKeys.has(key)) {
    return { kind: "ignore" };
  }
  const hasModifier =
    input.ctrlKey || input.metaKey || input.altKey || input.shiftKey;
  if (key === "Escape") {
    return hasModifier ? { kind: "unsupported" } : { kind: "cancel" };
  }

  // The Windows / Super key has no catalog modifier.
  if (platform !== "darwin" && input.metaKey) {
    return { kind: "unsupported" };
  }

  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  let token: string | null = null;
  let shiftIsImplied = false;

  if (isFunctionKey || namedKeys.has(key)) {
    token = key;
  } else if (key === " ") {
    token = "Space";
  } else if (/^[A-Za-z]$/.test(key)) {
    token = key.toLowerCase();
  } else if (/^[0-9]$/.test(key)) {
    token = key;
  } else if (/^[\x21-\x7e]$/.test(key)) {
    // A symbol: the character already encodes Shift.
    token = key;
    shiftIsImplied = true;
  } else {
    // Composed / non-ASCII (macOS Option): fall back to the physical key.
    token = keyFromCode(input.code);
    if (token === null) {
      return { kind: "unsupported" };
    }
  }

  const mod = platform === "darwin" ? input.metaKey : input.ctrlKey;
  const ctrl = platform === "darwin" ? input.ctrlKey : false;
  const alt = input.altKey;
  const shift = input.shiftKey && !shiftIsImplied;

  // A bare key would hijack typing: only F-keys and Delete may stand alone.
  const hasCommandModifier = mod || ctrl || alt;
  const mayBeBare = isFunctionKey || token === "Delete";
  if (!hasCommandModifier && !mayBeBare) {
    return { kind: "unsupported" };
  }

  const parts: string[] = [];
  if (ctrl) {
    parts.push("Ctrl");
  }
  if (mod) {
    parts.push("Mod");
  }
  if (alt) {
    parts.push("Alt");
  }
  if (shift) {
    parts.push("Shift");
  }
  parts.push(token);
  const notation = parts.join("-");
  return isValidKeybindingKey(notation)
    ? { kind: "key", notation }
    : { kind: "unsupported" };
}

/**
 * The catalog notation for `input`, or `null` when there is none (modifier
 * only, Escape, or an unsupported key). See {@link captureKeyEvent}.
 */
export function keyboardEventToKeybindingNotation(
  input: CapturedKeyInput,
  platform: PergamumPlatform
): string | null {
  const result = captureKeyEvent(input, platform);
  return result.kind === "key" ? result.notation : null;
}
