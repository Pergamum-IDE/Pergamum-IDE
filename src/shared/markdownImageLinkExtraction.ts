/**
 * #411: extract inline Markdown image links (`![alt](dest "title")`) from
 * document source text, with the character range of the *destination* so a
 * CodeMirror diagnostic can underline exactly the link path.
 *
 * This is a deliberately small hand scanner rather than a full CommonMark
 * parse: the diagnostics feature only needs project-local image links, and it
 * needs their `src` offsets, which markdown-it's inline tokens do not carry.
 * It is shared by the renderer (the CodeMirror linter source) and the tests.
 *
 * What it recognizes:
 *   - `![](dest)`, `![alt](dest)`, `![alt](dest "title")` / `'title'` /
 *     `(title)`
 *   - angle-bracketed destinations `![](<dest with spaces>)`, including
 *     non-ASCII (`![](<素材/挿絵 01.png>)`)
 *   - one level of `[...]` nesting in the alt text, and backslash escapes
 *
 * What it deliberately skips:
 *   - fenced code blocks (``` / ~~~) and inline code spans
 *   - a backslash-escaped `\![`
 *   - reference-style images `![alt][ref]` (no inline destination)
 *   - raw HTML `<img>` (never starts with `![`)
 *
 * Known PoC limitation: a single image link whose `](` … `)` is split across
 * source lines is not matched. Authored image links are effectively always on
 * one line.
 *
 * External / non-file destinations (`http:`, `https:`, `data:`, `blob:`,
 * `mailto:`, protocol-relative `//host`, bare `#fragment`) and empty
 * destinations are filtered out by {@link extractProjectLocalImageLinks}; the
 * lower-level {@link scanMarkdownImageLinks} returns every inline image link it
 * finds.
 */

import { isExternalImageSrc } from "./projectLocalImageLink";

export interface MarkdownImageLinkMatch {
  /** The destination exactly as authored (angle brackets stripped, not
   *  URI-decoded — the source text has not been through markdown-it). */
  readonly src: string;
  /** Start offset of the destination text in the document (inclusive). */
  readonly from: number;
  /** End offset of the destination text in the document (exclusive). */
  readonly to: number;
}

const FENCE_LINE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** `[start, end)` document ranges that lie inside a fenced code block. */
function fencedCodeRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  let openMarker: string | null = null;
  let openStart = 0;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineStart = offset;
    // +1 for the "\n" that split() removed (harmless for the last line).
    offset += line.length + 1;

    const match = FENCE_LINE_PATTERN.exec(line);
    if (openMarker === null) {
      if (
        match &&
        // An opening ``` fence's info string must not contain a backtick.
        !(match[1][0] === "`" && match[2].includes("`"))
      ) {
        openMarker = match[1];
        openStart = lineStart;
      }
      continue;
    }

    const isClosing =
      match !== null &&
      match[1][0] === openMarker[0] &&
      match[1].length >= openMarker.length &&
      match[2].trim().length === 0;
    if (isClosing) {
      ranges.push([openStart, offset]);
      openMarker = null;
    }
  }

  if (openMarker !== null) {
    ranges.push([openStart, source.length]);
  }
  return ranges;
}

function isInsideAnyRange(
  ranges: readonly (readonly [number, number])[],
  position: number
): number {
  for (const [start, end] of ranges) {
    if (position >= start && position < end) {
      return end;
    }
  }
  return -1;
}

interface ParsedImageLink {
  readonly src: string;
  readonly from: number;
  readonly to: number;
  /** Offset just past the closing `)`. */
  readonly end: number;
}

