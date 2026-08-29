/**
 * Phase 6-4-4: pure sort / selection / header-checkbox logic for the
 * Recovery candidate dialog. DOM-free and side-effect free so it can be
 * unit-tested without React.
 *
 * Selection is always keyed by `recoveryId` (stable row identity), never by
 * visible index — sorting therefore never changes which rows are selected.
 */

import type { RecoveryCandidate } from "../../shared/recoveryCandidate";

export type RecoverySortKey =
  | "displayName"
  | "updatedAt"
  | "characterCount"
  | "documentType";

export type RecoverySortDirection = "asc" | "desc";

export interface RecoverySortState {
  readonly key: RecoverySortKey;
  readonly direction: RecoverySortDirection;
}

export const RECOVERY_SORTABLE_KEYS: readonly RecoverySortKey[] = [
  "displayName",
  "updatedAt",
  "characterCount",
  "documentType"
];

export const RECOVERY_INITIAL_SORT: RecoverySortState = {
  key: "updatedAt",
  direction: "desc"
};

export function isRecoverySortKey(value: string): value is RecoverySortKey {
  return (RECOVERY_SORTABLE_KEYS as readonly string[]).includes(value);
}

/**
 * #288 follow-up: the dialog's "Last updated" column shows `yyyy-MM-dd` only.
 * Sorting still compares the full `candidate.updatedAt` value (see
 * `keyComparison`), and the Recovery report keeps the full timestamp — this
 * helper is display-only.
 */
export function recoveryUpdatedAtDisplayDate(updatedAt: string): string {
  const isoDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(updatedAt);
  if (isoDateMatch) {
    return isoDateMatch[1];
  }

  const parsed = new Date(updatedAt);
  return Number.isNaN(parsed.getTime())
    ? updatedAt
    : parsed.toISOString().slice(0, 10);
}

/**
 * Header click: re-clicking the active key toggles asc/desc; clicking a
 * different key switches to it, ascending.
 */
export function nextRecoverySortState(
  current: RecoverySortState,
  clickedKey: RecoverySortKey
): RecoverySortState {
  if (current.key === clickedKey) {
    return {
      key: clickedKey,
      direction: current.direction === "asc" ? "desc" : "asc"
    };
  }

  return { key: clickedKey, direction: "asc" };
}

/** `"▲"` / `"▼"` for the active sort header only; `null` otherwise. */
export function recoverySortIndicator(
  sort: RecoverySortState,
  key: RecoverySortKey
): "▲" | "▼" | null {
  if (sort.key !== key) {
    return null;
  }

  return sort.direction === "asc" ? "▲" : "▼";
}

function keyComparison(
  a: RecoveryCandidate,
  b: RecoveryCandidate,
  key: RecoverySortKey
): number {
  switch (key) {
    case "displayName":
      return a.displayName.localeCompare(b.displayName);
    case "updatedAt":
      // ISO-8601 strings compare chronologically.
      return a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0;
    case "characterCount":
      return a.characterCount - b.characterCount;
    case "documentType":
      return a.documentType.localeCompare(b.documentType);
  }
}

/** A new, sorted array. `recoveryId` breaks ties for a stable order. */
export function sortRecoveryCandidates(
  candidates: readonly RecoveryCandidate[],
  sort: RecoverySortState
): RecoveryCandidate[] {
  const sign = sort.direction === "asc" ? 1 : -1;

  return [...candidates].sort((a, b) => {
    const primary = keyComparison(a, b, sort.key);
    const base =
      primary !== 0 ? primary : a.recoveryId.localeCompare(b.recoveryId);
    return sign * base;
  });
}

export type RecoveryHeaderCheckboxState =
  | "unchecked"
  | "indeterminate"
  | "checked";

export function recoveryHeaderCheckboxState(
  selectedIds: ReadonlySet<string>,
  listedIds: readonly string[]
): RecoveryHeaderCheckboxState {
  if (listedIds.length === 0) {
    return "unchecked";
  }

  const selectedListed = listedIds.filter((id) => selectedIds.has(id)).length;

  if (selectedListed === 0) {
    return "unchecked";
  }

  return selectedListed === listedIds.length ? "checked" : "indeterminate";
}

/**
 * Header checkbox click: `unchecked` / `indeterminate` → select every listed
 * row; `checked` → clear the selection.
 */
export function toggleRecoveryHeaderCheckbox(
  selectedIds: ReadonlySet<string>,
  listedIds: readonly string[]
): Set<string> {
  return recoveryHeaderCheckboxState(selectedIds, listedIds) === "checked"
    ? new Set<string>()
    : new Set(listedIds);
}

export function toggleRecoveryRowSelection(
  selectedIds: ReadonlySet<string>,
  recoveryId: string
): Set<string> {
  const next = new Set(selectedIds);

  if (next.has(recoveryId)) {
    next.delete(recoveryId);
  } else {
    next.add(recoveryId);
  }

  return next;
}

/** Drop selected ids that are no longer in the list (after discard / restore). */
export function pruneRecoverySelection(
  selectedIds: ReadonlySet<string>,
  listedIds: readonly string[]
): Set<string> {
  const listed = new Set(listedIds);
  return new Set([...selectedIds].filter((id) => listed.has(id)));
}
