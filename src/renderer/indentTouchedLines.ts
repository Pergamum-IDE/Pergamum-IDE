/**
 * #463 — extracts the set of document lines "touched" by the current
 * selection, for the `Mod+]` / `Mod+[` indent / outdent command foundation.
 *
 * The walk and its boundary rule are deliberately the SAME algorithm
 * CodeMirror's own built-in `indentMore` / `indentLess` use internally
 * (`changeBySelectedLine` in `@codemirror/commands`) - not reimplemented
 * from scratch, but reproduced here as a small, independently testable,
 * pure helper so `indentCommands.ts` can classify and dispatch per line
 * without depending on `@codemirror/commands`' internal (unexported)
 * function.
 *
 * The one boundary case worth calling out (ADR-0014 / Issue #463: "selection
 * 終端が行頭にある場合の扱いは、既存エディタ慣習に合わせる"): when a
 * selection's end sits EXACTLY at the start of a line (the selection
 * touches that line's boundary but does not extend into its content - the
 * common "select through the trailing newline" shape), that line is NOT
 * included. Only lines the selection actually extends into are touched.
 */

import type { EditorState, SelectionRange } from "@codemirror/state";
import type { Line } from "@codemirror/state";

function touchedLinesForRange(
  state: EditorState,
  range: SelectionRange,
  into: Map<number, Line>
): void {
  let lastIncludedLineNumber = -1;
  let pos = range.from;

  while (pos <= range.to) {
    const line = state.doc.lineAt(pos);
    const selectionExtendsIntoLine = range.empty || range.to > line.from;

    if (line.number > lastIncludedLineNumber && selectionExtendsIntoLine) {
      into.set(line.number, line);
      lastIncludedLineNumber = line.number;
    }

    // Jump to the start of the next line - `line.to` is the offset just
    // before its line break (or the doc end for the last line).
    pos = line.to + 1;
  }
}

/**
 * Every line touched by the current selection: for a plain cursor, the
 * line it sits on; for a selection, every line it extends into (see the
 * module doc comment for the exact boundary rule); for multiple selection
 * ranges (multi-cursor), the union of all of them, deduplicated, returned
 * in ascending document order.
 */
export function extractTouchedLines(state: EditorState): readonly Line[] {
  const linesByNumber = new Map<number, Line>();

  for (const range of state.selection.ranges) {
    touchedLinesForRange(state, range, linesByNumber);
  }

  return Array.from(linesByNumber.keys())
    .sort((a, b) => a - b)
    .map((lineNumber) => linesByNumber.get(lineNumber)!);
}
