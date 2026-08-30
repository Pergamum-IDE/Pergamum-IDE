/**
 * #322: the File Explorer multi-selection model as a pure state machine —
 * no React, no DOM, no keyboard handling, no `FileExplorer.tsx` wiring.
 * #323 connects it to the UI.
 *
 * A selection is a set of project-root-relative entry paths plus an
 * `anchor` — the path a Shift range extends from. Every operation returns a
 * new {@link FileExplorerSelectionState}; the input's `selected` set is
 * never mutated.
 *
 * Range rules (fixed):
 *   R-1  A range is defined over VISIBLE items only. `visibleOrder` (top to
 *        bottom) is the single source of order; a collapsed folder's
 *        children are absent from it and so never fall inside a range.
 *   R-2  `anchor` is explicit. `replace` / `toggle` set it; `extendTo` never
 *        moves it.
 *   R-3  A Shift selection REPLACES the selection — it is not additive.
 *   R-4  Collapsing a folder drops that folder's descendants from the
 *        selection (the folder itself stays — it is still a visible item).
 */

export interface FileExplorerSelectionState {
  readonly selected: ReadonlySet<string>;
  readonly anchor: string | null;
}

export function createEmptyFileExplorerSelection(): FileExplorerSelectionState {
  return { selected: new Set<string>(), anchor: null };
}

/**
 * Plain click / single arrow move: the selection becomes exactly `path` and
 * the anchor moves to it (R-2).
 */
export function replaceFileExplorerSelection(
  _state: FileExplorerSelectionState,
  path: string
): FileExplorerSelectionState {
  return { selected: new Set([path]), anchor: path };
}

/**
 * Ctrl / Cmd + click: add `path` when absent, remove it when present. The
 * anchor moves to `path` either way (R-2) — even when the removal empties
 * the selection.
 */
export function toggleFileExplorerSelection(
  state: FileExplorerSelectionState,
  path: string
): FileExplorerSelectionState {
  const selected = new Set(state.selected);

  if (selected.has(path)) {
    selected.delete(path);
  } else {
    selected.add(path);
  }

  return { selected, anchor: path };
}

/**
 * Shift + click / Shift + arrow: select the inclusive `anchor..path` range
 * as it appears in `visibleOrder`, in either direction. The result REPLACES
 * the selection (R-3) and the anchor is left where it was (R-2).
 *
 * Falls back to {@link replaceFileExplorerSelection} — the safe choice —
 * when there is no anchor, or when the anchor or `path` is not a visible
 * item (an off-screen item must never be pulled into a range, R-1).
 */
export function extendFileExplorerSelectionTo(
  state: FileExplorerSelectionState,
  path: string,
  visibleOrder: readonly string[]
): FileExplorerSelectionState {
  const { anchor } = state;

  if (anchor === null) {
    return replaceFileExplorerSelection(state, path);
  }

  const anchorIndex = visibleOrder.indexOf(anchor);
  const targetIndex = visibleOrder.indexOf(path);

  if (anchorIndex === -1 || targetIndex === -1) {
    return replaceFileExplorerSelection(state, path);
  }

  const from = Math.min(anchorIndex, targetIndex);
  const to = Math.max(anchorIndex, targetIndex);

  return {
    selected: new Set(visibleOrder.slice(from, to + 1)),
    anchor
  };
}

export function clearFileExplorerSelection(
  _state: FileExplorerSelectionState
): FileExplorerSelectionState {
  return createEmptyFileExplorerSelection();
}

/**
 * `true` when `path` sits strictly inside `folderPath`, compared by path
 * SEGMENT rather than raw prefix: `"foo/bar.md"` is inside `"foo"`, but
 * `"foobar.md"` and `"foo-bar/baz.md"` are not. `folderPath` is never
 * inside itself.
 */
export function isFileExplorerDescendantPath(
  path: string,
  folderPath: string
): boolean {
  return path !== folderPath && path.startsWith(`${folderPath}/`);
}

/**
 * Folder collapse (R-4): drop every selected entry that lives inside
 * `folderPath`. The folder itself and unrelated entries are kept; the
 * anchor is untouched.
 */
export function collapseFileExplorerSelection(
  state: FileExplorerSelectionState,
  folderPath: string
): FileExplorerSelectionState {
  const selected = new Set<string>();

  for (const path of state.selected) {
    if (!isFileExplorerDescendantPath(path, folderPath)) {
      selected.add(path);
    }
  }

  return { selected, anchor: state.anchor };
}
