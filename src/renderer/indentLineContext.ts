/**
 * #463 — the minimal, per-line Markdown context classifier that backs the
 * `Mod+]` / `Mod+[` indent / outdent command foundation (see ADR-0014,
 * decision 3: "文脈ディスパッチは「キー」ではなく「コマンド」に属する").
 *
 * This classifies a SINGLE line's own text, without looking at neighboring
 * lines or a syntax tree. That is a deliberate simplification for this
 * issue - real list nesting, blockquote nesting, and fenced-code membership
 * all genuinely depend on multi-line document context (what block the line
 * continues), which real `list sink / lift`, `blockquote indent/outdent`,
 * and `fenced code block indent` implementations will need to resolve
 * properly. Until those land, `indentCommands.ts` treats every non-trivial
 * context as a no-op, so an imprecise classification here never corrupts
 * document content - it only affects which `IndentNoopReason` is reported.
 *
 * `nestedListItem` is approximated by an ABSOLUTE indentation-column
 * threshold ({@link NESTED_LIST_INDENT_THRESHOLD}), not by the parent
 * marker's actual content column (ADR-0014 decision 5's table: `- ` = 2,
 * `1. ` = 3, `10. ` = 4, ...). A real list sink/lift implementation will
 * need the true parent content column, which requires walking back through
 * the document; this classifier does not attempt that.
 *
 * Fenced code block membership is NOT detected here (it requires tracking
 * an open/close fence across lines, or a syntax tree lookup). A line
 * physically inside a fence is classified by whatever it happens to match
 * on its own text (most commonly `unsupportedContext` or `topLevelParagraph`)
 * - harmless today since indent/outdent inside a fence is unimplemented
 * either way, but NOT a correctness guarantee for future callers.
 *
 * This classifier does NOT perform any Unicode normalization (no `.normalize()`,
 * NFC or NFKC, anywhere in this file) and never will - matching ADR-0004's
 * non-destructive principle and ADR-0014 決定7's treatment of U+3000 as an
 * ordinary body character, not CommonMark whitespace/indentation. For the
 * same reason, "blank" and indentation-column counting below check ONLY the
 * ASCII space (U+0020) and tab (U+0009) CommonMark itself recognizes - never
 * `String.prototype.trim()` (which strips a much broader set of Unicode
 * whitespace, U+3000 included, and would silently treat a line of nothing
 * but Japanese paragraph-indent characters as blank).
 *
 * Thematic-break detection runs BEFORE list-marker detection: CommonMark
 * itself resolves a line that could be read as either (`- - -`, `* * *`,
 * `_ _ _`) in favor of the thematic break, and `THEMATIC_BREAK_PATTERN`
 * below already accepts the space-separated forms - moving the check
 * earlier is the only change needed to honor that priority.
 */

import type { Line, Text } from "@codemirror/state";

export type LineContext =
  | "blank"
  | "topLevelParagraph"
  | "listItem"
  | "nestedListItem"
  | "blockquote"
  | "indentedCode"
  | "unsupportedContext";

/** CommonMark's own blank-line definition: nothing, or only ASCII spaces /
 *  tabs. Deliberately NOT `String.prototype.trim()` - see the module doc
 *  comment (U+3000 and other Unicode whitespace must not count). */
const BLANK_LINE_PATTERN = /^[ \t]*$/;

/** CommonMark bullet (`-`, `*`, `+`) list marker (including task lists),
 *  optionally indented, followed by whitespace or end-of-line (an "empty"
 *  list item marker with nothing after it is still a list item). */
const UNORDERED_LIST_MARKER_PATTERN = /^([ \t]*)(?:[-*+])(?:[ \t]+|$)/;

/** Ordered (`1.` / `1)`) list marker. Unsupported in #465 (treated as
 *  unsupportedContext). */
const ORDERED_LIST_MARKER_PATTERN = /^([ \t]*)\d{1,9}[.)](?:[ \t]+|$)/;

/** Up to 3 leading spaces, then `>` (CommonMark blockquote marker). */
const BLOCKQUOTE_PATTERN = /^ {0,3}>/;

/** Up to 3 leading spaces, then 1-6 `#`, then whitespace or end-of-line
 *  (ATX heading). Explicitly excluded from `topLevelParagraph` - ADR-0014
 *  lists heading lines as an example "unsupported context". */
const HEADING_PATTERN = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/** Up to 3 leading spaces, then 3+ of the same thematic-break character
 *  (optionally space-separated). Also unsupported per ADR-0014. */
