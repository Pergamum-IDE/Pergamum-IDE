import type { Line, Text } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { isLineInsideFencedCodeBlock } from "./indentLineContext";

export interface MarkdownTableCell {
  readonly from: number;
  readonly to: number;
  readonly contentStartPos: number;
}

export interface MarkdownTableRow {
  readonly lineNumber: number;
  readonly isDelimiter: boolean;
  readonly cells: readonly MarkdownTableCell[];
}

export interface MarkdownTableBlock {
  readonly startLineNumber: number;
  readonly endLineNumber: number;
  readonly delimiterLineNumber: number;
  readonly dataRows: readonly MarkdownTableRow[];
}

/**
 * Checks whether a line text is a GFM table delimiter row (e.g. `| --- | --- |`).
 */
export function isMarkdownTableDelimiterRow(lineText: string): boolean {
  if (!lineText.includes("|")) {
    return false;
  }
  let trimmed = lineText.trim();
  if (trimmed.startsWith("|")) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.endsWith("|")) {
    trimmed = trimmed.slice(0, -1);
  }
  const parts = trimmed.split("|");
  if (parts.length === 0) {
    return false;
  }
  let hasDelimiterCell = false;
  for (const part of parts) {
    const cellText = part.trim();
    if (!/^:?-+:?$/.test(cellText)) {
      return false;
    }
    if (cellText.length > 0) {
      hasDelimiterCell = true;
    }
  }
  return hasDelimiterCell;
}

function createTableCell(
  lineFrom: number,
  lineText: string,
  start: number,
  end: number
): MarkdownTableCell {
  const from = lineFrom + start;
  const to = lineFrom + end;

  let rel = 0;
  while (
    start + rel < end &&
    (lineText[start + rel] === " " || lineText[start + rel] === "\t")
  ) {
    rel++;
  }

  let contentStartPos: number;
  if (start + rel < end) {
    contentStartPos = lineFrom + start + rel;
  } else {
    const spaceCount = end - start;
    if (spaceCount >= 1) {
      contentStartPos = lineFrom + start + 1;
    } else {
      contentStartPos = lineFrom + start;
    }
  }

  return { from, to, contentStartPos };
}

/**
 * Parses all cell spans in a single line of a Markdown pipe table.
 */
export function parseMarkdownTableRowCells(line: Line): MarkdownTableCell[] {
  const lineText = line.text;
  if (!lineText.includes("|")) {
    return [];
  }

  const pipeIndices: number[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === "|") {
      if (i === 0 || lineText[i - 1] !== "\\") {
        pipeIndices.push(i);
      }
    }
  }

  if (pipeIndices.length === 0) {
    return [];
  }

  const cells: MarkdownTableCell[] = [];

  if (pipeIndices[0] > 0 && lineText.slice(0, pipeIndices[0]).trim().length > 0) {
    cells.push(createTableCell(line.from, lineText, 0, pipeIndices[0]));
  }

  for (let i = 0; i < pipeIndices.length - 1; i++) {
    const cellStart = pipeIndices[i] + 1;
    const cellEnd = pipeIndices[i + 1];
    cells.push(createTableCell(line.from, lineText, cellStart, cellEnd));
  }

  const lastPipe = pipeIndices[pipeIndices.length - 1];
  if (lastPipe < lineText.length - 1 && lineText.slice(lastPipe + 1).trim().length > 0) {
    cells.push(createTableCell(line.from, lineText, lastPipe + 1, lineText.length));
  }

  return cells;
}

/**
 * Finds and parses a Markdown table block containing the given line number.
 * Returns `null` if the line is not part of a valid table (e.g. no delimiter row, or inside code fence).
 */
