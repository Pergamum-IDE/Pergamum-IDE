import gaijiMapData from "../../../assets/datasets/x0213/aozora-gaiji-map.json";

const gaijiMap: Record<string, string> = gaijiMapData;

/**
 * Resolves a JIS X 0213 men-ku-ten code (e.g. "1-14-2", "2-1-1") to its Unicode string,
 * or null if the code is not in the map.
 */
export function resolveAozoraGaiji(code: string): string | null {
  return gaijiMap[code] ?? null;
}

/**
 * Replaces Aozora gaiji annotations (`※［＃...］`) containing a JIS X 0213 men-ku-ten code
 * with the corresponding mapped Unicode character sequence.
 *
 * Supported patterns inside `※［＃...］`:
 * - `※［＃...、第2水準1-48-1］`
 * - `※［＃...、第3水準1-14-2］`
 * - `※［＃...、第4水準2-1-1］`
 * - `※［＃...、1-14-2］`
 *
 * If a men-ku-ten code is present and found in the dataset map, the entire `※［＃...］`
 * annotation is replaced with the mapped Unicode string.
 * If the code is unknown or no men-ku-ten code is present (e.g. descriptive-only),
 * the annotation is left unreplaced for downstream unsupported annotation stripping.
 */
export function replaceAozoraGaijiInText(rawText: string): string {
  if (!rawText.includes("※［＃")) {
    return rawText;
  }

  return rawText.replace(/※［＃([^］]+)］/g, (fullMatch, annotationBody: string) => {
    // Extract men-ku-ten codes (e.g. "1-14-2", "2-1-1").
    // If multiple codes appear inside the annotation, use the last one.
    const matches = annotationBody.match(/[12]-\d{1,2}-\d{1,2}/g);
    if (!matches || matches.length === 0) {
      return fullMatch;
    }

    const code = matches[matches.length - 1];
    const resolved = resolveAozoraGaiji(code);
    if (resolved !== null) {
      return resolved;
    }

    return fullMatch;
  });
}
