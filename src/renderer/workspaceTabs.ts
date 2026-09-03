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
