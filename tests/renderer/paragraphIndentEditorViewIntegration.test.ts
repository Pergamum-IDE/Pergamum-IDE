// @vitest-environment happy-dom
import { EditorState, type Extension, type StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLineEndingTrackingExtension,
  lineEndingBreakSetToArray,
  type LineEndingBreakSet
} from "../../src/renderer/editorLineEndingField";
import {
  analyzeLineEndings,
  normalizeLineEndings
} from "../../src/renderer/lineEndingTracking";
import {
  computeParagraphIndentInsertTransform,
  computeParagraphIndentRemoveTransform,
  paragraphIndentCharacter
} from "../../src/renderer/paragraphIndentTransform";

const views: EditorView[] = [];

function mountEditor(doc: string, extensions: Extension = [history()]): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions
    })
  });

  views.push(view);
  return view;
}

function mountLineEndingTrackedEditor(rawDoc: string): {
  readonly view: EditorView;
  readonly field: StateField<LineEndingBreakSet>;
} {
  const { field, extension } = createLineEndingTrackingExtension(
    analyzeLineEndings(rawDoc),
    () => "lf"
  );

  return {
    view: mountEditor(normalizeLineEndings(rawDoc), [history(), extension]),
    field
  };
}

function trackedLineEndingBreaks(
  view: EditorView,
  field: StateField<LineEndingBreakSet>
) {
  return lineEndingBreakSetToArray(view.state.field(field));
}

afterEach(() => {
  while (views.length > 0) {
    views.pop()?.destroy();
  }
});

describe("paragraph indent CodeMirror integration (#257)", () => {
  it("records bulk insertion as one undo/redo unit", () => {
    const source = "一行目\n二行目\n\n三行目";
    const view = mountEditor(source);
    const transform = computeParagraphIndentInsertTransform(source, "");

    view.dispatch({ changes: transform.changes });

    const inserted = `${paragraphIndentCharacter}一行目\n${paragraphIndentCharacter}二行目\n\n${paragraphIndentCharacter}三行目`;
    expect(view.state.doc.toString()).toBe(inserted);
    expect(undoDepth(view.state)).toBe(1);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redoDepth(view.state)).toBe(1);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(inserted);
  });

  it("records bulk removal as one undo/redo unit", () => {
    const source = `${paragraphIndentCharacter}一行目\n本文\n${paragraphIndentCharacter}${paragraphIndentCharacter}二重`;
    const view = mountEditor(source);
    const transform = computeParagraphIndentRemoveTransform(source);

    view.dispatch({ changes: transform.changes });

    const removed = `一行目\n本文\n${paragraphIndentCharacter}二重`;
    expect(view.state.doc.toString()).toBe(removed);
    expect(undoDepth(view.state)).toBe(1);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(redoDepth(view.state)).toBe(1);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(removed);
  });

  it("preserves mixed line-ending tracking across bulk insertion and undo/redo", () => {
    const rawSource = "一行目\n二行目\r\n三行目\r四行目";
    const source = normalizeLineEndings(rawSource);
    const { view, field } = mountLineEndingTrackedEditor(rawSource);
    const transform = computeParagraphIndentInsertTransform(source, "");

    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 3, kind: "lf" },
      { position: 7, kind: "crlf" },
      { position: 11, kind: "cr" }
    ]);

    view.dispatch({ changes: transform.changes });

    const inserted = `${paragraphIndentCharacter}一行目\n${paragraphIndentCharacter}二行目\n${paragraphIndentCharacter}三行目\n${paragraphIndentCharacter}四行目`;
    expect(view.state.doc.toString()).toBe(inserted);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 4, kind: "lf" },
      { position: 9, kind: "crlf" },
      { position: 14, kind: "cr" }
    ]);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 3, kind: "lf" },
      { position: 7, kind: "crlf" },
      { position: 11, kind: "cr" }
    ]);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(inserted);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 4, kind: "lf" },
      { position: 9, kind: "crlf" },
      { position: 14, kind: "cr" }
    ]);
  });

  it("preserves mixed line-ending tracking across bulk removal and undo/redo", () => {
    const rawSource = `${paragraphIndentCharacter}一行目\n${paragraphIndentCharacter}二行目\r\n${paragraphIndentCharacter}三行目\r${paragraphIndentCharacter}四行目`;
    const source = normalizeLineEndings(rawSource);
    const { view, field } = mountLineEndingTrackedEditor(rawSource);
    const transform = computeParagraphIndentRemoveTransform(source);

    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 4, kind: "lf" },
      { position: 9, kind: "crlf" },
      { position: 14, kind: "cr" }
    ]);

    view.dispatch({ changes: transform.changes });

    const removed = "一行目\n二行目\n三行目\n四行目";
    expect(view.state.doc.toString()).toBe(removed);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 3, kind: "lf" },
      { position: 7, kind: "crlf" },
      { position: 11, kind: "cr" }
    ]);

    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(source);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 4, kind: "lf" },
      { position: 9, kind: "crlf" },
      { position: 14, kind: "cr" }
    ]);

    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(removed);
    expect(trackedLineEndingBreaks(view, field)).toEqual([
      { position: 3, kind: "lf" },
      { position: 7, kind: "crlf" },
      { position: 11, kind: "cr" }
    ]);
  });
});
