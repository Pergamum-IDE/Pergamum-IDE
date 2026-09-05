import { EditorState, type TransactionSpec } from "@codemirror/state";
import { history, redo, undo, undoDepth } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import {
  buildLineEndingBreakSet,
  createLineEndingTrackingExtension,
  documentSwitchTransactionSpec,
  lineEndingBreakSetToArray,
  resetLineEndingBreaksEffect
} from "../../src/renderer/editorLineEndingField";
import {
  analyzeLineEndings,
  type LineEndingKind
} from "../../src/renderer/lineEndingTracking";

/**
 * #253: these tests drive the real `@codemirror/state`/`@codemirror/commands`
 * machinery directly (no DOM needed — StateField/RangeSet/history all work
 * against a plain `EditorState`), so they exercise the exact production
 * tracking logic, not a re-implementation.
 */

function stateWithField(
  doc: string,
  breaks: readonly { position: number; kind: "lf" | "crlf" | "cr" }[],
  fallback: "lf" | "crlf" = "lf"
) {
  const { field, extension } = createLineEndingTrackingExtension(
    breaks,
    () => fallback
  );
  const state = EditorState.create({
    doc,
    // `extension` (not just `field`) carries the invertedEffects
    // registration too — without it, history() has no way to make Undo
    // exactly restore this field's value (see the Undo/Redo tests below).
    extensions: [history(), extension]
  });
  return { state, field };
}

function dispatch(
  state: EditorState,
  spec: TransactionSpec
): EditorState {
  return state.update(spec).state;
}

