import type { Language } from "../shared/i18n";
import type { FontNameRecord } from "./fontNameTableParser";

/**
 * #496 (ADR-0015): resolves a font's localized display name from its parsed
 * `name`-table records, based on the application's current UI language.
 */

/** Self-documenting alias — this module only ever needs "ja"/"en", the same
 * closed set as the app's `Language` type (see `../shared/i18n`). */
export type FontNameUiLanguage = Language;

// Microsoft platform (platformID 3) language IDs.
const MS_LANG_ID_JAPANESE = 0x0411;
const MS_LANG_ID_US_ENGLISH = 0x0409;

/**
 * UI language -> ordered list of acceptable OpenType/Microsoft-platform
 * language IDs, most preferred first. `ja` tries Japanese name records
 * before falling back to US English ones; `en` (and any future default)
 * only looks for US English.
 */
export function getPreferredFontNameLanguageIds(
  uiLanguage: FontNameUiLanguage
): number[] {
  switch (uiLanguage) {
    case "ja":
      return [MS_LANG_ID_JAPANESE, MS_LANG_ID_US_ENGLISH];
    case "en":
    default:
      return [MS_LANG_ID_US_ENGLISH];
  }
}

// Typographic/Preferred Family (16) is preferred over the plain Font
// Family (1) name — see ADR-0015's priority order.
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_FONT_FAMILY = 1;
const PREFERRED_NAME_IDS = [NAME_ID_TYPOGRAPHIC_FAMILY, NAME_ID_FONT_FAMILY];

/**
 * Only reachable if a caller passes an empty/whitespace-only
 * `fallbackFamily` — which should never happen in the real scan pipeline
 * (`aggregateFontFamiliesWithDisplayNames` always skips raw font entries
 * whose `family` is empty/whitespace before this function is ever called;
 * see `src/shared/fontCache.ts`). Kept as a last-resort, hard-coded
 * exception so this function's own "never returns an empty string"
 * contract holds unconditionally, not just for well-behaved callers.
 */
const UNRESOLVED_FONT_NAME_FALLBACK = "(unnamed font)";

/**
 * Picks the best display name out of `records` for `uiLanguage`, walking
 * language IDs in preference order and, within each language, nameID 16
 * before nameID 1. A record whose decoded value is empty or whitespace-only
 * is treated as absent and skipped in favor of the next priority candidate.
 * Falls back to `fallbackFamily` (always `FontData.family` at the call site
 * — never a CSS family) when nothing usable is found; `fallbackFamily`
 * itself must be non-empty/non-whitespace for that to be meaningful (see
 * `UNRESOLVED_FONT_NAME_FALLBACK`). Never returns an empty string.
 */
export function resolveDisplayNameFromRecords(
  records: readonly FontNameRecord[],
  uiLanguage: FontNameUiLanguage,
  fallbackFamily: string
): string {
  const languageIds = getPreferredFontNameLanguageIds(uiLanguage);

  for (const languageId of languageIds) {
    for (const nameId of PREFERRED_NAME_IDS) {
      const match = records.find(
        (record) =>
          record.languageID === languageId &&
          record.nameID === nameId &&
          record.value.trim().length > 0
      );
      if (match) {
        return match.value.trim();
      }
    }
  }

  if (fallbackFamily.trim().length > 0) {
    return fallbackFamily;
  }
  return UNRESOLVED_FONT_NAME_FALLBACK;
}
