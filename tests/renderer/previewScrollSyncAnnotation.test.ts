import { describe, expect, it } from "vitest";
import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  isPreviewToEditorScrollSyncTransaction,
  previewToEditorScrollSyncAnnotation,
  transactionRequestsScrollIntoView
} from "../../src/renderer/previewScrollSyncAnnotation";

function stateWithDoc(doc: string) {
  return EditorState.create({ doc });
}

describe("#505 Phase 1: previewScrollSyncAnnotation (real CodeMirror transactions)", () => {
  describe("transactionRequestsScrollIntoView", () => {
    it("is true for a transaction dispatched with an EditorView.scrollIntoView effect", () => {
      const state = stateWithDoc("line one\nline two\nline three");
      const tr = state.update({
        effects: EditorView.scrollIntoView(state.doc.line(2).from, { y: "start" })
      });

      expect(transactionRequestsScrollIntoView(tr)).toBe(true);
    });

    it("is true regardless of the y strategy used", () => {
      const state = stateWithDoc("a\nb\nc");
      for (const y of ["start", "end", "center", "nearest"] as const) {
        const tr = state.update({
          effects: EditorView.scrollIntoView(state.doc.line(1).from, { y })
        });
        expect(transactionRequestsScrollIntoView(tr)).toBe(true);
      }
    });

    it("is false for a plain document-change transaction with no effects", () => {
      const state = stateWithDoc("hello world");
      const tr = state.update({
        changes: { from: 0, to: 5, insert: "howdy" }
      });

      expect(transactionRequestsScrollIntoView(tr)).toBe(false);
    });

    it("is false for a transaction with an unrelated effect", () => {
      const unrelatedEffect = StateEffect.define<number>();
      const state = stateWithDoc("hello");
      const tr = state.update({ effects: unrelatedEffect.of(42) });

      expect(transactionRequestsScrollIntoView(tr)).toBe(false);
    });

    it("is false for a selection-only transaction using the plain scrollIntoView boolean flag (a different CodeMirror mechanism)", () => {
      // TransactionSpec.scrollIntoView (a simple boolean) is NOT the same
      // mechanism as the EditorView.scrollIntoView(...) EFFECT this function
      // detects — confirms the two are genuinely distinct in practice.
      const state = stateWithDoc("hello world");
      const tr = state.update({
        selection: { anchor: 3 },
        scrollIntoView: true
      });

      expect(transactionRequestsScrollIntoView(tr)).toBe(false);
    });
  });

  describe("isPreviewToEditorScrollSyncTransaction / annotation", () => {
    it("is true only for a transaction carrying the #505 annotation", () => {
      const state = stateWithDoc("line one\nline two");
      const annotated = state.update({
        effects: EditorView.scrollIntoView(state.doc.line(2).from, { y: "start" }),
        annotations: previewToEditorScrollSyncAnnotation.of(true)
      });
      const unannotated = state.update({
        effects: EditorView.scrollIntoView(state.doc.line(2).from, { y: "start" })
      });

      expect(isPreviewToEditorScrollSyncTransaction(annotated)).toBe(true);
      expect(isPreviewToEditorScrollSyncTransaction(unannotated)).toBe(false);
    });

    it("an annotated transaction still requests scrollIntoView (the exception is about leadership, not detection)", () => {
      const state = stateWithDoc("line one\nline two\nline three");
      const tr = state.update({
        effects: EditorView.scrollIntoView(state.doc.line(3).from, { y: "start" }),
        annotations: previewToEditorScrollSyncAnnotation.of(true)
      });

      expect(transactionRequestsScrollIntoView(tr)).toBe(true);
      expect(isPreviewToEditorScrollSyncTransaction(tr)).toBe(true);
    });
  });
});
