/**
 * Aozora Bunko emphasis mark (bouten) kind mapping table (#512).
 * Maps Aozora mark kind names (e.g. "傍点", "黒ゴマ傍点", "白丸傍点")
 * to their display mark characters.
 */
export const AOZORA_BOUTEN_MARKS: Record<string, string> = {
  "傍点": "・",
  "黒ゴマ傍点": "﹅",
  "白ゴマ傍点": "﹆",
  "丸傍点": "●",
  "黒丸傍点": "●",
  "白丸傍点": "○",
  "黒三角傍点": "▲",
  "白三角傍点": "△",
  "二重丸傍点": "◎",
  "蛇の目傍点": "◉",
  "ばつ傍点": "×"
};

/**
 * Returns the display mark character for a known Aozora bouten kind name,
 * or null if the kind is unsupported/unknown.
 */
export function getAozoraBoutenMark(kind: string): string | null {
  return AOZORA_BOUTEN_MARKS[kind] ?? null;
}

/**
 * Replaces Aozora target-specified emphasis mark annotations (`TARGET［＃「TARGET」にKIND傍点］`)
 * on HTML-escaped text.
 *
 * Rules:
 * - Same line only.
 * - Only applies if the text immediately preceding the annotation ends with `TARGET`.
 * - If `TARGET` does not match the preceding text or `KIND` is unknown, the annotation is left
 *   unreplaced for downstream unsupported annotation stripping.
 */
export function replaceAozoraTargetBoutenInText(escapedText: string): string {
  if (!escapedText.includes("に") || !escapedText.includes("傍点］")) {
    return escapedText;
  }

  const annotationRegex = /［＃「([^」]+)」に([^］]+)］/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = annotationRegex.exec(escapedText)) !== null) {
    const fullMatch = match[0];
    const target = match[1];
    const kind = match[2];
    const matchIndex = match.index;

    const mark = getAozoraBoutenMark(kind);
    const currentPrefix = escapedText.slice(lastIndex, matchIndex);

    if (mark !== null && currentPrefix.endsWith(target)) {
      const prefixBeforeTarget = currentPrefix.slice(
        0,
        currentPrefix.length - target.length
      );
      const spanHtml =
        mark === "・"
          ? `<span class="aozora-bouten">${target}</span>`
          : `<span class="aozora-bouten" style="--aozora-bouten-mark: &#39;${mark}&#39;;">${target}</span>`;

      result += prefixBeforeTarget + spanHtml;
    } else {
      result += currentPrefix + fullMatch;
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  result += escapedText.slice(lastIndex);
  return result;
}