describe("createLineEndingTrackingField (#253)", () => {
  it("seeds the field from the given initial breaks", () => {
    const { state, field } = stateWithField("a\nb\nc", [
      { position: 1, kind: "crlf" },
      { position: 3, kind: "lf" }
    ]);

    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 1, kind: "crlf" },
      { position: 3, kind: "lf" }
    ]);
  });

  it("leaves existing break kinds unchanged when editing text unrelated to any break", () => {
    let { state, field } = stateWithField("aaa\nbbb\nccc", [
      { position: 3, kind: "crlf" },
      { position: 7, kind: "cr" }
    ]);

    // Insert "X" in the middle of the first line — doesn't touch a break.
    state = dispatch(state, { changes: { from: 1, to: 1, insert: "X" } });

    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 4, kind: "crlf" },
      { position: 8, kind: "cr" }
    ]);
  });

  it("leaves a break's kind unchanged when inserting immediately before or after it", () => {
    let { state, field } = stateWithField("aaa\nbbb", [
      { position: 3, kind: "crlf" }
    ]);

    state = dispatch(state, { changes: { from: 3, to: 3, insert: "X" } });
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 4, kind: "crlf" }
    ]);

    state = dispatch(state, { changes: { from: 5, to: 5, insert: "Y" } });
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 4, kind: "crlf" }
    ]);
  });

  it("removes a break's tracked metadata when the break itself is deleted", () => {
    let { state, field } = stateWithField("aaa\nbbb\nccc", [
      { position: 3, kind: "crlf" },
      { position: 7, kind: "cr" }
    ]);

    // Delete "aaa\n" (positions 0-4), removing the first break.
    state = dispatch(state, { changes: { from: 0, to: 4 } });

    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 3, kind: "cr" }
    ]);
  });

  it("does not misattribute a surviving break's kind to a different position after a multi-line deletion", () => {
    let { state, field } = stateWithField("aaa\nbbb\nccc\nddd", [
      { position: 3, kind: "lf" },
      { position: 7, kind: "crlf" },
      { position: 11, kind: "cr" }
    ]);

    // Delete "bbb\nccc\n" (positions 4-12), removing the middle two breaks.
    state = dispatch(state, { changes: { from: 4, to: 12 } });

    expect(state.doc.toString()).toBe("aaa\nddd");
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 3, kind: "lf" }
    ]);
  });

  describe("new break inheritance (#253)", () => {
    // Normalized doc "AAA\nBBB\nCCC" (from raw "AAA\r\nBBB\r\nCCC"): breaks
    // at position 3 (end of "AAA") and position 7 (end of "BBB").
    const followingBreakFixtureBreaks = [
      { position: 3, kind: "crlf" as const },
      { position: 7, kind: "crlf" as const }
    ];

    it("a new break inherits the kind of the existing break that follows the insertion point", () => {
      let { state, field } = stateWithField(
        "AAA\nBBB\nCCC",
        followingBreakFixtureBreaks
      );

      // Split "BBB" (positions 4-6) in the middle — position 5 is before
      // its following break at position 7.
      state = dispatch(state, { changes: { from: 5, to: 5, insert: "\n" } });

      expect(state.doc.toString()).toBe("AAA\nB\nBB\nCCC");
      const breaks = lineEndingBreakSetToArray(state.field(field));
      const newBreak = breaks.find((b) => b.position === 5);

      expect(newBreak?.kind).toBe("crlf");
      // The untouched break and the shifted one keep their own kinds too.
      expect(breaks).toContainEqual({ position: 3, kind: "crlf" });
      expect(breaks).toContainEqual({ position: 8, kind: "crlf" });
    });

    it("a new break with no following break inherits the nearest preceding break's kind", () => {
      let { state, field } = stateWithField("AAA\nBBB\nCCC", [
        { position: 3, kind: "lf" },
        { position: 7, kind: "crlf" }
      ]);

      // Append a new line at the very end — no break follows position 11.
      state = dispatch(state, {
        changes: { from: 11, to: 11, insert: "\nDDD" }
      });

      expect(state.doc.toString()).toBe("AAA\nBBB\nCCC\nDDD");
      const breaks = lineEndingBreakSetToArray(state.field(field));
      const newBreak = breaks.find((b) => b.position === 11);

      // Nearest preceding break (position 7) is crlf, not the further-away
      // lf at position 3.
      expect(newBreak?.kind).toBe("crlf");
    });

    it("falls back to files.newFile.lineEnding when the document has no existing breaks at all", () => {
      let { state, field } = stateWithField("no breaks yet", [], "crlf");

      state = dispatch(state, {
        changes: { from: 13, to: 13, insert: "\nmore" }
      });

      const breaks = lineEndingBreakSetToArray(state.field(field));
      expect(breaks).toEqual([{ position: 13, kind: "crlf" }]);
    });

    it("uses the lf fallback too, not just crlf", () => {
      let { state, field } = stateWithField("no breaks yet", [], "lf");

      state = dispatch(state, {
        changes: { from: 13, to: 13, insert: "\nmore" }
      });

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
        { position: 13, kind: "lf" }
      ]);
    });

    it("gives every new break from a single multi-line paste the same locally-inherited kind, not per-line-source kinds", () => {
      let { state, field } = stateWithField(
        "AAA\nBBB\nCCC",
        followingBreakFixtureBreaks
      );

      // Paste "X\nY\nZ" (as CodeMirror would present it — already
      // normalized to "\n", exactly like a real paste event) into the
      // middle of "BBB", which precedes the crlf break at position 7.
      state = dispatch(state, {
        changes: { from: 5, to: 5, insert: "X\nY\nZ" }
      });

      expect(state.doc.toString()).toBe("AAA\nBX\nY\nZBB\nCCC");
      const breaks = lineEndingBreakSetToArray(state.field(field));
      // The two untouched/shifted original breaks, plus two brand new ones
      // from the pasted text.
      expect(breaks).toHaveLength(4);
      const newBreaks = breaks.filter(
        (b) => b.position !== 3 && b.position !== 12
      );
      expect(newBreaks).toHaveLength(2);
      expect(newBreaks.every((b) => b.kind === "crlf")).toBe(true);
    });

    it("ignores the pasted text's own line-ending characters entirely — CodeMirror already normalized them before this field ever sees them", () => {
      // A pure-LF document; paste text that (before normalization) looked
      // like it came from a CRLF source. By the time it reaches
      // tr.changes, CodeMirror has already turned it into a plain "\n" —
      // there is no way for this field to see raw "\r" at all, which is
      // exactly the point: paste source kind never enters the decision.
      let { state, field } = stateWithField("A\nB", [{ position: 1, kind: "lf" }]);

      state = dispatch(state, {
        changes: { from: 3, to: 3, insert: "\r\nC" }
      });

      expect(state.doc.toString()).toBe("A\nB\nC");
      const breaks = lineEndingBreakSetToArray(state.field(field));
      const newBreak = breaks.find((b) => b.position === 3);
      expect(newBreak?.kind).toBe("lf");
    });
  });

  describe("Undo / Redo (#253)", () => {
    it("restores the exact original kind of a deleted break on Undo — not a re-inferred approximation", () => {
      const view = mountViewLike("aaa\nbbb\nccc", [
        { position: 3, kind: "crlf" },
        { position: 7, kind: "lf" }
      ]);

      // Delete "aaa\n" — removes the crlf break, leaving only the lf one
      // (shifted).
      view.dispatch({ changes: { from: 0, to: 4 } });
      expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual([
        { position: 3, kind: "lf" }
      ]);

      undo(view);

      expect(view.state.doc.toString()).toBe("aaa\nbbb\nccc");
      expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual([
        { position: 3, kind: "crlf" },
        { position: 7, kind: "lf" }
      ]);
    });

    it("re-applies the deletion on Redo after an Undo", () => {
      const view = mountViewLike("aaa\nbbb\nccc", [
        { position: 3, kind: "crlf" },
        { position: 7, kind: "lf" }
      ]);

      view.dispatch({ changes: { from: 0, to: 4 } });
      undo(view);
      redo(view);

      expect(view.state.doc.toString()).toBe("bbb\nccc");
      expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual([
        { position: 3, kind: "lf" }
      ]);
    });

    it("keeps content and tracking state consistent across Undo/Redo of a new-break insertion", () => {
      const view = mountViewLike("A\nB", [{ position: 1, kind: "crlf" }]);

      view.dispatch({ changes: { from: 3, to: 3, insert: "\nC" } });
      expect(view.state.doc.toString()).toBe("A\nB\nC");
      expect(
        lineEndingBreakSetToArray(view.state.field(view.field))
      ).toEqual([
        { position: 1, kind: "crlf" },
        { position: 3, kind: "crlf" }
      ]);

      undo(view);
      expect(view.state.doc.toString()).toBe("A\nB");
      expect(
        lineEndingBreakSetToArray(view.state.field(view.field))
      ).toEqual([{ position: 1, kind: "crlf" }]);

      redo(view);
      expect(view.state.doc.toString()).toBe("A\nB\nC");
      expect(
        lineEndingBreakSetToArray(view.state.field(view.field))
      ).toEqual([
        { position: 1, kind: "crlf" },
        { position: 3, kind: "crlf" }
      ]);
    });
  });

  describe("document switch via resetLineEndingBreaksEffect (#250/#253 pattern)", () => {
    it("does not carry over the previous document's tracked breaks after a reset", () => {
      const { state: initialState, field } = stateWithField("a\nb", [
        { position: 1, kind: "crlf" }
      ]);
      expect(lineEndingBreakSetToArray(initialState.field(field))).toEqual([
        { position: 1, kind: "crlf" }
      ]);

      const secondDoc = "x\ny\nz";
      const state = dispatch(initialState, {
        changes: { from: 0, to: initialState.doc.length, insert: secondDoc },
        effects: resetLineEndingBreaksEffect.of(
          buildLineEndingBreakSet(analyzeLineEndings(secondDoc))
        )
      });

      expect(state.doc.toString()).toBe(secondDoc);
      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
        { position: 1, kind: "lf" },
        { position: 3, kind: "lf" }
      ]);
    });

    it("does not treat the reset transaction's own doc replacement as new breaks needing local-kind inference", () => {
      // If the reset effect weren't handled first, the field would instead
      // run its normal map+infer logic against the full-document replace,
      // which (as verified against real CodeMirror behavior) does not
      // simply yield the new document's own analyzed breaks.
      const { state: initialState, field } = stateWithField("a\r\nb", [
        { position: 1, kind: "crlf" }
      ]);

      const secondDoc = "one\r\ntwo\rthree";
      const secondBreaks = analyzeLineEndings(secondDoc);
      const state = dispatch(initialState, {
        changes: { from: 0, to: initialState.doc.length, insert: secondDoc },
        effects: resetLineEndingBreaksEffect.of(
          buildLineEndingBreakSet(secondBreaks)
        )
      });

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual(
        secondBreaks
      );
    });
  });

  describe("documentSwitchTransactionSpec excludes the switch from Undo history (#253 review)", () => {
    it("does not let Undo right after a document switch bring back the previous document's content", () => {
      const { field, extension } = createLineEndingTrackingExtension(
        [{ position: 3, kind: "crlf" }],
        () => "lf"
      );
      let state = EditorState.create({
        doc: "AAA\nBBB",
        extensions: [history(), extension]
      });

      // Edit document A, creating real undo history for it.
      state = state.update({ changes: { from: 0, to: 0, insert: "X" } })
        .state;
      expect(undoDepth(state)).toBeGreaterThan(0);

      // Switch to an unrelated document B.
      state = state.update(
        documentSwitchTransactionSpec(
          state.doc.length,
          "one\r\ntwo\rthree",
          buildLineEndingBreakSet(analyzeLineEndings("one\r\ntwo\rthree"))
        )
      ).state;
      expect(state.doc.toString()).toBe("one\ntwo\nthree");

      // A's edit history must be unreachable, not merely "not the next
      // thing to undo" — the switch is a full replacement, not a
      // continuation of A's document.
      expect(undoDepth(state)).toBe(0);

      const view = {
        get state() {
          return state;
        },
        dispatch: (spec: TransactionSpec) => {
          state = state.update(spec).state;
        }
      };
      const undoResult = undo(view);

      expect(undoResult).toBe(false);
      expect(state.doc.toString()).toBe("one\ntwo\nthree");
      expect(lineEndingBreakSetToArray(state.field(field))).toEqual(
        analyzeLineEndings("one\r\ntwo\rthree")
      );
    });

    it("does not add a spurious undo step for the switch transaction itself", () => {
      const { extension } = createLineEndingTrackingExtension([], () => "lf");
      let state = EditorState.create({
        doc: "first document",
        extensions: [history(), extension]
      });

      state = state.update(
        documentSwitchTransactionSpec(
          state.doc.length,
          "second document",
          buildLineEndingBreakSet([])
        )
      ).state;

      expect(undoDepth(state)).toBe(0);
    });
  });

  describe("runtime files.newFile.lineEnding fallback changes (#253 review)", () => {
    it("picks up a Settings change to files.newFile.lineEnding for the next new break in a document with zero existing breaks", () => {
      // files.newFile.lineEnding = lf, a zero-break document is shown.
      const fallbackBox: { current: LineEndingKind } = { current: "lf" };
      const { field, extension } = createLineEndingTrackingExtension(
        [],
        () => fallbackBox.current
      );
      let state = EditorState.create({
        doc: "no breaks yet",
        extensions: [extension]
      });

      // The setting is changed to crlf before any break is ever created —
      // the field must consult the fallback live, not a value captured
      // when the field/extension was constructed.
      fallbackBox.current = "crlf";

      // Enter at the end of the document.
      state = state.update({
        changes: { from: state.doc.length, to: state.doc.length, insert: "\n" }
      }).state;

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
        { position: state.doc.length - 1, kind: "crlf" }
      ]);
    });

    it("does not retroactively change an existing break's already-tracked kind when the setting changes", () => {
      const fallbackBox: { current: LineEndingKind } = { current: "lf" };
      const { field, extension } = createLineEndingTrackingExtension(
        [{ position: 3, kind: "lf" }],
        () => fallbackBox.current
      );
      let state = EditorState.create({
        doc: "AAA\nBBB",
        extensions: [extension]
      });

      fallbackBox.current = "crlf";

      // An unrelated edit that doesn't touch the existing break.
      state = state.update({ changes: { from: 0, to: 0, insert: "X" } })
        .state;

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
        { position: 4, kind: "lf" }
      ]);
    });
  });
});

