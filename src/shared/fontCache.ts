/**
 * Local Font Cache Foundation (#491, ADR-0015).
 */

export type FontFixedWidthStatus = "unknown" | "fixed" | "proportional";

export interface CachedFontFamily {
  family: string;
  displayName: string;
  fixedWidth: FontFixedWidthStatus;
}

export interface FontCache {
  version: 1;
  scannedAt: string;
  uiLanguage: string;
  families: CachedFontFamily[];
}

export type FontCacheState =
  | { status: "notScanned" }
  | { status: "loaded"; cache: FontCache }
  | { status: "error"; message: string };

export interface RawFontData {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

export const FONT_CACHE_CURRENT_VERSION = 1;

/**
 * Aggregates a raw array of FontData into a list of unique CachedFontFamily entries by exact FontData.family.
 * - Deduplication is done by exact string match on FontData.family.
 * - FontData.fullName is intentionally NOT used.
 * - Strategy B: displayName defaults to family.
 * - Strategy B: fixedWidth defaults to "unknown".
 * - Families without Regular face are NOT filtered out.
 * - Font names are NOT normalized.
 */
export function aggregateFontFamilies(
  rawFonts: readonly RawFontData[]
): CachedFontFamily[] {
  const seenFamilies = new Set<string>();
  const result: CachedFontFamily[] = [];

  for (const font of rawFonts) {
    if (!font || typeof font.family !== "string" || font.family.trim() === "") {
      continue;
    }
    const familyName = font.family;
    if (!seenFamilies.has(familyName)) {
      seenFamilies.add(familyName);
      result.push({
        family: familyName,
        displayName: familyName,
        fixedWidth: "unknown"
      });
    }
  }

  return result;
}

/**
 * Validates whether an unknown value is a valid FontCache object.
 */
export function isValidFontCache(value: unknown): value is FontCache {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== FONT_CACHE_CURRENT_VERSION) {
    return false;
  }
  if (typeof obj.scannedAt !== "string" || typeof obj.uiLanguage !== "string") {
    return false;
  }
  if (!Array.isArray(obj.families)) {
    return false;
  }
  for (const item of obj.families) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }
    const f = item as Record<string, unknown>;
    if (typeof f.family !== "string" || typeof f.displayName !== "string") {
      return false;
    }
    if (
      f.fixedWidth !== "unknown" &&
      f.fixedWidth !== "fixed" &&
      f.fixedWidth !== "proportional"
    ) {
      return false;
    }
  }
  return true;
}