/** Parse one `![ ... ]( ... )` starting at `start` (which points at `!`). */
function parseImageLinkAt(
  source: string,
  start: number
): ParsedImageLink | null {
  // "!["
  if (source[start] !== "!" || source[start + 1] !== "[") {
    return null;
  }

  // Alt text — up to the matching "]" on the same line, one level of "[]"
  // nesting, backslash escapes honored.
  let index = start + 2;
  let depth = 1;
  while (index < source.length) {
    const ch = source[index];
    if (ch === "\n") {
      return null;
    }
    if (ch === "\\") {
      index += 2;
      continue;
    }
    if (ch === "[") {
      depth += 1;
    } else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    index += 1;
  }
  if (depth !== 0 || source[index] !== "]") {
    return null;
  }

  // CommonMark requires "]" and "(" to be adjacent for an inline link.
  if (source[index + 1] !== "(") {
    return null;
  }
  index += 2;

  // Optional inline whitespace (no newline for this PoC).
  while (index < source.length && (source[index] === " " || source[index] === "\t")) {
    index += 1;
  }

  let src: string;
  let from: number;
  let to: number;

  if (source[index] === "<") {
    // Angle-bracketed destination: everything up to the next unescaped ">",
    // no newline allowed.
    const contentStart = index + 1;
    let cursor = contentStart;
    while (cursor < source.length) {
      const ch = source[cursor];
      if (ch === "\n") {
        return null;
      }
      if (ch === "\\") {
        cursor += 2;
        continue;
      }
      if (ch === ">") {
        break;
      }
      cursor += 1;
    }
    if (source[cursor] !== ">") {
      return null;
    }
    from = contentStart;
    to = cursor;
    src = source.slice(contentStart, cursor);
    index = cursor + 1;
  } else {
    // Bare destination: up to the first whitespace or ")". (Balanced-paren
    // destinations are not supported by this PoC scanner.)
    const contentStart = index;
    while (index < source.length) {
      const ch = source[index];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === ")" || ch === "(") {
        break;
      }
      if (ch === "\\") {
        index += 2;
        continue;
      }
      index += 1;
    }
    from = contentStart;
    to = index;
    src = source.slice(contentStart, index);
  }

  // Optional whitespace + title, then the closing ")".
  while (
    index < source.length &&
    (source[index] === " " || source[index] === "\t" || source[index] === "\n")
  ) {
    index += 1;
  }
  const titleOpener = source[index];
  if (titleOpener === '"' || titleOpener === "'" || titleOpener === "(") {
    const titleCloser = titleOpener === "(" ? ")" : titleOpener;
    index += 1;
    while (index < source.length && source[index] !== titleCloser) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      index += 1;
    }
    if (source[index] !== titleCloser) {
      return null;
    }
    index += 1;
    while (
      index < source.length &&
      (source[index] === " " || source[index] === "\t" || source[index] === "\n")
    ) {
      index += 1;
    }
  }

  if (source[index] !== ")") {
    return null;
  }

  return { src, from, to, end: index + 1 };
}

/**
 * Every inline Markdown image link in `source`, in document order, with the
 * character range of its destination. Fenced code blocks and inline code
 * spans are skipped.
 */
export function scanMarkdownImageLinks(
  source: string
): MarkdownImageLinkMatch[] {
  const matches: MarkdownImageLinkMatch[] = [];
  const codeRanges = fencedCodeRanges(source);

  let index = 0;
  while (index < source.length) {
    const skipTo = isInsideAnyRange(codeRanges, index);
    if (skipTo !== -1) {
      index = skipTo;
      continue;
    }

    const ch = source[index];
    if (ch === "\\") {
      index += 2;
      continue;
    }
    if (ch === "`") {
      let run = 0;
      while (source[index + run] === "`") {
        run += 1;
      }
      let cursor = index + run;
      let closed = false;
      while (cursor <= source.length - run) {
        if (source[cursor] === "`") {
          let closeRun = 0;
          while (source[cursor + closeRun] === "`") {
            closeRun += 1;
          }
          if (closeRun === run) {
            closed = true;
            index = cursor + run;
            break;
          }
          cursor += closeRun;
          continue;
        }
        cursor += 1;
      }
      if (!closed) {
        index += run;
      }
      continue;
    }

    if (ch === "!" && source[index + 1] === "[") {
      const parsed = parseImageLinkAt(source, index);
      if (parsed) {
        matches.push({ src: parsed.src, from: parsed.from, to: parsed.to });
        index = parsed.end;
        continue;
      }
    }

    index += 1;
  }

  return matches;
}

/**
 * The subset of {@link scanMarkdownImageLinks} that is a *project-local*
 * candidate: a non-empty destination that is not an external URL, not
 * protocol-relative, not a bare fragment, and not `data:` / `blob:`. Shape
 * checks (backslash, drive letter, `..` escape, unsupported extension) are
 * left to the classifier; this only removes links that must never produce a
 * diagnostic.
 */
export function extractProjectLocalImageLinks(
  source: string
): MarkdownImageLinkMatch[] {
  return scanMarkdownImageLinks(source).filter((match) => {
    const trimmed = match.src.trim();
    return trimmed.length > 0 && !isExternalImageSrc(trimmed);
  });
}
