import type { AozoraEmphasisMark, EmphasisMarkRule } from "./settings";

/**
 * #484 — shared helpers and validators for emphasis mark notation settings.
 */

export function countGraphemes(text: string): number {
  if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
    const segmenter = new (Intl as any).Segmenter(undefined, {
      granularity: "grapheme"
    });
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}

/**
 * Validates Narou custom emphasis mark text:
 * - Must not be empty
 * - Must not contain newlines (\n, \r)
 * - Must not contain Japanese punctuation brackets 《, 》, ｜
 * - Length must be 1 to 8 graphemes
 */
export function validateNarouEmphasisMarkText(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }
  if (text.includes("\n") || text.includes("\r")) {
    return false;
  }
  if (text.includes("《") || text.includes("》") || text.includes("｜")) {
    return false;
  }
  const len = countGraphemes(text);
  return len >= 1 && len <= 8;
}

const AOZORA_EMPHASIS_MARKS: readonly string[] = [
  "sesame",
  "whiteSesame",
  "circle",
  "whiteCircle",
  "blackTriangle",
  "whiteTriangle",
  "doubleCircle",
  "fisheye",
  "saltire"
];

/**
 * Sanitizes Aozora emphasis mark input, mapping legacy "blackCircle" to "circle".
 */
export function sanitizeAozoraEmphasisMark(value: unknown): AozoraEmphasisMark {
  if (value === "blackCircle") {
    return "circle";
  }
  if (typeof value === "string" && AOZORA_EMPHASIS_MARKS.includes(value)) {
    return value as AozoraEmphasisMark;
  }
  return "sesame";
}

/**
 * Preview metadata per emphasis mark rule.
 */
export interface EmphasisRulePreviewMeta {
  readonly defaultSymbol: string;
  readonly allowSymbolCustomization: boolean;
}

export const EMPHASIS_RULE_PREVIEW_META: Record<
  EmphasisMarkRule,
  EmphasisRulePreviewMeta
> = {
  aozora: { defaultSymbol: "﹅", allowSymbolCustomization: true },
  kakuyomu: { defaultSymbol: "・", allowSymbolCustomization: false },
  narou: { defaultSymbol: "・", allowSymbolCustomization: true }
};

/**
 * Returns the visual preview symbol for an Aozora emphasis mark type.
 */
export function getAozoraEmphasisPreviewSymbol(mark: AozoraEmphasisMark): string {
  switch (mark) {
    case "sesame":
      return "﹅";
    case "whiteSesame":
      return "﹆";
    case "circle":
      return "●";
    case "whiteCircle":
      return "○";
    case "blackTriangle":
      return "▲";
    case "whiteTriangle":
      return "△";
    case "doubleCircle":
      return "◎";
    case "fisheye":
      return "◉";
    case "saltire":
      return "×";
  }
}

export interface GetEmphasisMarkPreviewSymbolOptions {
  readonly rule: EmphasisMarkRule;
  readonly aozoraMark: AozoraEmphasisMark;
  readonly narouMarkText: string;
}

/**
 * Resolves the visual rendered preview symbol for any emphasis mark rule.
 */
export function getEmphasisMarkPreviewSymbol(
  options: GetEmphasisMarkPreviewSymbolOptions
): string {
  switch (options.rule) {
    case "aozora":
      return getAozoraEmphasisPreviewSymbol(options.aozoraMark);
    case "kakuyomu":
      return EMPHASIS_RULE_PREVIEW_META.kakuyomu.defaultSymbol;
    case "narou":
      return validateNarouEmphasisMarkText(options.narouMarkText)
        ? options.narouMarkText
        : "";
  }
}

