import { EditorState, type TransactionSpec } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import {
  computeViewportVisibilityDecorations,
  createVisibilityExtension,
  type VisibilityDetectionContext
} from "../../../src/renderer/editorVisibility/visibilityFeature";
import {
  createLineEndingMarkerFeature,
  createLineEndingVisibilityFeatures,
  lineEndMarkerClassName,
  lineEndMarkerUnexpectedClassName
} from "../../../src/renderer/editorVisibility/lineEndMarkerFeature";
import {
  createLineEndingTrackingExtension,
  lineEndingBreakSetToArray
} from "../../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../../src/renderer/lineEndingTracking";

/**
 * #252: these tests drive the real #253 tracking StateField
 * (createLineEndingTrackingExtension) as the marker feature's data source —
 * never a test-local reimplementation of line-ending analysis — per the
 * Issue's explicit instruction to source markers from #253's tracking
 * state, not a separate raw-content reparse.
 */

function stateWithMarkerFeature(
  doc: string,
  expectedKind: "lf" | "crlf" | "cr",
  markerGlyph = "⏎"
) {
  const { field, extension: trackingExtension } =
    createLineEndingTrackingExtension(analyzeLineEndings(doc), () => "lf");
  const markerFeature = createLineEndingMarkerFeature(
    field,
    () => expectedKind,
    () => markerGlyph
  );
  const state = EditorState.create({
    doc: doc.replace(/\r\n|\r/g, "\n"),
    extensions: [trackingExtension]
  });

  return { state, field, markerFeature };
}

function fullDocContext(state: EditorState): VisibilityDetectionContext {
  return { doc: state.doc, from: 0, to: state.doc.length, state };
}

