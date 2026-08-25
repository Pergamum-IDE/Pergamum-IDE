import type { EditorState, Extension, Text } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate
} from "@codemirror/view";

/**
 * Phase 5 decoration/visibility foundation.
 *
 * This module intentionally knows nothing about what any concrete feature
 * detects (line endings, paragraph indentation, ...). It only defines how a
 * feature's detected positions become non-mutating CodeMirror decorations,
 * how those decorations stay limited to what's currently visible, and how
 * several features' decorations are combined into one extension.
 */

/**
 * What a feature's `detect` gets to look at. Beyond the document, it
 * carries the `[from, to)` range that decorations are currently needed for
 * (see "viewport-bounded decorations" below) so a feature never has to scan
 * more of the document than is actually about to be shown. This is a plain
 * object (rather than `doc` alone) specifically so it can grow additional
 * fields later (e.g. per-document metadata a future feature needs) without
 * changing every feature's signature again.
 *
 * `state` (#252) is the full `EditorState` the decorations are being
 * computed for — added so a feature can read another CodeMirror
 * `StateField` (e.g. #253's per-break line-ending tracking field) via
 * `state.field(someField, false)`. `doc` remains a separate, explicit
 * field (rather than requiring every feature to write `context.state.doc`)
 * since it predates this addition and every existing feature already reads
 * it directly.
 */
export interface VisibilityDetectionContext {
  readonly doc: Text;
  readonly from: number;
  readonly to: number;
  readonly state: EditorState;
}

/**
 * A single position in the document where a feature wants a marker shown.
 * `variant` is an opaque, feature-owned tag (e.g. "normal" vs "warning")
 * that `createDecoration` can use to vary presentation for the same kind of
 * marker. The foundation never inspects or assigns meaning to it.
 */
export interface VisibilityMarker {
  readonly position: number;
  readonly variant?: string;
}

/**
 * A visibility feature detects positions in the document (`detect`) and
 * describes how each detected position should be decorated
 * (`createDecoration`). Keeping these separate lets a feature's detection
 * logic be tested/reasoned about without any CodeMirror decoration
 * knowledge, and lets decoration rendering change without touching
 * detection.
 */
export interface VisibilityFeature {
  readonly id: string;
  detect(context: VisibilityDetectionContext): readonly VisibilityMarker[];
  createDecoration(marker: VisibilityMarker): Decoration;
}

/**
 * Generic widget that renders fixed text with a caller-supplied class name.
 * Content (what text, what class) belongs to the feature; this widget only
 * knows how to mount that text as a non-editable, assistive-technology-
 * hidden DOM node, keeping styling (CSS, via the class name) separate from
 * what gets displayed. The marker is a visual-only aid, not part of the
 * document text, so it must not be announced by screen readers.
 */
class VisibilityTextWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly className: string
  ) {
    super();
  }

  eq(other: VisibilityTextWidget): boolean {
    return this.text === other.text && this.className === other.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Builds a widget decoration that displays fixed `text` after the marker's
 * position, without inserting anything into the document. Intended to be
 * reused by features that just need to show a small fixed label.
 */
export function createTextMarkerDecoration(
  text: string,
  className: string
): Decoration {
  return Decoration.widget({
    widget: new VisibilityTextWidget(text, className),
    side: 1
  });
}

/**
 * The minimal slice of `EditorView` that decoration computation needs:
 * the current state and the ranges that are actually visible right now.
 * Kept as its own interface (rather than depending on `EditorView`
 * directly) so tests can supply a lightweight fake instead of driving a
 * real, DOM-backed editor view.
 */
export interface VisibilityViewportSource {
  readonly state: EditorState;
  readonly visibleRanges: readonly VisibilityViewportRange[];
}

export interface VisibilityViewportRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Computes decorations only for the currently visible ranges, so the work
 * done per keystroke/scroll is bounded by what's on screen rather than by
 * total document size. `visibleRanges` come straight from CodeMirror's own
 * viewport tracking (see `createVisibilityExtension` below), so no
 * additional virtualization logic is implemented here.
 */
export function computeViewportVisibilityDecorations(
  source: VisibilityViewportSource,
  features: readonly VisibilityFeature[]
): DecorationSet {
  if (features.length === 0) {
    return Decoration.none;
  }

  const entries: { position: number; decoration: Decoration }[] = [];

  for (const range of source.visibleRanges) {
    const context: VisibilityDetectionContext = {
      doc: source.state.doc,
      from: range.from,
      to: range.to,
      state: source.state
    };

    for (const feature of features) {
      for (const marker of feature.detect(context)) {
        entries.push({
          position: marker.position,
          decoration: feature.createDecoration(marker)
        });
      }
    }
  }

  entries.sort(
    (a, b) =>
      a.position - b.position || a.decoration.startSide - b.decoration.startSide
  );

  const builder = new RangeSetBuilder<Decoration>();
  for (const entry of entries) {
    builder.add(entry.position, entry.position, entry.decoration);
  }

  return builder.finish();
}

class VisibilityViewportPlugin implements PluginValue {
  decorations: DecorationSet;

  constructor(
    view: VisibilityViewportSource,
    private readonly features: readonly VisibilityFeature[]
  ) {
    this.decorations = computeViewportVisibilityDecorations(view, features);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = computeViewportVisibilityDecorations(
        update.view,
        this.features
      );
    }
  }
}

/**
 * Combines the given visibility features into a single CodeMirror
 * extension. Decorations are recomputed from the currently visible ranges
 * whenever the document or the viewport changes, so they stay in sync
 * without ever mutating the document, participating in the undo history,
 * or scanning parts of the document that aren't on screen. Passing an
 * empty (or omitted) feature list disables the extension entirely, which
 * is how a feature is turned off.
 */
export function createVisibilityExtension(
  features: readonly VisibilityFeature[] = []
): Extension {
  if (features.length === 0) {
    return [];
  }

  const plugin = ViewPlugin.define(
    (view) => new VisibilityViewportPlugin(view, features),
    { decorations: (value) => value.decorations }
  );

  return [plugin];
}
