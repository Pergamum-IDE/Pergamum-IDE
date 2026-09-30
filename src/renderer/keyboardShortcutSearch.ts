/**
 * #646: search over the Keyboard Shortcuts rows. Pure; simple case-insensitive
 * partial matching (no fuzzy search).
 */

import type { KeyboardShortcutRow } from "../shared/keybindings";

/** The user-visible source label: Pergamum / Native / 標準機能. */
export type KeyboardShortcutSourceLabel = (
  source: KeyboardShortcutRow["source"]
) => string;

/**
 * Rows whose title, commandId, key label, raw key, category, scope, when or
 * source label contains `query` (trimmed, case-insensitive). An empty query
 * returns every row in its existing order.
 */
export function filterKeyboardShortcutRows(
  rows: readonly KeyboardShortcutRow[],
  query: string,
  sourceLabel: KeyboardShortcutSourceLabel
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
      sourceLabel(row.source)
    ].some(
      (field) => field !== null && field.toLowerCase().includes(needle)
    )
  );
}
