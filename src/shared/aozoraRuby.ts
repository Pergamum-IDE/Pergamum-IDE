/**
 * #628: Shared Aozora Bunko-style ruby parser utilities.
 *
 * Supports explicit ruby base markers (｜親文字《ルビ》 / |親文字《ルビ》),
 * implicit Kanji ruby base (contiguous Kanji run immediately preceding 《ルビ》),
 * and non-kana fallback ruby base (scanning left until hitting a boundary).
 */

export const MAX_FALLBACK_RUBY_BASE_LENGTH = 32;

export function isKanjiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

export function isKanaCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3040 && codePoint <= 0x309f) || // Hiragana
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) || // Katakana
    (codePoint >= 0x31f0 && codePoint <= 0x31ff) || // Katakana Phonetic Extensions
    (codePoint >= 0xff65 && codePoint <= 0xff9f) // Half-width Katakana
  );
}

const AOZORA_RUBY_BOUNDARY_REGEX =
  /[\r\n\s\u3000「」『』（）［］【】〈〉《》〔〕()\[\]{}<>«»“”‘’、。,.!?！？：；:;｜|―…・／/\\〜~]/;

export function isAozoraRubyBoundaryCodePoint(codePoint: number): boolean {
  if (isKanjiCodePoint(codePoint) || isKanaCodePoint(codePoint)) {
    return true;
  }
  const char = String.fromCodePoint(codePoint);
  return AOZORA_RUBY_BOUNDARY_REGEX.test(char);
}

export interface AozoraRubyBaseMatch {
  matchStart: number;
  baseText: string;
}

function getPreviousCodePointPos(text: string, pos: number): number {
  let prevPos = pos - 1;
  if (
    prevPos > 0 &&
    text.charCodeAt(prevPos) >= 0xdc00 &&
    text.charCodeAt(prevPos) <= 0xdfff &&
    text.charCodeAt(prevPos - 1) >= 0xd800 &&
    text.charCodeAt(prevPos - 1) <= 0xdbff
  ) {
    prevPos -= 1;
  }
  return prevPos;
}

/**
 * Finds the ruby base text corresponding to 《...》 starting at openIndex in text.
 * searchStart is the index in text where the current scanning began (e.g. pos).
 */
export function findAozoraRubyBase(
  text: string,
  openIndex: number,
  searchStart: number = 0
): AozoraRubyBaseMatch | null {
  if (openIndex <= searchStart || openIndex > text.length) {
    return null;
  }

  // Check 1: Explicit ruby base marker (｜ or |) before openIndex
  const explicit1 = text.lastIndexOf("｜", openIndex - 1);
  const explicit2 = text.lastIndexOf("|", openIndex - 1);
  const explicitMarkerPos = Math.max(explicit1, explicit2);

  if (explicitMarkerPos >= searchStart) {
    const candidateBase = text.slice(explicitMarkerPos + 1, openIndex);
    if (candidateBase.length > 0 && !/[\r\n》｜|]/.test(candidateBase)) {
      return {
        matchStart: explicitMarkerPos,
        baseText: candidateBase
      };
    }
  }

  // Check 2: Implicit Kanji ruby base (contiguous Kanji run immediately preceding openIndex)
  const prevCharPos = getPreviousCodePointPos(text, openIndex);
  if (prevCharPos >= searchStart) {
    const lastCp = text.codePointAt(prevCharPos);
    if (lastCp !== undefined && isKanjiCodePoint(lastCp)) {
      let kanjiStart = openIndex;
      while (kanjiStart > searchStart) {
        const p = getPreviousCodePointPos(text, kanjiStart);
        if (p < searchStart) {
          break;
        }
        const cp = text.codePointAt(p);
        if (cp === undefined || !isKanjiCodePoint(cp)) {
          break;
        }
        kanjiStart = p;
      }
      if (kanjiStart < openIndex) {
        return {
          matchStart: kanjiStart,
          baseText: text.slice(kanjiStart, openIndex)
        };
      }
    }
  }

  // Check 3: Non-kana fallback ruby base
  // Scans left from openIndex until hitting a boundary (Hiragana, Katakana, Kanji, whitespace, punctuation, bracket)
  let fallbackStart = openIndex;
  while (fallbackStart > searchStart) {
    const p = getPreviousCodePointPos(text, fallbackStart);
    if (p < searchStart) {
      break;
    }
    const cp = text.codePointAt(p);
    if (cp === undefined || isAozoraRubyBoundaryCodePoint(cp)) {
      break;
    }
    fallbackStart = p;
  }

  if (fallbackStart < openIndex) {
    const candidateBase = text.slice(fallbackStart, openIndex);
    const codePointCount = [...candidateBase].length;
    if (codePointCount > 0 && codePointCount <= MAX_FALLBACK_RUBY_BASE_LENGTH) {
      return {
        matchStart: fallbackStart,
        baseText: candidateBase
      };
    }
  }

  return null;
}
