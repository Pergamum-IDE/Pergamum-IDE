import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateField,
  type Extension
} from "@codemirror/state";
import { highlightSelectionMatches } from "@codemirror/search";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { SelectionHighlightMode } from "../shared/settings";
import { findTextSearchMatches } from "../shared/textSearch";

export const SMART_SELECTION_HIGHLIGHT_MAX_LENGTH = 200;

// Shared across MarkdownEditor mount lifetimes so an App-owned cached
// EditorState can still be reconfigured after EditorSurface unmount/remount.
export const selectionHighlightCompartment = new Compartment();

export interface SmartSelectionHighlightRange {
  readonly from: number;
  readonly to: number;
}

const smartSelectionMatchMark = Decoration.mark({
  class: "cm-pergamum-selectionMatch"
});

function readSmartSelectionQuery(state: EditorState): string | null {
  if (state.selection.ranges.length !== 1) {
    return null;
  }

  const selection = state.selection.main;

  if (selection.empty) {
    return null;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  const selectedText = state.doc.sliceString(from, to);

  if (
    selectedText.length > SMART_SELECTION_HIGHLIGHT_MAX_LENGTH ||
    selectedText.trim().length === 0 ||
    /[\r\n]/.test(selectedText)
  ) {
    return null;
  }

  return selectedText;
}

export function findSmartSelectionHighlightRanges(
  state: EditorState
): readonly SmartSelectionHighlightRange[] {
  const query = readSmartSelectionQuery(state);

  if (!query) {
    return [];
  }

  return findTextSearchMatches(state.doc.toString(), query, {
    caseSensitive: false,
    wholeWord: true,
    useRegex: false
  }).map((match) => ({
    from: match.startOffset,
    to: match.endOffset
  }));
}

function buildSmartSelectionDecorationSet(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let lastEnd = -1;

  for (const range of findSmartSelectionHighlightRanges(state)) {
    const from = Math.max(0, Math.min(range.from, state.doc.length));
    const to = Math.max(from, Math.min(range.to, state.doc.length));

    if (to <= from || from < lastEnd) {
      continue;
    }

    builder.add(from, to, smartSelectionMatchMark);
    lastEnd = to;
  }

  return builder.finish();
}

export const smartSelectionHighlightField = StateField.define<DecorationSet>({
  create(state) {
    return buildSmartSelectionDecorationSet(state);
  },
  update(_value, transaction) {
    return buildSmartSelectionDecorationSet(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function createSelectionHighlightExtension(
  mode: SelectionHighlightMode
): Extension {
  switch (mode) {
    case "off":
      return [];
    case "default":
      return highlightSelectionMatches();
    case "smart":
      return smartSelectionHighlightField;
  }
}