export function findMarkdownTableBlock(
  doc: Text,
  lineNum: number
): MarkdownTableBlock | null {
  if (lineNum < 1 || lineNum > doc.lines) {
    return null;
  }
  if (isLineInsideFencedCodeBlock(doc, lineNum)) {
    return null;
  }

  const targetLine = doc.line(lineNum);
  if (!targetLine.text.includes("|")) {
    return null;
  }

  // Search contiguous pipe lines upwards
  let startLine = lineNum;
  while (startLine > 1) {
    const prevLineNum = startLine - 1;
    if (isLineInsideFencedCodeBlock(doc, prevLineNum)) {
      break;
    }
    const prevLine = doc.line(prevLineNum);
    if (!prevLine.text.includes("|")) {
      break;
    }
    startLine = prevLineNum;
  }

  // Search contiguous pipe lines downwards
  let endLine = lineNum;
  while (endLine < doc.lines) {
    const nextLineNum = endLine + 1;
    if (isLineInsideFencedCodeBlock(doc, nextLineNum)) {
      break;
    }
    const nextLine = doc.line(nextLineNum);
    if (!nextLine.text.includes("|")) {
      break;
    }
    endLine = nextLineNum;
  }

  // Find delimiter row in block
  let delimiterLineNumber = -1;
  for (let n = startLine; n <= endLine; n++) {
    if (isMarkdownTableDelimiterRow(doc.line(n).text)) {
      delimiterLineNumber = n;
      break;
    }
  }

  if (delimiterLineNumber === -1) {
    return null; // Not a table without a delimiter row
  }

  // Build rows
  const dataRows: MarkdownTableRow[] = [];
  for (let n = startLine; n <= endLine; n++) {
    const isDelimiter = n === delimiterLineNumber;
    const line = doc.line(n);
    const cells = parseMarkdownTableRowCells(line);
    if (!isDelimiter) {
      dataRows.push({
        lineNumber: n,
        isDelimiter: false,
        cells
      });
    }
  }

  return {
    startLineNumber: startLine,
    endLineNumber: endLine,
    delimiterLineNumber,
    dataRows
  };
}

/**
 * Attempts table cell navigation for `Tab` (`direction = "next"`) or `Shift+Tab` (`direction = "previous"`).
 *
 * - Returns `false` when selection/cursor is not in a table (or code fence / multi-cursor / multi-row selection),
 *   allowing fallback to standard indent/outdent.
 * - Returns `true` when in a table cell (or table boundary/delimiter row), dispatching selection movement when
 *   valid target exists, or performing a no-op (no doc change, no cursor move) at table boundary or delimiter row.
 */
export function tryNavigateTableCell(
  view: EditorView,
  direction: "next" | "previous"
): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1) {
    return false;
  }

  const range = state.selection.main;
  const headLine = state.doc.lineAt(range.head);
  const anchorLine = state.doc.lineAt(range.anchor);
  if (headLine.number !== anchorLine.number) {
    return false;
  }

  const block = findMarkdownTableBlock(state.doc, headLine.number);
  if (!block) {
    return false;
  }

  // Delimiter row: handled = true, no cursor move, no text edit
  if (headLine.number === block.delimiterLineNumber) {
    return true;
  }

  const currentDataRowIndex = block.dataRows.findIndex(
    (row) => row.lineNumber === headLine.number
  );
  if (currentDataRowIndex === -1) {
    return true;
  }

  const currentRow = block.dataRows[currentDataRowIndex];
  const cells = currentRow.cells;
  if (cells.length === 0) {
    return true;
  }

  const headCellIdx = cells.findIndex(
    (c) => range.head >= c.from && range.head <= c.to
  );
  const anchorCellIdx = cells.findIndex(
    (c) => range.anchor >= c.from && range.anchor <= c.to
  );

  if (headCellIdx === -1 || anchorCellIdx === -1 || headCellIdx !== anchorCellIdx) {
    return false;
  }

  const currentCellIdx = headCellIdx;
  let targetRowIndex = currentDataRowIndex;
  let targetCellIdx = currentCellIdx;

  if (direction === "next") {
    if (currentCellIdx + 1 < cells.length) {
      targetCellIdx = currentCellIdx + 1;
    } else if (currentDataRowIndex + 1 < block.dataRows.length) {
      targetRowIndex = currentDataRowIndex + 1;
      targetCellIdx = 0;
    } else {
      // Table final cell Tab -> boundary reached, no-op
      return true;
    }
  } else {
    // direction === "previous"
    if (currentCellIdx > 0) {
      targetCellIdx = currentCellIdx - 1;
    } else if (currentDataRowIndex > 0) {
      targetRowIndex = currentDataRowIndex - 1;
      targetCellIdx = block.dataRows[currentDataRowIndex - 1].cells.length - 1;
    } else {
      // Table first cell Shift+Tab -> boundary reached, no-op
      return true;
    }
  }

  const targetCell = block.dataRows[targetRowIndex]?.cells[targetCellIdx];
  if (!targetCell) {
    return true;
  }

  view.dispatch({
    selection: EditorSelection.single(targetCell.contentStartPos),
    scrollIntoView: true
  });
  return true;
}
