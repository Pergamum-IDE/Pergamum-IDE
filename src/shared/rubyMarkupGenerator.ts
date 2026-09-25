import type { RubyMarkupRule } from "./settings";

export interface ApplyRubyMarkupOptions {
  readonly text: string;
  readonly rule: RubyMarkupRule;
  readonly rubyText: string;
}

/**
 * Pure ruby markup generator for Aozora Bunko.
 */
export function applyRubyMarkup(options: ApplyRubyMarkupOptions): string {
  const { text, rule, rubyText } = options;

  if (text.length === 0) {
    return "";
  }

  switch (rule) {
    case "aozora":
      return `｜${text}《${rubyText}》`;
    case "denden":
      return `{${text}|${rubyText.replace(/｜/g, "|")}}`;
  }
}

function defaultEscapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isKanjiChar(ch: string): boolean {
  return /\p{Script=Han}/u.test(ch) || ch === "々" || ch === "〻";
}

export interface BaseSegment {
  type: "kanjiRun" | "plain";
  text: string;
}

export function splitIntoKanjiRunsAndPlainText(text: string): BaseSegment[] {
  const chars = Array.from(text);
  if (chars.length === 0) {
    return [];
  }
  const segments: BaseSegment[] = [];
  let currentType: "kanjiRun" | "plain" = isKanjiChar(chars[0]) ? "kanjiRun" : "plain";
  let currentText = chars[0];

  for (let i = 1; i < chars.length; i++) {
    const ch = chars[i];
    const type: "kanjiRun" | "plain" = isKanjiChar(ch) ? "kanjiRun" : "plain";
    if (type === currentType) {
      currentText += ch;
    } else {
      segments.push({ type: currentType, text: currentText });
      currentType = type;
      currentText = ch;
    }
  }
  segments.push({ type: currentType, text: currentText });
  return segments;
}

export function renderDendenRubyHtml(
  baseText: string,
  rubyParts: string[],
  escapeFn: (str: string) => string = defaultEscapeHtml
): string {
  const normalizedRubyParts = rubyParts.flatMap((part) =>
    part.replace(/｜/g, "|").split("|")
  );
  const baseChars = Array.from(baseText);

  // 1. Per-character mono ruby
  if (
    baseChars.length === normalizedRubyParts.length &&
    normalizedRubyParts.every(Boolean)
  ) {
    const pairs = baseChars.map(
      (ch, idx) => `${escapeFn(ch)}<rt>${escapeFn(normalizedRubyParts[idx])}</rt>`
    );
    return `<ruby>${pairs.join("")}</ruby>`;
  }

  // 2. Kanji-run ruby
  const segments = splitIntoKanjiRunsAndPlainText(baseText);
  const kanjiRunCount = segments.filter((s) => s.type === "kanjiRun").length;

  if (
    normalizedRubyParts.length > 1 &&
    kanjiRunCount === normalizedRubyParts.length &&
    normalizedRubyParts.every(Boolean)
  ) {
    let rubyIdx = 0;
    const htmlSegments = segments.map((seg) => {
      if (seg.type === "kanjiRun") {
        const rt = normalizedRubyParts[rubyIdx++];
        return `<ruby>${escapeFn(seg.text)}<rt>${escapeFn(rt)}</rt></ruby>`;
      }
      return escapeFn(seg.text);
    });
    return htmlSegments.join("");
  }

  // 3. Fallback: Group ruby
  const rubyText = normalizedRubyParts.join("|");
  return `<ruby>${escapeFn(baseText)}<rt>${escapeFn(rubyText)}</rt></ruby>`;
}
