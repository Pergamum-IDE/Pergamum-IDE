import rawTable from "./aozoraAccentDecompositionTable.json";

export interface AozoraAccentDecompositionEntry {
  readonly source: string;
  readonly replacement: string;
}

export const AOZORA_ACCENT_DECOMPOSITION_TABLE: readonly AozoraAccentDecompositionEntry[] =
  rawTable as readonly AozoraAccentDecompositionEntry[];

/**
 * Decodes accent-decomposed characters inside a single 〔...〕 body
 * using greedy longest-prefix matching.
 *
 * Aozora annotation blocks `［＃...］` or `※［＃...］` inside the body are passed
 * through untouched without applying accent conversion to their contents.
 * Unknown characters/patterns inside body are preserved verbatim.
 * The decoded string is normalized to NFC.
 */
export function decodeAozoraAccentDecomposedBody(body: string): string {
  if (!body) {
    return "";
  }

  let result = "";
  let i = 0;
  const max = body.length;

  while (i < max) {
    // Preserve Aozora annotations ［＃...］ / ※［＃...］ untouched inside body
    if (body.startsWith("［＃", i) || body.startsWith("※［＃", i)) {
      const noteEnd = body.indexOf("］", i);
      if (noteEnd !== -1) {
        result += body.slice(i, noteEnd + 1);
        i = noteEnd + 1;
        continue;
      }
    }

    let matched = false;

    for (let j = 0; j < AOZORA_ACCENT_DECOMPOSITION_TABLE.length; j++) {
      const entry = AOZORA_ACCENT_DECOMPOSITION_TABLE[j];
      if (body.startsWith(entry.source, i)) {
        result += entry.replacement;
        i += entry.source.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result += body[i];
      i += 1;
    }
  }

  return result.normalize("NFC");
}

/**
 * Parses input text and converts Aozora accent decomposition blocks `〔...〕`.
 *
 * Ignores `〔` and `〕` characters occurring inside Aozora annotation blocks `［＃...］` / `※［＃...］`.
 * Outer brackets `〔` and `〕` are removed from the decoded output.
 * Unclosed/malformed brackets do not throw and leave the remaining text intact.
 * Text outside `〔...〕` remains untouched.
 */
export function decodeAozoraAccentDecomposedText(input: string): string {
  if (!input || !input.includes("〔")) {
    return input;
  }

  let result = "";
  let pos = 0;
  const max = input.length;

  while (pos < max) {
    const openIndex = input.indexOf("〔", pos);
    if (openIndex === -1) {
      result += input.slice(pos);
      break;
    }

    // Find closing 〕, skipping any Aozora annotation blocks ［＃...］ / ※［＃...］
    let closeIndex = -1;
    let scan = openIndex + 1;

    while (scan < max) {
      if (input.startsWith("［＃", scan) || input.startsWith("※［＃", scan)) {
        const noteEnd = input.indexOf("］", scan);
        if (noteEnd !== -1) {
          scan = noteEnd + 1;
          continue;
        }
      }

      if (input[scan] === "〕") {
        closeIndex = scan;
        break;
      }
      scan++;
    }

    if (closeIndex === -1) {
      // Unclosed bracket: leave rest of text safe and non-throwing
      result += input.slice(pos);
      break;
    }

    // Append preceding text untouched
    result += input.slice(pos, openIndex);

    // Decode inner body
    const body = input.slice(openIndex + 1, closeIndex);
    result += decodeAozoraAccentDecomposedBody(body);

    pos = closeIndex + 1;
  }

  return result;
}
