import type { ApplicationEditorWhitespaceSettings } from "../../shared/settings";

/**
 * #256 (phase 2): classify a single character into one of the four
 * whitespace categories the Markdown editor can render markers for, or
 * `null` when it is not a character this feature ever marks.
 *
 * This module is deliberately free of any CodeMirror / DOM import: the
 * category boundaries are the part of the feature worth pinning with plain
 * unit tests, independent of how (or whether) a marker is ultimately
 * painted. The CodeMirror integration lives in `whitespaceMarkerLayer`.
 *
 * Category definitions follow Issue #256 exactly:
 *
 *  - `ideographicSpace`   — U+3000 IDEOGRAPHIC SPACE only
 *  - `asciiSpace`         — U+0020 SPACE only
 *  - `tab`                — U+0009 CHARACTER TABULATION only
 *  - `otherUnicodeSpace`  — every character in Unicode General Category
 *                           `Zs` (Space_Separator) EXCEPT U+0020 and
 *                           U+3000.
 *
 * Explicitly NOT covered by any category (kept here as a reminder of the
 * scope boundary — these all return `null`): LF / CR, vertical tab, form
 * feed, NEL, U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR, U+200B
 * ZERO WIDTH SPACE, ZWNJ / ZWJ, bidi controls, and other `Cf` / invisible
 * format characters. Line-ending markers are #252's separate concern.
 */

export type WhitespaceCategory =
  | "ideographicSpace"
  | "asciiSpace"
  | "tab"
  | "otherUnicodeSpace";

export const ASCII_SPACE = " ";
export const IDEOGRAPHIC_SPACE = "　";
export const TAB = "	";

/**
 * The complete Unicode General Category `Zs` (Space_Separator) set as of
 * Unicode 16.0, with U+0020 and U+3000 removed (they are their own #256
 * categories). `Zs` is a tiny, effectively frozen block — enumerating it
 * explicitly keeps classification deterministic and independent of the
 * host JS engine's bundled Unicode data version, which a `\p{Zs}` regexp
 * would otherwise depend on.
 */
export const OTHER_UNICODE_SPACE_CODE_POINTS: readonly number[] = [
  0x00a0, // NO-BREAK SPACE
  0x1680, // OGHAM SPACE MARK
  0x2000, // EN QUAD
  0x2001, // EM QUAD
  0x2002, // EN SPACE
  0x2003, // EM SPACE
  0x2004, // THREE-PER-EM SPACE
  0x2005, // FOUR-PER-EM SPACE
  0x2006, // SIX-PER-EM SPACE
  0x2007, // FIGURE SPACE
  0x2008, // PUNCTUATION SPACE
  0x2009, // THIN SPACE
  0x200a, // HAIR SPACE
  0x202f, // NARROW NO-BREAK SPACE
  0x205f // MEDIUM MATHEMATICAL SPACE
];

const OTHER_UNICODE_SPACE_SET: ReadonlySet<string> = new Set(
  OTHER_UNICODE_SPACE_CODE_POINTS.map((codePoint) =>
    String.fromCodePoint(codePoint)
  )
);

/**
 * Body of a RegExp character class (`[...]`) matching exactly the
 * characters `classifyWhitespaceCharacter` recognizes. Kept next to the
 * classifier so the CodeMirror-side scan pattern and the classifier can
 * never quietly drift apart.
 */
export const WHITESPACE_MATCH_CHARACTER_CLASS =
  "\\t\\u0020\\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000";

export function classifyWhitespaceCharacter(
  character: string
): WhitespaceCategory | null {
  if (character.length !== 1) {
    return null;
  }

  switch (character) {
    case TAB:
      return "tab";
    case ASCII_SPACE:
      return "asciiSpace";
    case IDEOGRAPHIC_SPACE:
      return "ideographicSpace";
    default:
      return OTHER_UNICODE_SPACE_SET.has(character)
        ? "otherUnicodeSpace"
        : null;
  }
}

export function isWhitespaceCategoryRendered(
  category: WhitespaceCategory,
  settings: ApplicationEditorWhitespaceSettings
): boolean {
  switch (category) {
    case "ideographicSpace":
      return settings.renderIdeographicSpace;
    case "asciiSpace":
      return settings.renderAsciiSpace;
    case "tab":
      return settings.renderTab;
    case "otherUnicodeSpace":
      return settings.renderOtherUnicodeSpace;
  }
}

export function isAnyWhitespaceCategoryRendered(
  settings: ApplicationEditorWhitespaceSettings
): boolean {
  return (
    settings.renderIdeographicSpace ||
    settings.renderAsciiSpace ||
    settings.renderTab ||
    settings.renderOtherUnicodeSpace
  );
}
