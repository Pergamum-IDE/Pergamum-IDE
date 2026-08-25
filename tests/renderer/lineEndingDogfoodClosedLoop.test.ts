import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { createLineEndingTrackingExtension } from "../../src/renderer/editorLineEndingField";
import { createLineEndingMarkerFeature } from "../../src/renderer/editorVisibility/lineEndMarkerFeature";
import { computeLineEndingDistribution } from "../../src/renderer/lineEndingDistribution";
import type { VisibilityDetectionContext } from "../../src/renderer/editorVisibility/visibilityFeature";

/**
 * #252/#253 closed-loop verification (post boundary-delete fix).
 *
 * This test does NOT re-investigate the root cause and does NOT modify
 * any #252 production code. It exercises the real #253
 * `createLineEndingTrackingExtension` StateField together with the real
 * #252 `createLineEndingMarkerFeature` and `computeLineEndingDistribution`
 * — exactly the same production functions #252 already used — against the
 * dogfood fixture numbers reported (LF 1 / CRLF 5 / CR 1 / total 7 /
 * expected LF / unexpected 6), to confirm that once #253's
 * `LineEndingBreakSet` is corrected, #252 "just works" without any
 * #252-side change.
 */
describe("#252/#253 dogfood closed-loop (boundary-delete fix)", () => {
  function fullDocContext(state: EditorState): VisibilityDetectionContext {
    return { doc: state.doc, from: 0, to: state.doc.length, state };
  }

  it("reproduces the dogfood fixture's initial distribution: LF 1 / CRLF 5 / CR 1 / total 7 / unexpected 6", () => {
    // "A\nB\nC\nD\nE\nF\nG\nH": 7 breaks at positions 1,3,5,7,9,11,13 —
    // 5 CRLF, 1 LF, 1 CR (matches the reported dogfood counts exactly).
    const initialBreaks = [
      { position: 1, kind: "crlf" as const },
      { position: 3, kind: "crlf" as const },
      { position: 5, kind: "crlf" as const },
      { position: 7, kind: "crlf" as const },
      { position: 9, kind: "crlf" as const },
      { position: 11, kind: "lf" as const },
      { position: 13, kind: "cr" as const }
    ];
    const { field, extension } = createLineEndingTrackingExtension(
      initialBreaks,
      () => "lf"
    );
    const state = EditorState.create({
      doc: "A\nB\nC\nD\nE\nF\nG\nH",
      extensions: [extension]
    });

    const distribution = computeLineEndingDistribution(
      state.field(field),
      "lf"
    );

    expect(distribution.counts).toEqual({ lf: 1, crlf: 5, cr: 1 });
    expect(distribution.total).toBe(7);
    expect(distribution.expectedKind).toBe("lf");
    expect(distribution.unexpectedCount).toBe(6);
  });

  it("after boundary-deleting one CRLF break's single character, both the marker feature and the distribution query reflect the corrected state — LF 1 / CRLF 4 / CR 1 / total 6 / unexpected 5, and no ghost marker at the deleted position", () => {
    const initialBreaks = [
      { position: 1, kind: "crlf" as const },
      { position: 3, kind: "crlf" as const },
      { position: 5, kind: "crlf" as const },
      { position: 7, kind: "crlf" as const },
      { position: 9, kind: "crlf" as const },
      { position: 11, kind: "lf" as const },
      { position: 13, kind: "cr" as const }
    ];
    const { field, extension } = createLineEndingTrackingExtension(
      initialBreaks,
      () => "lf"
    );
    const markerFeature = createLineEndingMarkerFeature(
      field,
      () => "lf",
      () => "⏎"
    );
    let state = EditorState.create({
      doc: "A\nB\nC\nD\nE\nF\nG\nH",
      extensions: [extension]
    });

    // Delete exactly the first CRLF break's single normalized character —
    // the exact dogfood action ("CRLF break を1個だけ削除").
    state = state.update({ changes: { from: 1, to: 2 } }).state;

    expect(state.doc.toString()).toBe("AB\nC\nD\nE\nF\nG\nH");

    // #252's distribution query, reading the (now corrected) #253 field —
    // no #252 code was changed to make this pass.
    const distribution = computeLineEndingDistribution(
      state.field(field),
      "lf"
    );
    expect(distribution.counts).toEqual({ lf: 1, crlf: 4, cr: 1 });
    expect(distribution.total).toBe(6);
    expect(distribution.unexpectedCount).toBe(5);

    // #252's marker feature must not report a ghost marker at the
    // deleted position (old position 1 — now collapsed into where "B"
    // starts, position 1 in "AB\nC...").
    const markers = markerFeature.detect(fullDocContext(state));
    expect(markers.some((marker) => marker.position === 1)).toBe(false);
    expect(markers).toHaveLength(6);
  });
});
