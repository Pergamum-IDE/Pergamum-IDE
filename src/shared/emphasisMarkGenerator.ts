import type { AozoraEmphasisMark, EmphasisMarkRule } from "./settings";
import { countGraphemes } from "./emphasisMarkSettings";

export interface ApplyEmphasisMarkOptions {
  readonly text: string;
  readonly rule: EmphasisMarkRule;
  readonly aozoraMark: AozoraEmphasisMark;
  readonly narouMarkText: string;
}

export function getGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
    const segmenter = new (Intl as any).Segmenter(undefined, {
      granularity: "grapheme"
    });
    return Array.from(
      segmenter.segment(text),
      (s: { segment: string }) => s.segment
    );
  }
  return Array.from(text);
}

function getAozoraMarkName(mark: AozoraEmphasisMark): string {
  switch (mark) {
    case "whiteSesame":
      return "白ゴマ傍点";
    case "sesame":
      return "傍点";
    case "circle":
      return "丸傍点";
    case "whiteCircle":
      return "白丸傍点";
    case "blackTriangle":
      return "黒三角傍点";
    case "whiteTriangle":
      return "白三角傍点";
    case "doubleCircle":
      return "二重丸傍点";
    case "fisheye":
      return "蛇の目傍点";
    case "saltire":
      return "ばつ傍点";
  }
}

/**
 * Pure emphasis mark generator for Aozora Bunko, Kakuyomu, and Shosetsuka ni Naro.
 */
export function applyEmphasisMark(options: ApplyEmphasisMarkOptions): string {
  const { text, rule, aozoraMark, narouMarkText } = options;

  if (text.length === 0) {
    return "";
  }

  switch (rule) {
    case "aozora": {
      const markName = getAozoraMarkName(aozoraMark);
      return `${text}［＃「${text}」に${markName}］`;
    }
    case "kakuyomu": {
      return `《《${text}》》`;
    }
    case "narou": {
      const graphemes = getGraphemes(text);
      return graphemes.map((g) => `｜${g}《${narouMarkText}》`).join("");
    }
  }
}
