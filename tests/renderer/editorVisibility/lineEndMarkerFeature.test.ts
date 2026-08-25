import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  computeViewportVisibilityDecorations,
  createVisibilityExtension,
  type VisibilityDetectionContext,
  type VisibilityViewportSource
} from "../../../src/renderer/editorVisibility/visibilityFeature";
import {
  lineEndMarkerClassName,
  lineEndMarkerFeature,
  lineEndMarkerText
} from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";

function contextFor(doc: string, from: number, to: number): VisibilityDetectionContext {
  return { doc: EditorState.create({ doc }).doc, from, to };
}

function fakeViewportSource(
  doc: string,
  ranges: readonly { from: number; to: number }[]
): VisibilityViewportSource {
  return {
    state: EditorState.create({ doc }),
    visibleRanges: ranges
  };
}

describe("lineEndMarkerFeature (#248 Phase 5-1 proof of operation)", () => {
  it("detects one marker per line break within the given range, and none after the last line", () => {
    const context = contextFor("one\ntwo\nthree", 0, 13);

    expect(lineEndMarkerFeature.detect(context)).toEqual([
      { position: 3 },
      { position: 7 }
    ]);
  });

  it("detects no markers for a single-line document", () => {
    const context = contextFor("no line breaks here", 0, 19);

    expect(lineEndMarkerFeature.detect(context)).toEqual([]);
  });

  it("only scans the lines overlapping the given range, not the whole document", () => {
    const lineCount = 5000;
    const lines = Array.from({ length: lineCount }, (_, i) => `line ${i}`);
    const doc = lines.join("\n");
    const state = EditorState.create({ doc });

    // A narrow window in the middle of a 5000-line document.
    const windowStartLine = state.doc.line(2500);
    const windowEndLine = state.doc.line(2510);
    const context: VisibilityDetectionContext = {
      doc: state.doc,
      from: windowStartLine.from,
      to: windowEndLine.to
    };

    const markers = lineEndMarkerFeature.detect(context);

    // One marker per line in the 11-line window (2500..2510), never
    // anywhere near the document's 5000 lines.
    expect(markers.length).toBe(11);
    for (const marker of markers) {
      expect(marker.position).toBeGreaterThanOrEqual(context.from);
      expect(marker.position).toBeLessThanOrEqual(context.to);
    }
  });

  it("carries the fixed placeholder text and marker class for its decoration widget", () => {
    const decoration = lineEndMarkerFeature.createDecoration({ position: 0 });
    const widget = (
      decoration.spec as { widget: { text: string; className: string } }
    ).widget;

    expect(widget.text).toBe(lineEndMarkerText);
    expect(widget.className).toBe(lineEndMarkerClassName);
  });

  it("shows one decoration per line end in the visible range when enabled", () => {
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("alpha\nbeta\ngamma", [{ from: 0, to: 16 }]),
      [lineEndMarkerFeature]
    );

    expect(decorations.size).toBe(2);
  });

  it("shows no decorations when the feature is left out (disabled)", () => {
    const decorations = computeViewportVisibilityDecorations(
      fakeViewportSource("alpha\nbeta\ngamma", [{ from: 0, to: 16 }]),
      []
    );

    expect(decorations.size).toBe(0);
  });

  it("follows the document as lines are added and removed", () => {
    let doc = "a\nb";
    let decorations = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 0, to: doc.length }]),
      [lineEndMarkerFeature]
    );
    expect(decorations.size).toBe(1);

    doc = "a\nb\nc\nd";
    decorations = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 0, to: doc.length }]),
      [lineEndMarkerFeature]
    );
    expect(decorations.size).toBe(3);

    doc = "a";
    decorations = computeViewportVisibilityDecorations(
      fakeViewportSource(doc, [{ from: 0, to: doc.length }]),
      [lineEndMarkerFeature]
    );
    expect(decorations.size).toBe(0);
  });

  it("follows the visible range as it scrolls across a long document", () => {
    const lineCount = 2000;
    const doc = Array.from({ length: lineCount }, (_, i) => `line ${i}`).join("\n");
    const state = EditorState.create({ doc });

    const topWindow = { from: 0, to: state.doc.line(10).to };
    const bottomWindow = {
      from: state.doc.line(1990).from,
      to: state.doc.line(2000).to
    };

    const topDecorations = computeViewportVisibilityDecorations(
      { state, visibleRanges: [topWindow] },
      [lineEndMarkerFeature]
    );
    const bottomDecorations = computeViewportVisibilityDecorations(
      { state, visibleRanges: [bottomWindow] },
      [lineEndMarkerFeature]
    );

    expect(topDecorations.size).toBe(10);
    expect(bottomDecorations.size).toBe(10);
  });

  it("is usable through the shared extension factory alongside its enable/disable switch", () => {
    const enabled = createVisibilityExtension([lineEndMarkerFeature]);
    const disabled = createVisibilityExtension([]);

    expect(enabled).not.toEqual([]);
    expect(disabled).toEqual([]);
  });
});
