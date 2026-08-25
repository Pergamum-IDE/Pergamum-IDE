// @vitest-environment happy-dom
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, undoDepth } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import { createVisibilityExtension } from "../../../src/renderer/editorVisibility/visibilityFeature";
import {
  lineEndMarkerClassName,
  lineEndMarkerFeature
} from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";

/**
 * These tests drive a real, DOM-backed `EditorView` (via happy-dom) rather
 * than only the pure decoration-computation helpers, because the
 * guarantees under test — undo history staying clean, and decorations not
 * piling up across the extension's lifecycle — are properties of how the
 * `ViewPlugin` behaves when actually mounted, not just of the pure
 * function it calls.
 */

const views: EditorView[] = [];

function mount(extensions: Extension[]): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: "alpha\nbeta\ngamma", extensions })
  });
  views.push(view);
  return view;
}

function markerElementCount(view: EditorView): number {
  return view.dom.querySelectorAll(`.${lineEndMarkerClassName}`).length;
}

afterEach(() => {
  while (views.length > 0) {
    views.pop()?.destroy();
  }
});

describe("visibility extension mounted on a real EditorView", () => {
  it("renders decorations when enabled and none when disabled", () => {
    const enabledView = mount([createVisibilityExtension([lineEndMarkerFeature])]);
    expect(markerElementCount(enabledView)).toBe(2);

    const disabledView = mount([createVisibilityExtension([])]);
    expect(markerElementCount(disabledView)).toBe(0);
  });

  it("does not add extra undo entries when the document is edited", () => {
    const view = mount([history(), createVisibilityExtension([lineEndMarkerFeature])]);

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: "!" }
    });

    expect(view.state.doc.toString()).toBe("alpha\nbeta\ngamma!");
    expect(undoDepth(view.state)).toBe(1);

    const didUndo = undo(view);

    expect(didUndo).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha\nbeta\ngamma");
    expect(undoDepth(view.state)).toBe(0);
  });

  it("follows document edits: markers track added and removed lines", () => {
    const view = mount([createVisibilityExtension([lineEndMarkerFeature])]);
    expect(markerElementCount(view)).toBe(2);

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: "\ndelta" }
    });
    expect(markerElementCount(view)).toBe(3);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
    expect(markerElementCount(view)).toBe(0);
  });

  it("does not accumulate decorations across repeated compartment reconfiguration", () => {
    const compartment = new Compartment();
    const view = mount([compartment.of(createVisibilityExtension([lineEndMarkerFeature]))]);

    expect(markerElementCount(view)).toBe(2);

    for (let i = 0; i < 5; i++) {
      view.dispatch({
        effects: compartment.reconfigure(createVisibilityExtension([lineEndMarkerFeature]))
      });
      expect(markerElementCount(view)).toBe(2);
    }
  });

  it("does not leave decorations behind for a destroyed view, and a fresh view starts clean", () => {
    const first = mount([createVisibilityExtension([lineEndMarkerFeature])]);
    expect(markerElementCount(first)).toBe(2);
    first.destroy();

    const second = mount([createVisibilityExtension([lineEndMarkerFeature])]);
    expect(markerElementCount(second)).toBe(2);
  });

  it("keeps decoration work bounded by the viewport on a long document, not by document size (#248 blocker 4)", () => {
    const lineCount = 20000;
    const longDoc = Array.from(
      { length: lineCount },
      (_, i) => `吾輩は猫である。名前はまだ無い。 line ${i}`
    ).join("\n");

    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: longDoc,
        extensions: [createVisibilityExtension([lineEndMarkerFeature])]
      })
    });
    views.push(view);

    const renderedMarkers = markerElementCount(view);

    // CodeMirror only ever draws a small window of a 20000-line document;
    // the marker count must track that window, not the document's line
    // count, or every keystroke would re-scan and re-render everything.
    expect(renderedMarkers).toBeGreaterThan(0);
    expect(renderedMarkers).toBeLessThan(200);
  });
});
