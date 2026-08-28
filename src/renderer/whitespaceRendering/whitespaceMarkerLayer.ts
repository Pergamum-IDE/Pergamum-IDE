import type { Extension } from "@codemirror/state";
import {
  Direction,
  layer,
  type EditorView,
  type LayerMarker,
  type ViewUpdate
} from "@codemirror/view";
import type { ApplicationEditorWhitespaceSettings } from "../../shared/settings";
import {
  classifyWhitespaceCharacter,
  isAnyWhitespaceCategoryRendered,
  isWhitespaceCategoryRendered,
  type WhitespaceCategory
} from "./whitespaceClassification";

/**
 * #256 (phase 2, revised): configurable whitespace markers drawn on a
 * CodeMirror `layer()` instead of `Decoration.mark()`.
 *
 * Why a layer:
 *
 * The `Decoration.mark()` approach put a `<span>` around each whitespace
 * character *inside* `.cm-content` (the contenteditable). During IME
 * composition the browser merges adjacent inline spans and pulls preedit
 * text into one of them, and CodeMirror then rebuilds the content DOM
 * tiles for the whole `hasComposition` range — destroying and recreating
 * every marker span in that range on each composition cycle. Typing U+3000
 * repeatedly made the visible run of markers shimmer.
 *
 * `layer()` renders into a separate absolutely-positioned `<div class=
 * "cm-layer">` that is a sibling of `.cm-content` under `.cm-scroller`,
 * never contenteditable, `aria-hidden`, and outside every DOM mutation the
 * browser / CodeMirror make for composition. The markers carry their own
 * document-relative geometry (measured with `view.coordsForChar`), and the
 * layer reconciles them by index, reusing each `<div>` in place via
 * `LayerMarker.update()` — so an ordinary edit only rewrites `style.left/
 * top` on existing nodes and never tears a shown marker down.
 *
 * Non-negotiables this satisfies (all structural, not timing-based):
 *  - No document / Save / dirty / undo / selection / caret impact — the
 *    layer only reads coordinates, it never dispatches.
 *  - No inserted text, no `.cm-content` marker span, nothing in the copied
 *    string.
 *  - `pointer-events: none` + `aria-hidden` (the latter set by the layer
 *    view itself) — never an IME target, never in the a11y tree.
 *  - Viewport-aware: only `view.visibleRanges` are scanned.
 *  - No `MutationObserver`, no `setTimeout`, no composition event listener,
 *    no forced DOM replacement, no browser-DOM interference.
 *
 * Line-ending markers (#252) are unrelated and untouched.
 */

export const whitespaceLayerClassName = "pergamum-whitespace-layer";

export const whitespaceLayerMarkerBaseClassName =
  "pergamum-whitespace-layer-marker";

export const whitespaceLayerMarkerCategoryClassName: Record<
  WhitespaceCategory,
  string
> = {
  ideographicSpace: "pergamum-whitespace-layer-marker-ideographic",
  asciiSpace: "pergamum-whitespace-layer-marker-ascii",
  tab: "pergamum-whitespace-layer-marker-tab",
  otherUnicodeSpace: "pergamum-whitespace-layer-marker-other"
};

export const whitespaceLayerMarkerCategoryAttribute = "data-pergamum-whitespace";

// `coordsForChar` / getBoundingClientRect can jitter by a sub-pixel between
// measurements even when nothing moved; treat geometry within this
// tolerance as unchanged so `eq()` reports "same marker" and the layer
// skips the redraw entirely.
const GEOMETRY_EPSILON_PX = 0.01;

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < GEOMETRY_EPSILON_PX;
}

/**
 * One whitespace marker on the layer. Holds everything needed to draw it
 * without any further layout read (per the `LayerMarker` contract).
 */
export class WhitespaceLayerMarker implements LayerMarker {
  constructor(
    /** Document position of the whitespace character (identity + debug). */
    readonly pos: number,
    readonly category: WhitespaceCategory,
    /** Document-relative pixel geometry of the character's box. */
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number
  ) {}

  eq(other: LayerMarker): boolean {
    return (
      other instanceof WhitespaceLayerMarker &&
      other.pos === this.pos &&
      other.category === this.category &&
      approximatelyEqual(other.left, this.left) &&
      approximatelyEqual(other.top, this.top) &&
      approximatelyEqual(other.width, this.width) &&
      approximatelyEqual(other.height, this.height)
    );
  }

  draw(): HTMLElement {
    const dom = document.createElement("div");
    this.applyTo(dom);
    return dom;
  }

  update(dom: HTMLElement, _oldMarker: LayerMarker): boolean {
    // Every category shares one DOM shape — a positioned <div> whose glyph
    // is a CSS background — so any existing marker node can be repositioned
    // and re-tagged in place and reused. Always returning true means the
    // layer never tears a marker <div> down on an ordinary edit, which is
    // what keeps already-shown markers stable while CodeMirror rebuilds the
    // contenteditable during IME composition.
    this.applyTo(dom);
    return true;
  }