/** Minimal EditorView-shaped object for @codemirror/commands' undo/redo,
 * without needing a real DOM (undo/redo only touch `state`/`dispatch`). */
function mountViewLike(
  doc: string,
  breaks: readonly { position: number; kind: "lf" | "crlf" | "cr" }[]
) {
  const { state: initialState, field } = stateWithField(doc, breaks);
  let state = initialState;
  return {
    get state() {
      return state;
    },
    field,
    dispatch: (spec: TransactionSpec) => {
      state = state.update(spec).state;
    }
  };
}

/**
 * #253 follow-up: boundary-delete tracking bug (found during #252 dogfood).
 * `RangeSet.map`'s default `MapMode.TrackDel` only drops a point strictly
 * *inside* a deleted range — a point exactly at the deletion's start
 * survives unchanged. A break's own position always equals the deletion's
 * start when exactly one character (its own "\n") is deleted, so this was
 * not a rare edge case: it fired on the ordinary "delete a single line
 * break" edit (e.g. Backspace/Delete on it). These tests drive the real
 * production `createLineEndingTrackingExtension` — no test-only
 * reimplementation of the tracking logic.
 */
describe("boundary-delete tracking (#253 follow-up)", () => {
  it.each(["lf", "crlf", "cr"] as const)(
    "removes a %s break when exactly its own single normalized character is deleted",
    (kind) => {
      let { state, field } = stateWithField("A\nB", [{ position: 1, kind }]);

      state = dispatch(state, { changes: { from: 1, to: 2 } });

      expect(state.doc.toString()).toBe("AB");
      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([]);
    }
  );

  it("does not collateral-delete the immediately following break when the earlier one is boundary-deleted", () => {
    // "A\n\nB": break 1 (crlf) at position 1, break 2 (lf) at position 2 —
    // deleting break 1 alone must not also remove break 2, even though
    // after mapping they would otherwise land on the same new position.
    let { state, field } = stateWithField("A\n\nB", [
      { position: 1, kind: "crlf" },
      { position: 2, kind: "lf" }
    ]);

    state = dispatch(state, { changes: { from: 1, to: 2 } });

    expect(state.doc.toString()).toBe("A\nB");
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 1, kind: "lf" }
    ]);
  });

  it("does not collateral-delete the preceding break when the later one is boundary-deleted", () => {
    let { state, field } = stateWithField("A\n\nB", [
      { position: 1, kind: "crlf" },
      { position: 2, kind: "lf" }
    ]);

    state = dispatch(state, { changes: { from: 2, to: 3 } });

    expect(state.doc.toString()).toBe("A\nB");
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 1, kind: "crlf" }
    ]);
  });

  it("boundary-deletes a break and adds a newly inserted break in the same transaction, without cross-contamination", () => {
    // One transaction, two independent change regions: region 1
    // boundary-deletes the crlf break at position 1; region 2 (unrelated,
    // at the document's end) appends "\nD", creating a brand new break.
    // The surviving break (position 3, cr) must map correctly, the
    // boundary-deleted one must be gone, and the new break must inherit
    // its kind from #253's existing rule (nearest preceding break — cr —
    // since nothing follows it) exactly as before this fix.
    let { state, field } = stateWithField("A\nB\nC", [
      { position: 1, kind: "crlf" },
      { position: 3, kind: "cr" }
    ]);

    state = dispatch(state, {
      changes: [
        { from: 1, to: 2 },
        { from: state.doc.length, to: state.doc.length, insert: "\nD" }
      ]
    });

    expect(state.doc.toString()).toBe("AB\nC\nD");
    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 2, kind: "cr" },
      { position: 4, kind: "cr" }
    ]);
  });

  it("removes only the boundary-deleted break in a mixed document, keeping the others' kinds and shifted positions", () => {
    // "A<CRLF>B<LF>C<CR>D" -> canonical "A\nB\nC\nD"
    let { state, field } = stateWithField("A\nB\nC\nD", [
      { position: 1, kind: "crlf" },
      { position: 3, kind: "lf" },
      { position: 5, kind: "cr" }
    ]);

    state = dispatch(state, { changes: { from: 1, to: 2 } });

    expect(state.doc.toString()).toBe("AB\nC\nD");
    const breaks = lineEndingBreakSetToArray(state.field(field));
    expect(breaks).toHaveLength(2);
    expect(breaks).toEqual([
      { position: 2, kind: "lf" },
      { position: 4, kind: "cr" }
    ]);
  });

  it("still removes a break that sits strictly inside a larger deleted range (existing #253 behavior preserved)", () => {
    let { state, field } = stateWithField("aaa\nbbb\nccc", [
      { position: 3, kind: "crlf" },
      { position: 7, kind: "cr" }
    ]);

    // Delete "aaa\n" (positions 0-4) — the break at position 3 is
    // strictly interior to [0,4), not at its start boundary.
    state = dispatch(state, { changes: { from: 0, to: 4 } });

    expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
      { position: 3, kind: "cr" }
    ]);
  });

  it("supports Undo/Redo of a boundary-deleted break via the existing snapshot mechanism", () => {
    const view = mountViewLike("A\nB", [{ position: 1, kind: "crlf" }]);

    view.dispatch({ changes: { from: 1, to: 2 } });
    expect(view.state.doc.toString()).toBe("AB");
    expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual(
      []
    );

    undo(view);
    expect(view.state.doc.toString()).toBe("A\nB");
    expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual([
      { position: 1, kind: "crlf" }
    ]);

    redo(view);
    expect(view.state.doc.toString()).toBe("AB");
    expect(lineEndingBreakSetToArray(view.state.field(view.field))).toEqual(
      []
    );
  });
});
