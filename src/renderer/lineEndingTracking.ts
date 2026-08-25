/**
 * #253: pure (CodeMirror-agnostic) line-ending kind tracking helpers.
 *
 * CodeMirror normalizes every line break to a single logical break and
 * always joins with "\n" when serializing (`Text.toString()`) — the CM
 * maintainers have said this is permanent, not a bug to route around
 * (https://discuss.codemirror.net/t/add-the-ability-to-have-both-crlf-and-lf/9869).
 * So Pergamum owns the "what was this specific line break originally" fact
 * as its own metadata, entirely separate from what CodeMirror's `Text`
 * holds. This module has no CodeMirror imports — it only knows about plain
 * strings and positions, so it can be tested directly and reused by the CM
 * integration layer (see editorLineEndingField.ts) without dragging
 * `@codemirror/state` into every test.
 *
 * Line ending is treated as a property of the *break between* two lines,
 * not of a line itself (per #253) — EOF is never a 4th "kind", and a
 * document with N breaks has N+1 lines.
 */

export type LineEndingKind = "lf" | "crlf" | "cr";

/**
 * A single line break's kind, at `position` in CodeMirror's *normalized*
 * coordinate space — i.e. the position it would have once the raw text
 * becomes a CM `Text` (every break, however many raw characters it was,
 * occupies exactly one position). This is NOT a raw-string offset.
 */
export interface LineEndingBreak {
  readonly position: number;
  readonly kind: LineEndingKind;
}

const lineBreakPattern = /\r\n|\r|\n/g;

function kindOfMatch(match: string): LineEndingKind {
  if (match === "\r\n") {
    return "crlf";
  }

  return match === "\r" ? "cr" : "lf";
}

/**
 * Scans raw content (as read from disk, before it ever becomes a
 * CodeMirror `Text`) once, producing one entry per line break with its
 * kind and its position in the post-normalization coordinate space. This
 * is the only place a whole-document line-ending scan happens — it runs
 * once when a document is opened (or a fresh untitled document is
 * created), never per keystroke.
 */
export function analyzeLineEndings(
  rawContent: string
): readonly LineEndingBreak[] {
  const breaks: LineEndingBreak[] = [];
  let normalizedPosition = 0;
  let rawCursor = 0;
  lineBreakPattern.lastIndex = 0;

  let match = lineBreakPattern.exec(rawContent);
  while (match !== null) {
    normalizedPosition += match.index - rawCursor;
    breaks.push({ position: normalizedPosition, kind: kindOfMatch(match[0]) });
    normalizedPosition += 1;
    rawCursor = match.index + match[0].length;
    match = lineBreakPattern.exec(rawContent);
  }

  return breaks;
}

/**
 * Converts raw file content to the same "\n"-only text CodeMirror's `Text`
 * would normalize it to. `CurrentDocument.content`/`savedContent` must be
 * this normalized form from the moment a document is opened — not the raw
 * bytes — because `analyzeLineEndings`'s break positions and
 * `serializeLineEndings`'s `content` parameter are both defined in this
 * normalized coordinate space. Storing raw content there would silently
 * misalign break positions against the wrong string on any operation that
 * reads `content` before the editor's own onChange has ever fired (e.g.
 * Save As on a file that was opened but never edited).
 */
export function normalizeLineEndings(rawContent: string): string {
  return rawContent.replace(/\r\n|\r/g, "\n");
}

function terminatorFor(kind: LineEndingKind): string {
  switch (kind) {
    case "lf":
      return "\n";
    case "crlf":
      return "\r\n";
    case "cr":
      return "\r";
  }
}

/**
 * Combines canonical (CodeMirror-normalized, "\n"-only) `content` with the
 * tracked per-break kinds to reconstruct the byte string that should be
 * written to disk. `breaks` must be sorted by position and use positions
 * in `content`'s own coordinate space (each break replaces exactly the
 * single "\n" character at its position). Only ever called at save time —
 * never per keystroke.
 */
export function serializeLineEndings(
  content: string,
  breaks: readonly LineEndingBreak[]
): string {
  if (breaks.length === 0) {
    return content;
  }

  const parts: string[] = [];
  let cursor = 0;

  for (const lineBreak of breaks) {
    parts.push(content.slice(cursor, lineBreak.position));
    parts.push(terminatorFor(lineBreak.kind));
    cursor = lineBreak.position + 1;
  }

  parts.push(content.slice(cursor));

  return parts.join("");
}
