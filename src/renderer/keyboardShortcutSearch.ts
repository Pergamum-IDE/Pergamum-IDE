/**
 * #646: search over the Keyboard Shortcuts rows. Pure; simple case-insensitive
 * partial matching (no fuzzy search).
 */

import type {
  KeyboardShortcutCommandGroup,
  KeyboardShortcutOriginKind,
  KeyboardShortcutRow
} from "../shared/keybindings";

/** The user-visible source label: Pergamum / Native / 標準機能. */
export type KeyboardShortcutSourceLabel = (
  source: KeyboardShortcutRow["source"]
) => string;

/**
 * Rows whose title, commandId, key label, raw key, category, scope, when or
 * source label contains `query` (trimmed, case-insensitive). An empty query
 * returns every row in its existing order.
 */
export type KeyboardShortcutOriginLabel = (origin: KeyboardShortcutOriginKind) => string;

export function filterKeyboardShortcutRows(
  rows: readonly KeyboardShortcutRow[],
  query: string,
  sourceLabel: KeyboardShortcutSourceLabel,
  originLabel?: KeyboardShortcutOriginLabel
): KeyboardShortcutRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [...rows];
  }
  return rows.filter((row) =>
    [
      row.title,
      row.commandId,
      row.keyLabel,
      row.key,
      row.category,
      row.scope,
      row.when,
      sourceLabel(row.source),
      row.originKind === null || originLabel === undefined
        ? null
        : originLabel(row.originKind)
    ].some(
      (field) => field !== null && field.toLowerCase().includes(needle)
    )
  );
}

/**
 * #648: groups with at least one matching binding row. A match on one row
 * shows the whole group, so a command's other keys stay visible. An empty
 * query returns every group.
 */
export function filterKeyboardShortcutGroups(
  groups: readonly KeyboardShortcutCommandGroup[],
  query: string,
  sourceLabel: KeyboardShortcutSourceLabel,
  originLabel?: KeyboardShortcutOriginLabel
): KeyboardShortcutCommandGroup[] {
  if (query.trim() === "") {
    return [...groups];
  }
  return groups.filter(
    (group) =>
      filterKeyboardShortcutRows(group.bindings, query, sourceLabel, originLabel).length > 0
  );
}
