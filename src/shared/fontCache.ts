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
  /**
   * #496: the Font Access API's `FontData.blob()`. Structurally typed
   * (rather than the DOM `Blob` type) so `src/shared/fontCache.ts` stays
   * compilable under `tsconfig.main.json`, which has no DOM lib — the main
   * process never calls this, only the renderer's font-scan flow does.
   */
  blob?: () => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

/**
 * #496: a raw scanned font face plus its (already resolved, or attempted
 * and unresolved) localized display name for this face specifically. The
 * renderer's font-scan flow produces these by parsing each face's `name`
 * table; `aggregateFontFamiliesWithDisplayNames` then picks the best one
 * per family.
 */
export interface RawFontDataWithDisplayName extends RawFontData {
  /** The localized name resolved for this face, if any. Omit/leave
   * undefined when resolution failed or was skipped — the aggregator falls
   * back to `family` in that case. */
  resolvedDisplayName?: string;
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
 * #496: like `aggregateFontFamilies`, but each face may already carry a
 * `resolvedDisplayName` (from renderer-side `name`-table parsing). Picks
 * the best displayName per family — the first face's resolved name if any,
 * upgrading from the `family` fallback the moment a later face for the same
 * family resolves a real localized name.
 * - Deduplication is still by exact string match on FontData.family, never
 *   by `displayName` — two different families may legitimately share one
 *   localized displayName (e.g. "Yu Gothic" / "Yu Gothic UI" -> "游ゴシック").
 * - `family` is always `FontData.family`, never the localized name — it is
 *   never used as (or derived from) a CSS font-family value.
 * - FontData.fullName is intentionally NOT used.
 * - fixedWidth still defaults to "unknown" (set later by #495 measurement).
 * - Families without Regular face are NOT filtered out.
 * - Font names are NOT normalized: `family` is stored exactly as given
 *   (never trimmed/rewritten) — `.trim()` below is only ever used to test
 *   for emptiness, never to change a stored value.
 * - #496 remediation: `displayName` is guaranteed non-empty. An
 *   empty/whitespace-only `family` is skipped entirely (no cache entry);
 *   an empty/whitespace-only `resolvedDisplayName` always falls back to
 *   `family`, both for the first face setting the baseline and for any
 *   later face attempting to "upgrade" it.
 */
export function aggregateFontFamiliesWithDisplayNames(
  rawFonts: readonly RawFontDataWithDisplayName[]
): CachedFontFamily[] {
  const byFamily = new Map<string, CachedFontFamily>();

  for (const font of rawFonts) {
    if (!font || typeof font.family !== "string" || font.family.trim() === "") {
      continue;
    }
    const familyName = font.family;
    // Non-empty (post-trim) resolved name, or `undefined` — never `""`.
    const resolvedDisplayName = font.resolvedDisplayName?.trim() || undefined;

    const existing = byFamily.get(familyName);
    if (!existing) {
      byFamily.set(familyName, {
        family: familyName,
        displayName: resolvedDisplayName ?? familyName,
        fixedWidth: "unknown"
      });
    } else if (existing.displayName === familyName && resolvedDisplayName) {
      existing.displayName = resolvedDisplayName;
    }
  }

  return Array.from(byFamily.values());
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
    if (
      typeof f.family !== "string" ||
      typeof f.displayName !== "string" ||
      // #496: displayName may now be a localized name, but it must still
      // resolve to something non-empty (fallback to `family` upstream
      // guarantees this for legitimately-produced caches).
      f.displayName.trim() === ""
    ) {
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
