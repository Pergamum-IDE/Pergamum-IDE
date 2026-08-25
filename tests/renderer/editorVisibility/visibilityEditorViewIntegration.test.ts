// @vitest-environment happy-dom
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, undoDepth } from "@codemirror/commands";
import { afterEach, describe, expect, it } from "vitest";
import { createVisibilityExtension } from "../../../src/renderer/editorVisibility/visibilityFeature";
import {
  createLineEndingMarkerFeature,
  lineEndMarkerClassName,
  lineEndMarkerUnexpectedClassName
} from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";
import {
  createLineEndingTrackingExtension,
  lineEndingBreakSetToArray
} from "../../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../../src/renderer/lineEndingTracking";

/**
 * These tests drive a real, DOM-backed `EditorView` (via happy-dom) rather
 * than only the pure decoration-computation helpers, because the
 * guarantees under test — undo history staying clean, decorations not
 * piling up across the extension's lifecycle, and Settings changes not
 * touching #253's tracking state — are properties of how the `ViewPlugin`
 * and the tracking `StateField` behave when actually mounted together
 * (matching MarkdownEditor.tsx's real wiring), not just of the pure
 * functions they call.
 */

const views: EditorView[] = [];

function mountWithLineEndings(
  doc: string,
  expectedKind: "lf" | "crlf" | "cr" = "lf",
  extraExtensions: Extension[] = []
): { view: EditorView; field: ReturnType<typeof buildField>["field"] } {
  const { field, extension: markerExtension } = buildField(doc, expectedKind);
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: doc.replace(/\r\n|\r/g, "\n"),
      extensions: [...extraExtensions, markerExtension]
    })
  });
  views.push(view);
  return { view, field };
}

function buildField(doc: string, expectedKind: "lf" | "crlf" | "cr") {
  const { field, extension: trackingExtension } =
    createLineEndingTrackingExtension(analyzeLineEndings(doc), () => "lf");
  const markerFeature = createLineEndingMarkerFeature(
    field,
    () => expectedKind,
    () => "⏎"
  );

  return {
    field,
    extension: [
      trackingExtension,
      createVisibilityExtension([markerFeature])
    ]
  };
}

function markerElementCount(view: EditorView): number {
  return view.dom.querySelectorAll(`.${lineEndMarkerClassName}`).length;
}

function unexpectedMarkerElementCount(view: EditorView): number {
  return view.dom.querySelectorAll(`.${lineEndMarkerUnexpectedClassName}`)
    .length;
}

afterEach(() => {
  while (views.length > 0) {
    views.pop()?.destroy();
  }
});