const THEMATIC_BREAK_PATTERN =
  /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;

/** A conservative "this looks like the start of an HTML block" check - not
 *  a full HTML-block-start-condition parser, just enough to keep an obvious
 *  `<div>` / `<!--` line out of `topLevelParagraph`. */
const HTML_BLOCK_START_PATTERN = /^ {0,3}<[a-zA-Z!/?]/;

/** Leading-whitespace columns at or above this, with no other structural
 *  marker, make a non-blank line an indented code block (CommonMark: 4
 *  columns at the top level). */
const INDENTED_CODE_THRESHOLD = 4;

/** Tabs count as advancing to the next multiple of 4 columns (CommonMark's
 *  tab-stop-4 rule for block structure - see ADR-0014's Context section). */
function leadingWhitespaceColumns(lineText: string): number {
  let columns = 0;
  for (const character of lineText) {
    if (character === " ") {
      columns += 1;
    } else if (character === "\t") {
      columns += 4 - (columns % 4);
    } else {
      break;
    }
  }
  return columns;
}

/**
 * Classify a single line's Markdown context from its own text. Pure,
 * synchronous, and total (every input produces exactly one `LineContext`).
 */
export function classifyLine(lineText: string): LineContext {
  if (BLANK_LINE_PATTERN.test(lineText)) {
    return "blank";
  }

  // Checked before the list marker: CommonMark resolves a line that could
  // be read as either a thematic break or a list-bullet run (`- - -`,
  // `* * *`, `_ _ _`) in favor of the thematic break.
  if (THEMATIC_BREAK_PATTERN.test(lineText)) {
    return "unsupportedContext";
  }

  const listMatch = UNORDERED_LIST_MARKER_PATTERN.exec(lineText);
  if (listMatch) {
    const markerIndent = leadingWhitespaceColumns(listMatch[1]);
    return markerIndent > 0 ? "nestedListItem" : "listItem";
  }

  if (ORDERED_LIST_MARKER_PATTERN.test(lineText)) {
    return "unsupportedContext";
  }

  if (BLOCKQUOTE_PATTERN.test(lineText)) {
    return "blockquote";
  }

  if (
    HEADING_PATTERN.test(lineText) ||
    HTML_BLOCK_START_PATTERN.test(lineText)
  ) {
    return "unsupportedContext";
  }

  if (leadingWhitespaceColumns(lineText) >= INDENTED_CODE_THRESHOLD) {
    return "indentedCode";
  }

  return "topLevelParagraph";
}

/**
 * #465 remediation — checks whether an unordered list / task list item line
 * has a preceding sibling candidate at the exact same indentation level
 * within the current list block context.
 *
 * Rules:
 * - Target line must match UNORDERED_LIST_MARKER_PATTERN (and not be a thematic break).
 * - Target line indent column is `targetIndent`.
 * - Search backwards line by line:
 *   - Blank line or thematic break -> stop, return false.
 *   - Unordered list item:
 *     - prevIndent === targetIndent -> return true (found preceding sibling at same level).
 *     - prevIndent < targetIndent -> return false (reached shallower parent level).
 *     - prevIndent > targetIndent -> deeper child of a previous item, continue searching backwards.
 *   - Any other line (ordered list, paragraph, blockquote, heading, indentedCode, etc.) -> stop, return false.
 */
export function canIndentListItem(doc: Text, line: Line): boolean {
  const targetText = line.text;

  if (THEMATIC_BREAK_PATTERN.test(targetText)) {
    return false;
  }

  const targetMatch = UNORDERED_LIST_MARKER_PATTERN.exec(targetText);
  if (!targetMatch) {
    return false;
  }

  const targetIndent = leadingWhitespaceColumns(targetMatch[1]);

  let currentLineNumber = line.number - 1;
  while (currentLineNumber >= 1) {
    const prevLine = doc.line(currentLineNumber);
    const prevText = prevLine.text;

    if (
      BLANK_LINE_PATTERN.test(prevText) ||
      THEMATIC_BREAK_PATTERN.test(prevText)
    ) {
      return false;
    }

    const prevListMatch = UNORDERED_LIST_MARKER_PATTERN.exec(prevText);
    if (prevListMatch) {
      const prevIndent = leadingWhitespaceColumns(prevListMatch[1]);
      if (prevIndent === targetIndent) {
        return true;
      }
      if (prevIndent < targetIndent) {
        return false;
      }
      currentLineNumber--;
      continue;
    }

    return false;
  }

  return false;
}
