import type { Decoration } from "@codemirror/view";
import {
  createTextMarkerDecoration,
  type VisibilityDetectionContext,
  type VisibilityFeature,
  type VisibilityMarker
} from "./visibilityFeature";

/**
 * Phase 5-1 proof-of-operation feature: shows a fixed placeholder marker at
 * every line end so the decoration/visibility foundation can be verified
 * end to end.
 *
 * The marker is deliberately meaningless right now. Mapping it to the
 * actual line ending kind (CRLF/LF/CR) is Phase 5-2's responsibility and is
 * explicitly out of scope here.
 */

export const lineEndMarkerClassName = "pergamum-line-end-marker";
export const lineEndMarkerText = "⏎";

function detectLineEnds(
  context: VisibilityDetectionContext
): readonly VisibilityMarker[] {
  const { doc, from, to } = context;
  const markers: VisibilityMarker[] = [];

  // The last line of the whole document never has a following line break,
  // so it gets no marker. Only lines that overlap [from, to) are scanned,
  // which keeps this bounded by the visible range rather than doc size.
  const firstLine = doc.lineAt(from).number;
  const lastEligibleLine = Math.min(doc.lineAt(to).number, doc.lines - 1);

  for (let lineNumber = firstLine; lineNumber <= lastEligibleLine; lineNumber++) {
    markers.push({ position: doc.line(lineNumber).to });
  }

  return markers;
}

function createLineEndDecoration(): Decoration {
  return createTextMarkerDecoration(lineEndMarkerText, lineEndMarkerClassName);
}

export const lineEndMarkerFeature: VisibilityFeature = {
  id: "lineEndMarker",
  detect: detectLineEnds,
  createDecoration: createLineEndDecoration
};