describe("line-ending marker extension mounted on a real EditorView (#248/#252)", () => {
  it("renders one marker per tracked break, styled unexpected when the kind differs from editor.lineEnding.expected", () => {
    const { view } = mountWithLineEndings("alpha\r\nbeta\ngamma", "lf");

    expect(markerElementCount(view)).toBe(2);
    expect(unexpectedMarkerElementCount(view)).toBe(1);
  });

  it("renders no unexpected markers when every break matches editor.lineEnding.expected", () => {
    const { view } = mountWithLineEndings("alpha\nbeta\ngamma", "lf");

    expect(markerElementCount(view)).toBe(2);
    expect(unexpectedMarkerElementCount(view)).toBe(0);
  });

  it("shows no decorations when the feature is left out (disabled)", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "alpha\nbeta\ngamma",
        extensions: [createVisibilityExtension([])]
      })
    });
    views.push(view);

    expect(markerElementCount(view)).toBe(0);
  });

  it("does not add extra undo entries when the document is edited", () => {
    const { view } = mountWithLineEndings("alpha\nbeta\ngamma", "lf", [
      history()
    ]);

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
    const { view } = mountWithLineEndings("alpha\nbeta\ngamma", "lf");
    expect(markerElementCount(view)).toBe(2);

    view.dispatch({
      changes: { from: view.state.doc.length, to: view.state.doc.length, insert: "\ndelta" }
    });
    expect(markerElementCount(view)).toBe(3);

    view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
    expect(markerElementCount(view)).toBe(0);
  });

  it("does not accumulate decorations across repeated compartment reconfiguration", () => {
    const { extension } = buildField("alpha\nbeta\ngamma", "lf");
    const compartment = new Compartment();
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "alpha\nbeta\ngamma",
        extensions: [compartment.of(extension)]
      })
    });
    views.push(view);

    expect(markerElementCount(view)).toBe(2);

    for (let i = 0; i < 5; i++) {
      view.dispatch({
        effects: compartment.reconfigure(extension)
      });
      expect(markerElementCount(view)).toBe(2);
    }
  });

  it("does not leave decorations behind for a destroyed view, and a fresh view starts clean", () => {
    const { view: first } = mountWithLineEndings("alpha\nbeta\ngamma", "lf");
    expect(markerElementCount(first)).toBe(2);
    first.destroy();

    const { view: second } = mountWithLineEndings("alpha\nbeta\ngamma", "lf");
    expect(markerElementCount(second)).toBe(2);
  });

  it("keeps decoration work bounded by the viewport on a long document, not by document size (#248 blocker 4)", () => {
    const lineCount = 20000;
    const longDoc = Array.from(
      { length: lineCount },
      (_, i) => `吾輩は猫である。名前はまだ無い。 line ${i}`
    ).join("\n");

    const { view } = mountWithLineEndings(longDoc, "lf");

    const renderedMarkers = markerElementCount(view);

    expect(renderedMarkers).toBeGreaterThan(0);
    expect(renderedMarkers).toBeLessThan(200);
  });

  describe("runtime editor.lineEnding.expected / markerGlyph reconfiguration (#252 review section 10)", () => {
    it("updates marker variants immediately when the visibility compartment is reconfigured with a new expected kind, without touching the #253 tracking field's value", () => {
      const raw = "a\r\nb\r\nc";
      const { field: trackingField, extension: trackingExtension } =
        createLineEndingTrackingExtension(analyzeLineEndings(raw), () => "lf");
      const visibilityCompartment = new Compartment();
      const parent = document.createElement("div");
      document.body.appendChild(parent);

      let currentExpected: "lf" | "crlf" | "cr" = "lf";
      const buildMarkerExtension = () =>
        createVisibilityExtension([
          createLineEndingMarkerFeature(
            trackingField,
            () => currentExpected,
            () => "⏎"
          )
        ]);

      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: raw.replace(/\r\n|\r/g, "\n"),
          extensions: [
            trackingExtension,
            visibilityCompartment.of(buildMarkerExtension())
          ]
        })
      });
      views.push(view);

      // expected = lf: every break is crlf, so all markers are unexpected.
      expect(unexpectedMarkerElementCount(view)).toBe(2);

      const breaksBeforeReconfigure = lineEndingBreakSetToArray(
        view.state.field(trackingField)
      );

      // Simulate a Settings change: expected becomes crlf, and the
      // compartment is reconfigured (mirrors MarkdownEditor.tsx's
      // settings-reconfigure effect) to force an immediate redraw.
      currentExpected = "crlf";
      view.dispatch({
        effects: visibilityCompartment.reconfigure(buildMarkerExtension())
      });

      expect(unexpectedMarkerElementCount(view)).toBe(0);
      // The tracking field's own value is untouched — same breaks, same
      // kinds — proving the Settings change never touched #253 state.
      expect(
        lineEndingBreakSetToArray(view.state.field(trackingField))
      ).toEqual(breaksBeforeReconfigure);
    });

    it("does not create a new undo step when only the visibility compartment is reconfigured", () => {
      const raw = "a\r\nb";
      const { field: trackingField, extension: trackingExtension } =
        createLineEndingTrackingExtension(analyzeLineEndings(raw), () => "lf");
      const visibilityCompartment = new Compartment();
      const parent = document.createElement("div");
      document.body.appendChild(parent);
      const view = new EditorView({
        parent,
        state: EditorState.create({
          doc: raw.replace(/\r\n|\r/g, "\n"),
          extensions: [
            history(),
            trackingExtension,
            visibilityCompartment.of(
              createVisibilityExtension([
                createLineEndingMarkerFeature(
                  trackingField,
                  () => "lf",
                  () => "⏎"
                )
              ])
            )
          ]
        })
      });
      views.push(view);

      view.dispatch({
        effects: visibilityCompartment.reconfigure(
          createVisibilityExtension([
            createLineEndingMarkerFeature(
              trackingField,
              () => "crlf",
              () => "↵"
            )
          ])
        )
      });

      expect(undoDepth(view.state)).toBe(0);
    });
  });
});
