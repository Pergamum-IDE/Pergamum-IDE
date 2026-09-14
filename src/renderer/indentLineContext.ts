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
  | "orderedListItem"
  | "nestedOrderedListItem"
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

  const orderedMatch = ORDERED_LIST_MARKER_PATTERN.exec(lineText);
  if (orderedMatch) {
    const markerIndent = leadingWhitespaceColumns(orderedMatch[1]);
    return markerIndent > 0 ? "nestedOrderedListItem" : "orderedListItem";
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
 * Calculates the content indent column of an ordered list item line.
 * For example:
 * - `"1. parent"` -> 3 (after `"1. "`)
 * - `"1) parent"` -> 3 (after `"1) "`)
 * - `"10. parent"` -> 4 (after `"10. "`)
 * - `"   1. child"` -> 6 (3 leading spaces + `"1. "`)
 */
export function getOrderedListContentColumn(lineText: string): number {
  const match = /^([ \t]*\d{1,9}[.)](?:[ \t]+|$))/.exec(lineText);
  if (!match) {
    return 3;
  }
  let columns = 0;
  for (const char of match[1]) {
    if (char === " ") {
      columns += 1;
    } else if (char === "\t") {
      columns += 4 - (columns % 4);
    } else {
      columns += 1;
    }
  }
  return columns;
}

export type ListIndentPlan =
  | { readonly canIndent: false }
  | { readonly canIndent: true; readonly insertSpaces: number };

/**
 * #465 / #470 remediation — checks whether a list item line (unordered or ordered)
 * has a preceding sibling candidate at the exact same indentation level
 * within the current list block context, and calculates the required indent spaces.
 */
export function canIndentListItem(doc: Text, line: Line): ListIndentPlan {
  const targetText = line.text;

  if (THEMATIC_BREAK_PATTERN.test(targetText)) {
    return { canIndent: false };
  }

  const unorderedMatch = UNORDERED_LIST_MARKER_PATTERN.exec(targetText);
  const orderedMatch = unorderedMatch
    ? null
    : ORDERED_LIST_MARKER_PATTERN.exec(targetText);

  if (!unorderedMatch && !orderedMatch) {
    return { canIndent: false };
  }

  const isUnordered = !!unorderedMatch;
  const targetPattern = isUnordered
    ? UNORDERED_LIST_MARKER_PATTERN
    : ORDERED_LIST_MARKER_PATTERN;
  const targetMatch = (unorderedMatch ?? orderedMatch)!;
  const targetIndent = leadingWhitespaceColumns(targetMatch[1]);

  let currentLineNumber = line.number - 1;
  while (currentLineNumber >= 1) {
    const prevLine = doc.line(currentLineNumber);
    const prevText = prevLine.text;

    if (
      BLANK_LINE_PATTERN.test(prevText) ||
      THEMATIC_BREAK_PATTERN.test(prevText)
    ) {
      return { canIndent: false };
    }

    const prevListMatch = targetPattern.exec(prevText);
    if (prevListMatch) {
      const prevIndent = leadingWhitespaceColumns(prevListMatch[1]);
      if (prevIndent === targetIndent) {
        if (isUnordered) {
          return { canIndent: true, insertSpaces: 2 };
        }
        const parentContentColumn = getOrderedListContentColumn(prevText);
        const insertSpaces = Math.max(1, parentContentColumn - targetIndent);
        return { canIndent: true, insertSpaces };
      }
      if (prevIndent < targetIndent) {
        return { canIndent: false };
      }
      currentLineNumber--;
      continue;
    }

    return { canIndent: false };
  }

  return { canIndent: false };
}

/**
 * #470 remediation — calculates how many leading spaces to remove when outdenting
 * a nested ordered list item, restoring it to the parent level.
 */
export function getOrderedListOutdentDeleteLength(
  doc: Text,
  line: Line
): number {
  const match = ORDERED_LIST_MARKER_PATTERN.exec(line.text);
  if (!match) {
    return 0;
  }

  const targetIndent = leadingWhitespaceColumns(match[1]);
  if (targetIndent === 0) {
    return 0;
  }

  let currentLineNumber = line.number - 1;
  while (currentLineNumber >= 1) {
    const prevLine = doc.line(currentLineNumber);
    const prevText = prevLine.text;

    if (
      BLANK_LINE_PATTERN.test(prevText) ||
      THEMATIC_BREAK_PATTERN.test(prevText)
    ) {
      break;
    }

    const prevMatch = ORDERED_LIST_MARKER_PATTERN.exec(prevText);
    if (prevMatch) {
      const prevIndent = leadingWhitespaceColumns(prevMatch[1]);
      if (prevIndent < targetIndent) {
        return Math.max(1, targetIndent - prevIndent);
      }
      currentLineNumber--;
      continue;
    }
    break;
  }

  return targetIndent;
}

