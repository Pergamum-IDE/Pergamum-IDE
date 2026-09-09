/**
 * #424 Slice 2 — "マークする" (mark all) highlights for the active-document
 * Find panel.
 *
 * A `StateField<DecorationSet>` fed by two `StateEffect`s dispatched from the
 * React owner (`MarkdownEditorSurface`, via MarkdownEditor's `activeFindHighlight`
 * prop):
 *
 * - `setActiveFindHighlightsEffect` — replace the highlight set with the
 *   given match ranges; the one at `activeIndex` gets an extra class.
 * - `clearActiveFindHighlightsEffect` — drop every highlight (panel closed,
 *   mark-all off, empty query, invalid regex, no matches, document switch).
 *
 * The field is byte-for-byte inert until the first `set` effect, so it is
 * safe to install on every Markdown document's EditorState. Highlights are
 * mapped through document edits so they never point at stale offsets before
 * the panel re-dispatches a fresh set.
 */

import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface ActiveFindHighlightRange {
  readonly from: number;
  readonly to: number;
}

export interface ActiveFindHighlightSpec {
  /** Match ranges, ascending and non-overlapping (as `findTextSearchMatches`
   *  returns them). */
  readonly matches: readonly ActiveFindHighlightRange[];
  /** Index into `matches` of the current match, or `null`. */
  readonly activeIndex: number | null;
}

export const setActiveFindHighlightsEffect =
  StateEffect.define<ActiveFindHighlightSpec>();
export const clearActiveFindHighlightsEffect = StateEffect.define<null>();

/** #424: both classes so `-active` can layer emphasis on the base style. */
const findMatchMark = Decoration.mark({ class: "cm-pergamum-findMatch" });
const findMatchActiveMark = Decoration.mark({
  class: "cm-pergamum-findMatch cm-pergamum-findMatch-active"
});

function buildDecorationSet(
  spec: ActiveFindHighlightSpec,
  docLength: number
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;
  spec.matches.forEach((range, index) => {
    const from = Math.max(0, Math.min(range.from, docLength));
    const to = Math.max(from, Math.min(range.to, docLength));
    // RangeSetBuilder requires ascending, non-overlapping additions; skip
    // anything that would violate that rather than throw.
    if (to <= from || from < lastEnd) {
      return;
    }
    builder.add(
      from,
      to,
      index === spec.activeIndex ? findMatchActiveMark : findMatchMark
    );
    lastEnd = to;
  });
  return builder.finish();
}

export const activeFindHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    let next = transaction.docChanged
      ? value.map(transaction.changes)
      : value;
    for (const effect of transaction.effects) {
      if (effect.is(setActiveFindHighlightsEffect)) {
        next = buildDecorationSet(effect.value, transaction.state.doc.length);
      } else if (effect.is(clearActiveFindHighlightsEffect)) {
        next = Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

/** `true` when this state currently paints at least one Find highlight. */
export function hasActiveFindHighlights(state: {
  field: (f: typeof activeFindHighlightField) => DecorationSet;
}): boolean {
  return state.field(activeFindHighlightField).size > 0;
}
