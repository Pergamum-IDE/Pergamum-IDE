import type { StateField } from "@codemirror/state";
import type { Decoration } from "@codemirror/view";
import type { LineEndingBreakSet } from "../editorLineEndingField";
import type { LineEndingKind } from "../lineEndingTracking";
import type { LineEndingMarkerGlyph } from "../../shared/settings";
import {
  createTextMarkerDecoration,
  type VisibilityDetectionContext,
  type VisibilityFeature,
  type VisibilityMarker
} from "./visibilityFeature";

/**
 * #252: the #248 placeholder line-end marker, now integrated with #253's
 * per-break line-ending tracking. Shows `editor.lineEnding.markerGlyph` at
 * every tracked break in the visible range, styled as "expected" or
 * "unexpected" depending on whether the break's actual kind matches
 * `editor.lineEnding.expected` — a read-only diagnostic. This feature never
 * writes to the document and never decides a save-time conversion; that
 * stays #253's responsibility (see lineEndingTracking.ts).
 */

export const lineEndMarkerClassName = "pergamum-line-end-marker";
export const lineEndMarkerUnexpectedClassName =
  "pergamum-line-end-marker-unexpected";

/**
 * Builds the feature. `lineEndingField` is the same `StateField` instance
 * #253's tracking extension installs (see MarkdownEditor.tsx) — this
 * feature only ever reads it via `state.field(lineEndingField, false)`,
 * never `lineEndingBreakSetToArray`, so a keystroke that touches no line
 * break costs this feature nothing extra beyond the viewport-bounded
 * `RangeSet.between` scan below.
 *
 * `getExpectedKind`/`getMarkerGlyph` are read fresh on every `detect()`
 * call rather than captured once, so a runtime Settings change is honored
 * on the next decoration recompute without rebuilding this feature or
 * reconfiguring the tracking field itself — the same live-getter pattern
 * #253 uses for `files.newFile.lineEnding`.
 */
export function createLineEndingMarkerFeature(
  lineEndingField: StateField<LineEndingBreakSet>,
  getExpectedKind: () => LineEndingKind,
  getMarkerGlyph: () => string
): VisibilityFeature {
  function detect(
    context: VisibilityDetectionContext
  ): readonly VisibilityMarker[] {
    const breaks = context.state.field(lineEndingField, false);

    if (!breaks) {
      return [];
    }

    const expectedKind = getExpectedKind();
    const markers: VisibilityMarker[] = [];

    // RangeSet.between only visits ranges overlapping [from, to) — the
    // document's own last line (which has no trailing break at all) is
    // never in this set to begin with, so no separate "skip the last
    // line" check is needed here (unlike the #248 placeholder feature,
    // which derived markers from line boundaries rather than tracked
    // breaks).
    breaks.between(context.from, context.to, (position, _to, value) => {
      markers.push({
        position,
        variant: value.kind === expectedKind ? "expected" : "unexpected"
      });
    });

    return markers;
  }

  function createDecoration(marker: VisibilityMarker): Decoration {
    const className =
      marker.variant === "unexpected"
        ? `${lineEndMarkerClassName} ${lineEndMarkerUnexpectedClassName}`
        : lineEndMarkerClassName;

    return createTextMarkerDecoration(getMarkerGlyph(), className);
  }

  return {
    id: "lineEndingMarker",
    detect,
    createDecoration
  };
}

/**
 * #252 follow-up: `editor.lineEnding.markerGlyph`'s explicit `"none"` value
 * means "draw no inline marker at all" — decided here, once, at the point
 * the visibility feature list is built (mount, and the settings-reconfigure
 * effect), rather than inside `detect()`/`createDecoration()` above. This
 * keeps the feature itself unaware of "no marker" as a concept: when a
 * glyph *is* selected, its expected/unexpected detection and color-coding
 * semantics are exactly as before this change. `"none"` never affects
 * #253's tracking (`lineEndingField` keeps updating regardless) or the
 * Line Ending Distribution query/dialog, since neither depends on this
 * feature being installed.
 */
export function createLineEndingVisibilityFeatures(
  markerGlyph: LineEndingMarkerGlyph,
  lineEndingField: StateField<LineEndingBreakSet>,
  getExpectedKind: () => LineEndingKind,
  getMarkerGlyph: () => string
): VisibilityFeature[] {
  if (markerGlyph === "none") {
    return [];
  }

  return [
    createLineEndingMarkerFeature(lineEndingField, getExpectedKind, getMarkerGlyph)
  ];
}
