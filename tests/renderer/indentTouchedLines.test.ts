import { indentLess, indentMore } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type Transaction
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { extractTouchedLines } from "../../src/renderer/indentTouchedLines";

function stateWithSelection(
  doc: string,
  selection: EditorState["selection"]
): EditorState {
  // Multiple selection ranges are collapsed to just the main one unless
  // this facet is enabled - matches `createMarkdownEditorBaseSetup`'s own
  // `EditorState.allowMultipleSelections.of(true)`.
  return EditorState.create({
    doc,
    selection,
    extensions: [EditorState.allowMultipleSelections.of(true)]
  });
}

function lineNumbers(state: EditorState): number[] {
  return extractTouchedLines(state).map((line) => line.number);
}

describe("extractTouchedLines (#463)", () => {
  const doc = "one\ntwo\nthree\nfour\nfive";
  // Offsets: "one\n"=0-3(\n@3) "two\n"=4-7(\n@7) "three\n"=8-13(\n@13)
  // "four\n"=14-18(\n@18) "five"=19-22
  const lineStart = { 1: 0, 2: 4, 3: 8, 4: 14, 5: 19 };

  it("cursor only -> the current line", () => {
    const state = stateWithSelection(doc, EditorSelection.single(lineStart[2] + 1));
    expect(lineNumbers(state)).toEqual([2]);
  });

  it("cursor only, positioned exactly at a line's head (offset === line.from) -> that line, not the previous one", () => {
    // An empty selection always includes "its" line - this is the case an
    // empty selection is judged purely by `range.empty`, unlike a
    // non-empty selection whose END sits at the same offset (see the
    // "excludes that line" test below, which is the DIFFERENT case).
    const state = stateWithSelection(doc, EditorSelection.single(lineStart[3]));
    expect(lineNumbers(state)).toEqual([3]);
  });

  it("single-line selection -> that line", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.single(lineStart[2], lineStart[2] + 2)
    );
    expect(lineNumbers(state)).toEqual([2]);
  });

  it("multi-line selection -> every line it extends into", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.single(lineStart[2] + 1, lineStart[4] + 1)
    );
    expect(lineNumbers(state)).toEqual([2, 3, 4]);
  });

  it("a selection ending exactly at the NEXT line's head excludes that line", () => {
    // From inside line 2 to exactly the start of line 3 (i.e. selecting
    // "wo\n" - through the trailing newline, but not into line 3's text).
    const state = stateWithSelection(
      doc,
      EditorSelection.single(lineStart[2] + 1, lineStart[3])
    );
    expect(lineNumbers(state)).toEqual([2]);
  });

  it("a selection ending one character INTO the next line includes it", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.single(lineStart[2] + 1, lineStart[3] + 1)
    );
    expect(lineNumbers(state)).toEqual([2, 3]);
  });

  it("multiple selection ranges touching the same line are deduplicated", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.create([
        EditorSelection.range(lineStart[2], lineStart[2] + 1),
        EditorSelection.range(lineStart[2] + 2, lineStart[2] + 3)
      ])
    );
    expect(lineNumbers(state)).toEqual([2]);
  });

  it("multiple selection ranges (multi-cursor) on different lines are combined, sorted, and deduplicated", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.create(
        [
          EditorSelection.cursor(lineStart[4] + 1),
          EditorSelection.cursor(lineStart[1] + 1),
          EditorSelection.range(lineStart[3], lineStart[3] + 2)
        ],
        0
      )
    );
    expect(lineNumbers(state)).toEqual([1, 3, 4]);
  });

  it("returns Line objects with the expected text", () => {
    const state = stateWithSelection(doc, EditorSelection.single(lineStart[3] + 1));
    const [line] = extractTouchedLines(state);
    expect(line.number).toBe(3);
    expect(line.text).toBe("three");
  });

  it("a selection spanning the whole document touches every line", () => {
    const state = stateWithSelection(
      doc,
      EditorSelection.single(0, doc.length)
    );
    expect(lineNumbers(state)).toEqual([1, 2, 3, 4, 5]);
  });

  it("an empty document has exactly one (blank) touched line", () => {
    const state = stateWithSelection("", EditorSelection.single(0));
    expect(lineNumbers(state)).toEqual([1]);
  });
});