describe("createLineEndingMarkerFeature (#252)", () => {
  describe("expected/unexpected marker variant", () => {
    it("marks an LF break as expected when editor.lineEnding.expected is lf", () => {
      const { state, markerFeature } = stateWithMarkerFeature("a\nb", "lf");

      expect(markerFeature.detect(fullDocContext(state))).toEqual([
        { position: 1, variant: "expected" }
      ]);
    });

    it("marks a CRLF break as unexpected when editor.lineEnding.expected is lf", () => {
      const { state, markerFeature } = stateWithMarkerFeature(
        "a\r\nb",
        "lf"
      );

      expect(markerFeature.detect(fullDocContext(state))).toEqual([
        { position: 1, variant: "unexpected" }
      ]);
    });

    it("marks a CR break as unexpected when editor.lineEnding.expected is lf", () => {
      const { state, markerFeature } = stateWithMarkerFeature("a\rb", "lf");

      expect(markerFeature.detect(fullDocContext(state))).toEqual([
        { position: 1, variant: "unexpected" }
      ]);
    });

    it("classifies each break of a mixed document independently against editor.lineEnding.expected = crlf", () => {
      const raw = "one\r\ntwo\nthree\rfour";
      const { state, markerFeature } = stateWithMarkerFeature(raw, "crlf");

      const markers = markerFeature.detect(fullDocContext(state));
      const breaks = analyzeLineEndings(raw);

      expect(markers).toHaveLength(breaks.length);
      for (const marker of markers) {
        const matchingBreak = breaks.find((b) => b.position === marker.position);
        expect(matchingBreak).toBeDefined();
        expect(marker.variant).toBe(
          matchingBreak?.kind === "crlf" ? "expected" : "unexpected"
        );
      }
      // Confirms the mixed document actually produced both variants —
      // otherwise this test wouldn't be exercising the comparison at all.
      expect(markers.some((m) => m.variant === "expected")).toBe(true);
      expect(markers.some((m) => m.variant === "unexpected")).toBe(true);
    });
  });

  describe("marker glyph (#252 editor.lineEnding.markerGlyph)", () => {
    it.each(["⏎", "↵", "↓"] as const)(
      "renders the configured glyph %s for every marker, regardless of variant",
      (glyph) => {
        const { state, markerFeature } = stateWithMarkerFeature(
          "a\r\nb\nc",
          "lf",
          glyph
        );

        const markers = markerFeature.detect(fullDocContext(state));
        expect(markers.length).toBeGreaterThan(0);

        for (const marker of markers) {
          const decoration = markerFeature.createDecoration(marker);
          const widget = (
            decoration.spec as { widget: { text: string; className: string } }
          ).widget;

          expect(widget.text).toBe(glyph);
        }
      }
    );

    it("uses the same glyph for expected and unexpected markers — variant is shown via class, not glyph choice", () => {
      const { state, markerFeature } = stateWithMarkerFeature(
        "a\r\nb\nc",
        "lf",
        "↵"
      );
      const markers = markerFeature.detect(fullDocContext(state));
      const expectedMarker = markers.find((m) => m.variant === "expected");
      const unexpectedMarker = markers.find((m) => m.variant === "unexpected");

      expect(expectedMarker).toBeDefined();
      expect(unexpectedMarker).toBeDefined();

      const expectedWidget = (
        markerFeature.createDecoration(expectedMarker!).spec as {
          widget: { text: string; className: string };
        }
      ).widget;
      const unexpectedWidget = (
        markerFeature.createDecoration(unexpectedMarker!).spec as {
          widget: { text: string; className: string };
        }
      ).widget;

      expect(expectedWidget.text).toBe("↵");
      expect(unexpectedWidget.text).toBe("↵");
      expect(expectedWidget.className).toBe(lineEndMarkerClassName);
      expect(unexpectedWidget.className).toBe(
        `${lineEndMarkerClassName} ${lineEndMarkerUnexpectedClassName}`
      );
    });

    it("changing the glyph getter does not change any tracked break's kind (#252 review: settings never touch #253 state)", () => {
      const { state, field } = stateWithMarkerFeature("a\r\nb\nc", "lf", "⏎");
      const before = lineEndingBreakSetToArray(state.field(field));

      // Simulate a live glyph-setting change by building a second feature
      // against the SAME field/state with a different getter — this is
      // exactly what MarkdownEditor.tsx's settings-reconfigure effect does
      // (new feature instance, same tracking field, same state/doc).
      const otherGlyphFeature = createLineEndingMarkerFeature(
        field,
        () => "lf",
        () => "↓"
      );
      otherGlyphFeature.detect(fullDocContext(state));

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual(before);
    });
  });

  describe("#253 integration — real StateField as the only source of truth", () => {
    it("uses the actual tracked positions, not a re-derived scan of raw content", () => {
      const raw = "a\r\nb\r\nc";
      const { state, markerFeature } = stateWithMarkerFeature(raw, "crlf");
      const trackedBreaks = analyzeLineEndings(raw);

      const markers = markerFeature.detect(fullDocContext(state));

      expect(markers.map((m) => m.position).sort((a, b) => a - b)).toEqual(
        trackedBreaks.map((b) => b.position).sort((a, b) => a - b)
      );
    });

    it("follows a break's position after an edit shifts it, reading the current field value each time", () => {
      const { state: initialState, field, markerFeature } =
        stateWithMarkerFeature("aaa\r\nbbb", "crlf");

      // Insert "X" before the break, shifting it from 3 to 4.
      const nextState = initialState.update({
        changes: { from: 0, to: 0, insert: "X" }
      }).state;

      expect(lineEndingBreakSetToArray(nextState.field(field))).toEqual([
        { position: 4, kind: "crlf" }
      ]);
      expect(
        markerFeature.detect({
          doc: nextState.doc,
          from: 0,
          to: nextState.doc.length,
          state: nextState
        })
      ).toEqual([{ position: 4, variant: "expected" }]);
    });

    it("reflects Undo/Redo of the tracked breaks, not a stale snapshot", () => {
      // "a\r\nb" -> normalized "a\nb", crlf break at position 1. history()
      // must be installed for undo()/redo() to do anything at all, and the
      // delete range must strictly *contain* position 1 (not merely touch
      // its boundary) for RangeSet.map to reliably drop it — see #253's
      // own documented boundary-case findings.
      const { field: trackingField, extension: trackingExtension } =
        createLineEndingTrackingExtension(
          analyzeLineEndings("a\r\nb"),
          () => "lf"
        );
      const markerFeature = createLineEndingMarkerFeature(
        trackingField,
        () => "crlf",
        () => "⏎"
      );
      const initialState = EditorState.create({
        doc: "a\nb",
        extensions: [history(), trackingExtension]
      });
      let state = initialState;
      const field = trackingField;
      const view = {
        get state() {
          return state;
        },
        dispatch: (spec: TransactionSpec) => {
          state = state.update(spec).state;
        }
      };

      // Delete "a\n" (positions 0-2), which strictly contains the break at
      // position 1.
      view.dispatch({ changes: { from: 0, to: 2 } });
      expect(
        markerFeature.detect({
          doc: view.state.doc,
          from: 0,
          to: view.state.doc.length,
          state: view.state
        })
      ).toEqual([]);

      undo(view);
      expect(
        markerFeature.detect({
          doc: view.state.doc,
          from: 0,
          to: view.state.doc.length,
          state: view.state
        })
      ).toEqual([{ position: 1, variant: "expected" }]);

      redo(view);
      expect(
        markerFeature.detect({
          doc: view.state.doc,
          from: 0,
          to: view.state.doc.length,
          state: view.state
        })
      ).toEqual([]);
      // Sanity: the field itself, not just the marker output, followed.
      expect(lineEndingBreakSetToArray(view.state.field(field))).toEqual([]);
    });
  });

  describe("viewport-bounded scanning (#248 architecture preserved)", () => {
    it("only scans breaks overlapping the given range on a long document", () => {
      const lineCount = 5000;
      const doc = Array.from({ length: lineCount }, (_, i) => `line ${i}`).join(
        "\n"
      );
      const { state, markerFeature } = stateWithMarkerFeature(doc, "lf");

      const windowStart = state.doc.line(2500).from;
      const windowEnd = state.doc.line(2510).to;
      const markers = markerFeature.detect({
        doc: state.doc,
        from: windowStart,
        to: windowEnd,
        state
      });

      expect(markers.length).toBeGreaterThan(0);
      expect(markers.length).toBeLessThan(15);
      for (const marker of markers) {
        expect(marker.position).toBeGreaterThanOrEqual(windowStart);
        expect(marker.position).toBeLessThanOrEqual(windowEnd);
      }
    });

    it("returns no markers when the tracking field is absent from state (defensive — feature never crashes)", () => {
      const { field } = createLineEndingTrackingExtension([], () => "lf");
      const markerFeature = createLineEndingMarkerFeature(
        field,
        () => "lf",
        () => "⏎"
      );
      // A state that never installed the tracking extension at all.
      const bareState = EditorState.create({ doc: "a\nb" });

      expect(
        markerFeature.detect({
          doc: bareState.doc,
          from: 0,
          to: bareState.doc.length,
          state: bareState
        })
      ).toEqual([]);
    });
  });

  describe("via the shared visibility extension factory", () => {
    it("is usable through computeViewportVisibilityDecorations like any other feature", () => {
      const { state, markerFeature } = stateWithMarkerFeature(
        "alpha\r\nbeta\ngamma",
        "lf"
      );

      const decorations = computeViewportVisibilityDecorations(
        { state, visibleRanges: [{ from: 0, to: state.doc.length }] },
        [markerFeature]
      );

      expect(decorations.size).toBe(2);
    });

    it("is usable through the shared extension factory alongside its enable/disable switch", () => {
      const { markerFeature } = stateWithMarkerFeature("a\nb", "lf");
      const enabled = createVisibilityExtension([markerFeature]);
      const disabled = createVisibilityExtension([]);

      expect(enabled).not.toEqual([]);
      expect(disabled).toEqual([]);
    });
  });

  describe("createLineEndingVisibilityFeatures — editor.lineEnding.markerGlyph = 'none' (#252 follow-up)", () => {
    it("returns no features (no inline marker at all) when markerGlyph is 'none'", () => {
      const { field } = createLineEndingTrackingExtension(
        analyzeLineEndings("a\r\nb\nc"),
        () => "lf"
      );

      const features = createLineEndingVisibilityFeatures(
        "none",
        field,
        () => "lf",
        () => "none"
      );

      expect(features).toEqual([]);
    });

    it("returns the marker feature, unchanged, for every non-'none' glyph value", () => {
      const { field } = createLineEndingTrackingExtension(
        analyzeLineEndings("a\r\nb\nc"),
        () => "lf"
      );

      for (const glyph of ["⏎", "↵", "↓"] as const) {
        const features = createLineEndingVisibilityFeatures(
          glyph,
          field,
          () => "lf",
          () => glyph
        );

        expect(features).toHaveLength(1);
        expect(features[0]?.id).toBe("lineEndingMarker");
      }
    });

    it("produces no decorations when composed through the shared visibility extension factory with markerGlyph = 'none'", () => {
      const { field, extension: trackingExtension } =
        createLineEndingTrackingExtension(
          analyzeLineEndings("a\r\nb\nc"),
          () => "lf"
        );
      const state = EditorState.create({
        doc: "a\nb\nc",
        extensions: [trackingExtension]
      });
      const decorations = computeViewportVisibilityDecorations(
        { state, visibleRanges: [{ from: 0, to: state.doc.length }] },
        createLineEndingVisibilityFeatures(
          "none",
          field,
          () => "lf",
          () => "none"
        )
      );

      expect(decorations.size).toBe(0);
    });

    it("does not affect #253 tracking: the field keeps updating across edits regardless of markerGlyph", () => {
      const { field, extension: trackingExtension } =
        createLineEndingTrackingExtension(
          analyzeLineEndings("A\r\nB"),
          () => "lf"
        );
      let state = EditorState.create({
        doc: "A\nB",
        extensions: [trackingExtension]
      });

      // No marker feature installed at all (markerGlyph = "none")...
      const features = createLineEndingVisibilityFeatures(
        "none",
        field,
        () => "lf",
        () => "none"
      );
      expect(features).toEqual([]);

      // ...yet the tracking field itself is completely unaffected and
      // keeps following edits exactly as it would with a glyph selected.
      // "A\nB" is length 3; append "\nC" at the end (no following break,
      // so the new break inherits the preceding crlf break's kind).
      state = state.update({
        changes: { from: state.doc.length, to: state.doc.length, insert: "\nC" }
      }).state;

      expect(lineEndingBreakSetToArray(state.field(field))).toEqual([
        { position: 1, kind: "crlf" },
        { position: 3, kind: "crlf" }
      ]);
    });
  });
});