export interface ParsedOrderedListMarker {
  readonly indentStr: string;
  readonly numberStr: string;
  readonly delimiter: string;
  readonly rest: string;
}

const ORDERED_LIST_MARKER_PARSE_PATTERN =
  /^([ \t]*)(\d{1,9})([.)])([ \t].*|$)/;

export function parseOrderedListMarker(
  lineText: string
): ParsedOrderedListMarker | null {
  const match = ORDERED_LIST_MARKER_PARSE_PATTERN.exec(lineText);
  if (!match) {
    return null;
  }
  return {
    indentStr: match[1],
    numberStr: match[2],
    delimiter: match[3],
    rest: match[4]
  };
}

export function renumberOrderedListLine(
  lineText: string,
  targetNumber: number
): string {
  const parsed = parseOrderedListMarker(lineText);
  if (!parsed) {
    return lineText;
  }
  return `${parsed.indentStr}${targetNumber}${parsed.delimiter}${parsed.rest}`;
}

/**
 * #470 remediation — local renumbering helper for ordered list items.
 * Identifies affected ordered list sibling runs in doc (given a map of
 * whitespace-adjusted line texts) and returns a map of line number -> final text.
 */
export function computeOrderedListLocalRenumbering(
  doc: Text,
  modifiedLines: Map<number, string>
): Map<number, string> {
  const finalLines = new Map<number, string>(modifiedLines);
  if (modifiedLines.size === 0) {
    return finalLines;
  }

  const getLineText = (lineNum: number): string => {
    return finalLines.get(lineNum) ?? doc.line(lineNum).text;
  };

  const candidateLineNums = new Set<number>();
  for (const lineNum of modifiedLines.keys()) {
    candidateLineNums.add(lineNum);
    if (lineNum > 1) {
      candidateLineNums.add(lineNum - 1);
    }
    if (lineNum < doc.lines) {
      candidateLineNums.add(lineNum + 1);
    }
  }

  const checkedRuns = new Set<number>();

  for (const lineNum of candidateLineNums) {
    const text = getLineText(lineNum);
    if (!ORDERED_LIST_MARKER_PATTERN.test(text)) {
      continue;
    }

    const indentCols = leadingWhitespaceColumns(text);

    let startLine = lineNum;
    while (startLine > 1) {
      const prevLineNum = startLine - 1;
      const prevText = getLineText(prevLineNum);

      if (
        BLANK_LINE_PATTERN.test(prevText) ||
        THEMATIC_BREAK_PATTERN.test(prevText)
      ) {
        break;
      }

      if (ORDERED_LIST_MARKER_PATTERN.test(prevText)) {
        const prevIndent = leadingWhitespaceColumns(prevText);
        if (prevIndent === indentCols) {
          startLine = prevLineNum;
          continue;
        }
        if (prevIndent > indentCols) {
          startLine = prevLineNum;
          continue;
        }
        break;
      }

      break;
    }

    if (checkedRuns.has(startLine)) {
      continue;
    }
    checkedRuns.add(startLine);

    let endLine = lineNum;
    const maxLine = doc.lines;
    while (endLine < maxLine) {
      const nextLineNum = endLine + 1;
      const nextText = getLineText(nextLineNum);

      if (
        BLANK_LINE_PATTERN.test(nextText) ||
        THEMATIC_BREAK_PATTERN.test(nextText)
      ) {
        break;
      }

      if (ORDERED_LIST_MARKER_PATTERN.test(nextText)) {
        const nextIndent = leadingWhitespaceColumns(nextText);
        if (nextIndent === indentCols) {
          endLine = nextLineNum;
          continue;
        }
        if (nextIndent > indentCols) {
          endLine = nextLineNum;
          continue;
        }
        break;
      }

      break;
    }

    const runLineNums: number[] = [];
    for (let n = startLine; n <= endLine; n++) {
      const curText = getLineText(n);
      if (
        ORDERED_LIST_MARKER_PATTERN.test(curText) &&
        leadingWhitespaceColumns(curText) === indentCols
      ) {
        runLineNums.push(n);
      }
    }

    if (runLineNums.length === 0) {
      continue;
    }

    let startNum = 1;
    if (indentCols === 0) {
      const firstText = getLineText(runLineNums[0]);
      const parsed = parseOrderedListMarker(firstText);
      if (parsed) {
        startNum = parseInt(parsed.numberStr, 10) || 1;
      }
    }

    runLineNums.forEach((lineN, idx) => {
      const curText = getLineText(lineN);
      const expectedNum = startNum + idx;
      const renumberedText = renumberOrderedListLine(curText, expectedNum);
      if (renumberedText !== curText) {
        finalLines.set(lineN, renumberedText);
      }
    });
  }

  return finalLines;
}

