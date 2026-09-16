import type { SettingValidationResult } from "./settingsCatalog";

export interface FontFamilySetting {
  family: string;
  displayName?: string;
}

export type FontFamilyListSetting = readonly FontFamilySetting[];

export type FontSlot =
  | "workbench.uiFontFamilyList"
  | "editor.fontFamilyList"
  | "preview.fontFamilyList";

export type GenericFontFamily =
  | "sans-serif"
  | "serif"
  | "monospace"
  | "cursive"
  | "fantasy"
  | "system-ui";

export const FONT_SLOT_GENERIC_FALLBACKS: Record<FontSlot, GenericFontFamily> = {
  "workbench.uiFontFamilyList": "sans-serif",
  "editor.fontFamilyList": "monospace",
  "preview.fontFamilyList": "serif"
} as const;

export const defaultFontFamilyListSettings: readonly FontFamilySetting[] = [];

export const GENERIC_FONT_FAMILIES = new Set<string>([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong"
]);

export function parseFontFamilyEntry(value: unknown): FontFamilySetting | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) {
      return null;
    }
    return { family: trimmed };
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.family === "string") {
      const family = obj.family.trim();
      if (!family || GENERIC_FONT_FAMILIES.has(family.toLowerCase())) {
        return null;
      }
      const displayName =
        typeof obj.displayName === "string" && obj.displayName.trim().length > 0
          ? obj.displayName.trim()
          : undefined;
      return displayName ? { family, displayName } : { family };
    }
  }

  return null;
}

export function validateFontFamilyList(
  value: unknown
): SettingValidationResult<FontFamilySetting[]> {
  if (!Array.isArray(value)) {
    return { ok: false, failure: "typeMismatch" };
  }

  const result: FontFamilySetting[] = [];
  const seenFamilies = new Set<string>();

  for (const item of value) {
    if (
      typeof item !== "string" &&
      (typeof item !== "object" || item === null || Array.isArray(item))
    ) {
      return { ok: false, failure: "typeMismatch" };
    }

    const entry = parseFontFamilyEntry(item);
    if (!entry) {
      // Non-string/object or invalid family string
      if (typeof item === "object" && item !== null && !("family" in item)) {
        return { ok: false, failure: "typeMismatch" };
      }
      continue;
    }

    const key = entry.family.toLowerCase();
    if (!seenFamilies.has(key)) {
      seenFamilies.add(key);
      result.push(entry);
    }
  }

  return { ok: true, value: result };
}

export function quoteCssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) {
    return trimmed;
  }
  // Remove existing outer quotes if present
  const unquoted = trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  const escaped = unquoted.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function buildFontFamilyCss(
  families: readonly (FontFamilySetting | string)[],
  genericFallback?: GenericFontFamily
): string {
  const parts: string[] = [];
  const seen = new Set<string>();

  for (const item of families) {
    const familyStr = typeof item === "string" ? item : item.family;
    const trimmed = familyStr.trim();
    if (!trimmed) {
      continue;
    }
    const quoted = quoteCssFontFamily(trimmed);
    const key = quoted.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      parts.push(quoted);
    }
  }

  if (genericFallback) {
    parts.push(genericFallback);
  }

  return parts.join(", ");
}
