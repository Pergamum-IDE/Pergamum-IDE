import {
  editorIdEquals,
  serializeEditorId,
  type EditorId
} from "../shared/editorId";
import type { DocumentTab } from "./openDocuments";

export type SpecialTabId =
  | "settings"
  | "glossaryTagManager"
  | "glossaryEntryManager"
  | "debugLog";

export interface SpecialWorkspaceTab {
  readonly kind: "special";
  readonly id: SpecialTabId;
  readonly title: string;
}

export type WorkspaceTabId =
  | { readonly kind: "document"; readonly editorId: EditorId }
  | { readonly kind: "special"; readonly id: SpecialTabId };

export type WorkspaceTab =
  | ({ readonly kind: "document" } & DocumentTab)
  | SpecialWorkspaceTab;

export function documentWorkspaceTabId(editorId: EditorId): WorkspaceTabId {
  return { kind: "document", editorId };
}

export function specialWorkspaceTabId(id: SpecialTabId): WorkspaceTabId {
  return { kind: "special", id };
}

export function workspaceTabIdEquals(
  left: WorkspaceTabId,
  right: WorkspaceTabId
): boolean {
  if (left.kind === "document") {
    return right.kind === "document"
      ? editorIdEquals(left.editorId, right.editorId)
      : false;
  }

  return right.kind === "special" ? left.id === right.id : false;
}

export function workspaceTabKey(tabId: WorkspaceTabId): string {
  return tabId.kind === "document"
    ? `document:${serializeEditorId(tabId.editorId)}`
    : `special:${tabId.id}`;
}

export function workspaceTabs(
  documentTabs: readonly DocumentTab[],
  specialTabs: readonly SpecialWorkspaceTab[]
): WorkspaceTab[] {
  return [
    ...documentTabs.map((tab) => ({ ...tab, kind: "document" as const })),
    ...specialTabs
  ];
}

/** The stable `WorkspaceTabId` a rendered `WorkspaceTab` corresponds to. */
export function workspaceTabIdForTab(tab: WorkspaceTab): WorkspaceTabId {
  return tab.kind === "document"
    ? documentWorkspaceTabId(tab.id)
    : specialWorkspaceTabId(tab.id);
}

/**
 * #398: the full visible Document Tab Bar sequence, honoring an explicit
 * `order` that may freely interleave document and special tabs — the
 * generalization of `workspaceTabs()`'s fixed "every document, then every
 * special tab" concatenation.
 *
 * Any id in `order` with no matching open document/special tab is silently
 * dropped (a closed tab never leaves a residue in the sequence). Any
 * currently-open tab NOT yet present in `order` — e.g. the render right
 * after it opened, before a caller's order-sync effect has run — is
 * appended at the end, in `workspaceTabs()`'s own order, so a tab is never
 * missing from the bar merely because `order` has not caught up yet.
 */
export function orderedWorkspaceTabs(
  documentTabs: readonly DocumentTab[],
  specialTabs: readonly SpecialWorkspaceTab[],
  order: readonly WorkspaceTabId[]
): WorkspaceTab[] {
  const allTabs = workspaceTabs(documentTabs, specialTabs);
  const byKey = new Map<string, WorkspaceTab>(
    allTabs.map((tab) => [workspaceTabKey(workspaceTabIdForTab(tab)), tab])
  );
  const consumed = new Set<string>();
  const ordered: WorkspaceTab[] = [];

  for (const id of order) {
    const key = workspaceTabKey(id);
    const tab = byKey.get(key);

    if (tab && !consumed.has(key)) {
      ordered.push(tab);
      consumed.add(key);
    }
  }

  for (const tab of allTabs) {
    const key = workspaceTabKey(workspaceTabIdForTab(tab));

    if (!consumed.has(key)) {
      ordered.push(tab);
      consumed.add(key);
    }
  }

  return ordered;
}

/**
 * #398: keeps a `WorkspaceTabId` order list in sync with which document /
 * special tabs currently exist — drops ids for tabs that closed, appends
 * ids for newly-opened tabs (kept ids keep their existing relative order;
 * only genuinely new tabs move). Returns the SAME `order` reference,
 * unchanged, when nothing needs to change — so a caller re-running this on
 * every render (e.g. from a `useEffect`) does not cause a state update (and
 * therefore no re-render) merely because a document's content or dirty flag
 * changed without any tab opening or closing.
 */
export function syncWorkspaceTabOrder(
  order: readonly WorkspaceTabId[],
  documentTabs: readonly DocumentTab[],
  specialTabs: readonly SpecialWorkspaceTab[]
): readonly WorkspaceTabId[] {
  const currentIds = workspaceTabs(documentTabs, specialTabs).map(
    workspaceTabIdForTab
  );
  const currentKeys = new Set(currentIds.map(workspaceTabKey));
  const kept = order.filter((id) => currentKeys.has(workspaceTabKey(id)));
  const keptKeys = new Set(kept.map(workspaceTabKey));
  const added = currentIds.filter((id) => !keptKeys.has(workspaceTabKey(id)));

  if (kept.length === order.length && added.length === 0) {
    return order;
  }

  return [...kept, ...added];
}

/**
 * #398: horizontal Document Tab Bar reorder, generalized from #354's
 * document-only `reorderOpenDocuments` to the full mixed document/special
 * tab order. Moves `movedTabId` to `targetIndex` in `order` (clamped to
 * `[0, order.length - 1]`). Only the order changes — never document/editor
 * state, active identity, or any special tab's own state. A no-op move (or
 * an id not present in `order`) returns the SAME `order` reference.
 */
export function reorderWorkspaceTabOrder(
  order: readonly WorkspaceTabId[],
  movedTabId: WorkspaceTabId,
  targetIndex: number
): readonly WorkspaceTabId[] {
  const fromIndex = order.findIndex((id) =>
    workspaceTabIdEquals(id, movedTabId)
  );

  if (fromIndex === -1) {
    return order;
  }

  const clampedTarget = Math.max(0, Math.min(targetIndex, order.length - 1));

  if (clampedTarget === fromIndex) {
    return order;
  }

  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTarget, 0, moved);

  return next;
}

/**
 * #398: `movedTabId`'s position relative to OTHER DOCUMENT tabs only within
 * `order` (special tabs never counted) — exactly the index
 * `reorderOpenDocuments` needs to keep `OpenDocumentsState.documents`' own
 * array order in sync with the document tabs' new relative order after a
 * mixed-order workspace tab reorder, so document-order-dependent behavior
 * that predates #398 (Session persistence order, "Close Others/Left/Right")
 * keeps tracking what the user now sees.
 *
 * Returns `null` for a special tab (nothing to sync) or when `movedTabId`
 * is not present in `order`.
 */
export function documentRelativeIndexInOrder(
  order: readonly WorkspaceTabId[],
  movedTabId: WorkspaceTabId
): number | null {
  if (movedTabId.kind !== "document") {
    return null;
  }

  const documentIds = order.filter(
    (id): id is Extract<WorkspaceTabId, { kind: "document" }> =>
      id.kind === "document"
  );
  const index = documentIds.findIndex((id) =>
    editorIdEquals(id.editorId, movedTabId.editorId)
  );

  return index === -1 ? null : index;
}
