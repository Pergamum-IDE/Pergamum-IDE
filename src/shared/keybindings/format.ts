/**
 * #639: parsing, normalization, and display/Electron/CodeMirror formatting
 * of canonical (CodeMirror-style) key notation.
 */

import type { PergamumPlatform } from "./types";

export type KeyModifier = "Ctrl" | "Mod" | "Alt" | "Shift";

export interface ParsedKeybindingKey {
  readonly modifiers: ReadonlySet<KeyModifier>;
  readonly key: string;
}

const modifierNames: readonly KeyModifier[] = ["Mod", "Ctrl", "Shift", "Alt"];

/** Stable modifier order used for normalization and duplicate detection. */
const normalizedModifierOrder: readonly KeyModifier[] = [
  "Ctrl",
  "Mod",
  "Alt",
  "Shift"
];

const namedKeys: ReadonlySet<string> = new Set([
  "Space",
  "Enter",
  "Escape",
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

function isValidKeyToken(token: string): boolean {
  if (namedKeys.has(token)) {
    return true;
  }
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true;
  }
  // One printable ASCII character. Letters must be lowercase.
  return /^[\x21-\x7e]$/.test(token) && !/^[A-Z]$/.test(token);
}

/** Returns null when `notation` is not valid canonical key notation. */
export function parseKeybindingKey(
  notation: string
): ParsedKeybindingKey | null {
  const modifiers = new Set<KeyModifier>();
  let rest = notation;

  for (;;) {
    const modifier = modifierNames.find((name) => rest.startsWith(`${name}-`));
    if (modifier === undefined) {
      break;
    }
    if (modifiers.has(modifier)) {
      return null;
    }
    modifiers.add(modifier);
    rest = rest.slice(modifier.length + 1);
  }

  return isValidKeyToken(rest) ? { modifiers, key: rest } : null;
}

export function isValidKeybindingKey(notation: string): boolean {
  return parseKeybindingKey(notation) !== null;
}

function sortedModifiers(modifiers: ReadonlySet<KeyModifier>): KeyModifier[] {
  return normalizedModifierOrder.filter((modifier) => modifiers.has(modifier));
}

/**
 * Canonical spelling with a fixed modifier order (Ctrl-Mod-Alt-Shift), so
 * "Shift-Alt-m" and "Alt-Shift-m" compare equal. null when invalid.
 */
export function normalizeKeybindingKey(notation: string): string | null {
  const parsed = parseKeybindingKey(notation);
  if (parsed === null) {
    return null;
  }
  return [...sortedModifiers(parsed.modifiers), parsed.key].join("-");
}

function requireParsed(notation: string): ParsedKeybindingKey {
  const parsed = parseKeybindingKey(notation);
  if (parsed === null) {
    throw new RangeError(`Invalid key notation: ${notation}`);
  }
  return parsed;
}

/** Mod and Ctrl are the same physical key outside macOS. */
function effectiveModifiers(
  modifiers: ReadonlySet<KeyModifier>,
  platform: PergamumPlatform
): ReadonlySet<KeyModifier> {
  if (platform === "darwin" || !modifiers.has("Mod")) {
    return modifiers;
  }
  const result = new Set(modifiers);
  result.delete("Mod");
  result.add("Ctrl");
  return result;
}

function displayKeyName(key: string): string {
  switch (key) {
    case "Escape":
      return "Esc";
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    default:
      return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  }
}

/**
 * Human-readable label: `Ctrl+S` on win32/linux, `Cmd+S` on darwin. Literal
 * Ctrl stays `Ctrl` everywhere; Alt is shown as `Option` on darwin.
 */
export function formatKeybindingLabel(
  notation: string,
  platform: PergamumPlatform
): string {
  const parsed = requireParsed(notation);
  const modifiers = effectiveModifiers(parsed.modifiers, platform);
  const parts: string[] = [];
  for (const modifier of sortedModifiers(modifiers)) {
    if (modifier === "Mod") {
      parts.push("Cmd");
    } else if (modifier === "Alt") {
      parts.push(platform === "darwin" ? "Option" : "Alt");
    } else {
      parts.push(modifier);
    }
  }
  parts.push(displayKeyName(parsed.key));
  return parts.join("+");
}

function electronKeyName(key: string): string {
  switch (key) {
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    case "+":
      return "Plus";
    default:
      return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
  }
}

/**
 * Electron accelerator string, e.g. `Control+Shift+P` (win32/linux) or
 * `Command+Shift+P` (darwin). Not yet used for menu registration.
 */
export function toElectronAccelerator(
  notation: string,
  platform: PergamumPlatform
): string {
  const parsed = requireParsed(notation);
  const modifiers = effectiveModifiers(parsed.modifiers, platform);
  const parts: string[] = [];
  for (const modifier of sortedModifiers(modifiers)) {
    parts.push(
      modifier === "Mod" ? "Command" : modifier === "Ctrl" ? "Control" : modifier
    );
  }
  parts.push(electronKeyName(parsed.key));
  return parts.join("+");
}

/**
 * CodeMirror key string. Canonical notation is already CodeMirror style; this
 * normalizes modifier order and resolves Mod explicitly for `platform`:
 * `Ctrl` off macOS (so `Ctrl-Mod-x` does not name the same modifier twice)
 * and `Cmd` on macOS. CodeMirror resolves a literal `Mod` with its own
 * platform detection; emitting `Ctrl` / `Cmd` keeps the result independent of
 * that detection.
 */
export function toCodeMirrorKey(
  notation: string,
  platform: PergamumPlatform
): string {
  const parsed = requireParsed(notation);
  const modifiers = effectiveModifiers(parsed.modifiers, platform);
  const parts = sortedModifiers(modifiers).map((modifier) =>
    modifier === "Mod" ? "Cmd" : modifier
  );
  return [...parts, parsed.key].join("-");
}