  private applyTo(dom: HTMLElement): void {
    dom.className = `${whitespaceLayerMarkerBaseClassName} ${whitespaceLayerMarkerCategoryClassName[this.category]}`;
    dom.setAttribute(whitespaceLayerMarkerCategoryAttribute, this.category);
    dom.style.left = `${this.left}px`;
    dom.style.top = `${this.top}px`;
    dom.style.width = `${this.width}px`;
    dom.style.height = `${this.height}px`;
    // Size the glyph off the measured character box so it follows editor
    // font size / zoom with no hard-coded offset (styles.css uses `em`).
    dom.style.fontSize = `${this.height}px`;
  }
}

interface DocumentOrigin {
  readonly left: number;
  readonly top: number;
}

/**
 * Screen coordinates of the document's (0, 0) — a local mirror of
 * CodeMirror's internal `getBase()`. The layer's wrapper shares this
 * origin, so subtracting it from a character's screen rect yields the
 * document-relative geometry the layer needs. Uses only public
 * `EditorView` surface (`scrollDOM`, `textDirection`, `scaleX/scaleY`).
 */
export function documentOrigin(view: EditorView): DocumentOrigin {
  const rect = view.scrollDOM.getBoundingClientRect();
  const left =
    view.textDirection === Direction.LTR
      ? rect.left
      : rect.right - view.scrollDOM.clientWidth * view.scaleX;

  return {
    left: left - view.scrollDOM.scrollLeft * view.scaleX,
    top: rect.top - view.scrollDOM.scrollTop * view.scaleY
  };
}

/**
 * Scans only `view.visibleRanges`, classifies each character, and turns
 * every enabled-category whitespace character into a `WhitespaceLayerMarker`
 * positioned from `view.coordsForChar`. Runs in the layer's measuring
 * (read) phase, so the layout reads here never interleave with writes.
 *
 * Markers come out in ascending document-position order (visible ranges
 * are ordered and each range is scanned left to right), which is what the
 * layer's index-based reconcile needs to reuse DOM nodes.
 */
export function collectWhitespaceMarkers(
  view: EditorView,
  settings: ApplicationEditorWhitespaceSettings
): WhitespaceLayerMarker[] {
  const origin = documentOrigin(view);
  const doc = view.state.doc;
  const markers: WhitespaceLayerMarker[] = [];

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);

    for (let index = 0; index < text.length; index += 1) {
      const category = classifyWhitespaceCharacter(text[index]);

      if (!category || !isWhitespaceCategoryRendered(category, settings)) {
        continue;
      }

      const pos = from + index;
      const rect = view.coordsForChar(pos);

      if (!rect) {
        // Not currently resolvable to a rendered rect (e.g. right at a
        // soft-wrap boundary): skip this frame rather than guess.
        continue;
      }

      markers.push(
        new WhitespaceLayerMarker(
          pos,
          category,
          rect.left - origin.left,
          rect.top - origin.top,
          rect.right - rect.left,
          rect.bottom - rect.top
        )
      );
    }
  }

  return markers;
}

/**
 * Builds the whitespace-marker layer extension for the current settings.
 *
 * Returns an empty extension when no category is enabled (no layer, no
 * scanning). MarkdownEditor.tsx reconfigures its compartment with a fresh
 * call to this whenever any of the four booleans changes, which tears down
 * and rebuilds just this layer — the `EditorView` and every other
 * extension are untouched, and it is not a document change (no dirty, no
 * undo entry, no caret move). `getSettings` is read live on every measure,
 * so after a document switch the new document is decorated with the
 * current effective settings.
 */
export function whitespaceMarkerLayer(
  getSettings: () => ApplicationEditorWhitespaceSettings
): Extension {
  if (!isAnyWhitespaceCategoryRendered(getSettings())) {
    return [];
  }

  return layer({
    // Above the text: faint, `pointer-events: none` markers that stay
    // visible even where a selection background is drawn (parity with the
    // old span-background behaviour).
    above: true,
    class: whitespaceLayerClassName,
    // Re-measure on edits and on viewport/visible-range changes (scroll).
    // The layer view additionally re-measures on `geometryChanged`
    // (resize / font / zoom) on its own, and `eq()` no-ops the redraw when
    // nothing actually moved.
    update: (update: ViewUpdate) =>
      update.docChanged || update.viewportChanged,
    markers: (view) => {
      const settings = getSettings();

      return isAnyWhitespaceCategoryRendered(settings)
        ? collectWhitespaceMarkers(view, settings)
        : [];
    }
  });
}