/**
 * The tests above assert hand-computed expectations against hand-computed
 * offsets, which a reviewer flagged as a risk: since this module's own doc
 * comment says it reproduces `@codemirror/commands`' internal
 * `changeBySelectedLine` boundary rule, a test author who mis-derived that
 * rule could write matching-but-wrong expectations into both the
 * implementation and the test.
 *
 * This section removes that risk by using CodeMirror's OWN built-in
 * `indentMore` / `indentLess` - code this module does not implement, does
 * not import, and cannot have copied a bug from - as an independent oracle.
 * For each selection shape, the set of lines `indentMore` actually inserted
 * into is compared against `extractTouchedLines`' result for the exact
 * same state: if they never agree, `extractTouchedLines` does not really
 * reproduce CodeMirror's boundary rule, regardless of what the hand-written
 * tests above claim.
 */
describe("extractTouchedLines matches CodeMirror's OWN indentMore/indentLess (independent oracle, #463 local-reviewer follow-up)", () => {
  /** Offset of `column` characters into `lineNumber` (1-based), resolved
   *  against `doc` via CodeMirror's own line lookup - never a hand-computed
   *  magic number, so a selection like `at(doc, 3, 0)` reads as exactly
   *  "the head of line 3" with no arithmetic to get wrong. */
  function at(doc: string, lineNumber: number, column: number): number {
    return EditorState.create({ doc }).doc.line(lineNumber).from + column;
  }

  function linesTouchedByBuiltinIndent(
    state: EditorState,
    command: typeof indentMore
  ): number[] {
    const dispatched: Transaction[] = [];
    command({
      state,
      dispatch: (tr) => {
        dispatched.push(tr);
      }
    });
    const captured = dispatched[0];
    if (captured === undefined) {
      return [];
    }
    const touched = new Set<number>();
    captured.changes.iterChangedRanges((fromA) => {
      touched.add(state.doc.lineAt(fromA).number);
    });
    return Array.from(touched).sort((a, b) => a - b);
  }

  describe("against indentMore", () => {
    const doc = "one\ntwo\nthree\nfour\nfive";

    it.each<{ readonly name: string; readonly selection: () => EditorSelection }>([
      { name: "cursor mid-line", selection: () => EditorSelection.single(at(doc, 2, 1)) },
      {
        name: "cursor exactly at a line head",
        selection: () => EditorSelection.single(at(doc, 3, 0))
      },
      {
        name: "single-line selection",
        selection: () => EditorSelection.single(at(doc, 2, 0), at(doc, 2, 2))
      },
      {
        name: "multi-line selection",
        selection: () => EditorSelection.single(at(doc, 1, 1), at(doc, 3, 1))
      },
      {
        name: "selection ending exactly at the next line's head",
        selection: () => EditorSelection.single(at(doc, 2, 1), at(doc, 3, 0))
      },
      {
        name: "selection ending one character into the next line",
        selection: () => EditorSelection.single(at(doc, 2, 1), at(doc, 3, 1))
      },
      {
        name: "multi-cursor on different lines",
        selection: () =>
          EditorSelection.create(
            [
              EditorSelection.cursor(at(doc, 1, 1)),
              EditorSelection.cursor(at(doc, 4, 1))
            ],
            0
          )
      },
      {
        name: "whole document",
        selection: () => EditorSelection.single(0, doc.length)
      }
    ])("$name: agrees with indentMore's own touched lines", ({ selection }) => {
      const state = EditorState.create({
        doc,
        selection: selection(),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });

      expect(lineNumbers(state)).toEqual(
        linesTouchedByBuiltinIndent(state, indentMore)
      );
    });
  });

  describe("against indentLess", () => {
    // Unlike indentMore, CodeMirror's indentLess callback SKIPS pushing a
    // change for a line with no leading whitespace to remove - so
    // `iterChangedRanges` would under-report "visited" lines against a
    // plain, unindented doc. Every line here is given 2 leading spaces so
    // indentLess always has something to remove, keeping "produced a
    // change" equal to "visited by changeBySelectedLine" for this check.
    const doc = "  one\n  two\n  three\n  four\n  five";

    it.each<{ readonly name: string; readonly selection: () => EditorSelection }>([
      { name: "cursor mid-line", selection: () => EditorSelection.single(at(doc, 2, 3)) },
      {
        name: "multi-line selection",
        selection: () => EditorSelection.single(at(doc, 1, 3), at(doc, 3, 3))
      },
      {
        name: "selection ending exactly at the next line's head",
        selection: () => EditorSelection.single(at(doc, 2, 3), at(doc, 3, 0))
      }
    ])("$name: agrees with indentLess's own touched lines too", ({ selection }) => {
      const state = EditorState.create({
        doc,
        selection: selection(),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });

      expect(lineNumbers(state)).toEqual(
        linesTouchedByBuiltinIndent(state, indentLess)
      );
    });
  });
});
