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
 * UI language -> exact OpenType/Microsoft-platform language ID. ADR-0015
 * F-15 uses the current UI language for localized display-name records; it
 * does not fall through to another localized language before the `family`
 * fallback.
 */
export function getFontNameLanguageId(
  uiLanguage: FontNameUiLanguage
): number {
  switch (uiLanguage) {
    case "ja":
      return MS_LANG_ID_JAPANESE;
    case "en":
    default:
      return MS_LANG_ID_US_ENGLISH;
  }
}

// Typographic/Preferred Family (16) is preferred over the plain Font
// Family (1) name — see ADR-0015's priority order.
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_FONT_FAMILY = 1;

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
 * Finds one name-table value for `languageID`/`nameID`, treating empty or
 * whitespace-only values as absent.
 */
function findNameValue(
  records: readonly FontNameRecord[],
  languageID: number,
  nameID: number
): string | undefined {
  const match = records.find(
    (record) =>
      record.languageID === languageID &&
      record.nameID === nameID &&
      record.value.trim().length > 0
  );
  return match?.value.trim();
}

function firstDeterministic(values: readonly string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "variant" })
  )[0];
}

/**
 * Resolves a family display name using ADR-0015 F-15 across every scanned
 * face that belongs to the same `FontData.family`:
 * 1. any face's current-UI-language nameID 16
 * 2. for a face whose English nameID 1 exactly equals `family`, that face's
 *    current-UI-language nameID 1
 * 3. `family`
 *
 * This deliberately gathers candidates across all faces before deciding, so
 * the result does not depend on `queryLocalFonts()` order and a first face
 * without a localized name cannot prematurely lock in the fallback.
 */
export function resolveDisplayNameFromFamilyRecords(
  faceRecords: readonly (readonly FontNameRecord[])[],
  uiLanguage: FontNameUiLanguage,
  family: string
): string {
  const uiLanguageId = getFontNameLanguageId(uiLanguage);

  const typographicFamilyCandidates = faceRecords
    .map((records) =>
      findNameValue(records, uiLanguageId, NAME_ID_TYPOGRAPHIC_FAMILY)
    )
    .filter((value): value is string => value !== undefined);
  const typographicFamily = firstDeterministic(typographicFamilyCandidates);
  if (typographicFamily) {
    return typographicFamily;
  }

  const familyNameCandidates = faceRecords
    .filter(
      (records) =>
        findNameValue(records, MS_LANG_ID_US_ENGLISH, NAME_ID_FONT_FAMILY) ===
        family
    )
    .map((records) => findNameValue(records, uiLanguageId, NAME_ID_FONT_FAMILY))
    .filter((value): value is string => value !== undefined);
  const familyName = firstDeterministic(familyNameCandidates);
  if (familyName) {
    return familyName;
  }

  if (family.trim().length > 0) {
    return family;
  }
  return UNRESOLVED_FONT_NAME_FALLBACK;
}

/**
 * Single-face convenience wrapper retained for focused parser/resolver tests
 * and defensive fallback paths. The real scan flow resolves with
 * `resolveDisplayNameFromFamilyRecords()` after collecting every face for a
 * family.
 */
export function resolveDisplayNameFromRecords(
  records: readonly FontNameRecord[],
  uiLanguage: FontNameUiLanguage,
  fallbackFamily: string
): string {
  return resolveDisplayNameFromFamilyRecords([records], uiLanguage, fallbackFamily);
}
