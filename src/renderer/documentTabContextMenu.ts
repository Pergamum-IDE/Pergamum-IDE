/**
 * #354: the editor tab context menu — the pure, DOM-free half.
 *
 * `describeTabContextMenu` decides which items appear, whether each is
 * enabled, its disabled-reason key, and where the separators go — all from
 * the right-clicked tab, the full document-tab list, and the project access
 * mode. `DocumentTabBar` renders the descriptor; `App` dispatches the
 * actions. `resolveTabCopyText` and `resolveTabReorderTargetIndex` are the
 * other two pure pieces (copy-command text, D&D drop index).
 */

import type { ProjectAccessMode } from "../shared/api";
import { isJapaneseMachineCheckPath } from "../shared/japaneseMachineCheck";
import { editorIdEquals } from "../shared/editorId";
import type { TranslationKey } from "../shared/i18n";
import {
  projectDocumentAbsolutePath,
  tabFileNameFromPath
} from "../shared/tabPathDisplay";
import { isExportableDocumentForExport } from "./exportCandidates";
import type { DocumentTab } from "./openDocuments";

export type TabContextMenuAction =
  | "close"
  | "closeOthers"
  | "closeToLeft"
  | "closeToRight"
  | "selectInFileExplorer"
  | "renameFile"
  | "saveAs"
  | "export"
  | "japaneseMachineCheck"
  | "copyAbsolutePath"
  | "copyRelativePath"
  | "copyFileName";

export interface TabContextMenuItem {
  readonly id: TabContextMenuAction;
  readonly labelKey: TranslationKey;
  readonly enabled: boolean;
  /** Present only when `enabled` is `false`. */
  readonly disabledReasonKey?: TranslationKey;
  /** A visual separator is drawn before this item. */
  readonly separatorBefore?: boolean;
}

export interface TabContextMenuDescriptor {
  readonly items: readonly TabContextMenuItem[];
}

export interface DescribeTabContextMenuContext {
  /** Every document tab, in tab-bar order. */
  readonly allTabs: readonly DocumentTab[];
  readonly projectAccess: ProjectAccessMode | null;
  /** The "enablePlainTextDocuments" setting: whether a project .txt exports. */
  readonly enablePlainTextDocuments: boolean;
}

type TabKind = DocumentTab["id"]["kind"];

function enabledItem(
  id: TabContextMenuAction,
  labelKey: TranslationKey,
  separatorBefore?: boolean
): TabContextMenuItem {
  return separatorBefore
    ? { id, labelKey, enabled: true, separatorBefore }
    : { id, labelKey, enabled: true };
}

function disabledItem(
  id: TabContextMenuAction,
  labelKey: TranslationKey,
  disabledReasonKey: TranslationKey,
  separatorBefore?: boolean
): TabContextMenuItem {
  return separatorBefore
    ? { id, labelKey, enabled: false, disabledReasonKey, separatorBefore }
    : { id, labelKey, enabled: false, disabledReasonKey };
}

export function describeTabContextMenu(
  tab: DocumentTab,
  ctx: DescribeTabContextMenuContext
): TabContextMenuDescriptor {
  const kind: TabKind = tab.id.kind;
  const isProjectDocument = kind === "projectDocument";
  const isExternalFile = kind === "file";
  // #573: a glossary Description tab has no backing file at all.
  const isGlossaryDescription = kind === "glossaryDescription";
  // A built-in read-only document (Markdown Cheat Sheet): no file at all.
  const isBuiltinDocument = kind === "builtinMarkdown";
  const isReadOnlyProject = ctx.projectAccess?.kind === "readOnly";

  const index = ctx.allTabs.findIndex((candidate) =>
    editorIdEquals(candidate.id, tab.id)
  );
  const hasOtherTabs = ctx.allTabs.length > 1;
  const hasTabsToLeft = index > 0;
  const hasTabsToRight = index >= 0 && index < ctx.allTabs.length - 1;

  const items: TabContextMenuItem[] = [];

  // --- close group -------------------------------------------------------
  items.push(enabledItem("close", "tabs.contextMenu.close"));
  items.push(
    hasOtherTabs
      ? enabledItem("closeOthers", "tabs.contextMenu.closeOthers")
      : disabledItem(
          "closeOthers",
          "tabs.contextMenu.closeOthers",
          "tabs.contextMenu.disabled.noOtherTabs"
        )
  );
  items.push(
    hasTabsToLeft
      ? enabledItem("closeToLeft", "tabs.contextMenu.closeToLeft")
      : disabledItem(
          "closeToLeft",
          "tabs.contextMenu.closeToLeft",
          "tabs.contextMenu.disabled.noTabsToLeft"
        )
  );
  items.push(
    hasTabsToRight
      ? enabledItem("closeToRight", "tabs.contextMenu.closeToRight")
      : disabledItem(
          "closeToRight",
          "tabs.contextMenu.closeToRight",
          "tabs.contextMenu.disabled.noTabsToRight"
        )
  );

  // --- Select in File Explorer -----------------------------------------
  items.push(
    isProjectDocument
      ? enabledItem(
          "selectInFileExplorer",
          "tabs.contextMenu.selectInFileExplorer",
          true
        )
      : disabledItem(
          "selectInFileExplorer",
          "tabs.contextMenu.selectInFileExplorer",
          "tabs.contextMenu.disabled.notProjectDocument",
          true
        )
  );

  // --- rename / save as ----------------------------------------------------
  items.push(renameItem(isProjectDocument, isReadOnlyProject, tab.isDirty));
  items.push(
    isGlossaryDescription || isBuiltinDocument
      ? disabledItem(
          "saveAs",
          "tabs.contextMenu.saveAs",
          "tabs.contextMenu.disabled.unsupportedForTab"
        )
      : enabledItem("saveAs", "tabs.contextMenu.saveAs")
  );

  // --- export / Japanese style check (#684) -----------------------------
  // Both act on THIS tab's document (the command is given it explicitly), not
  // on the active editor. Whether each is possible is decided by the same
  // rules as the File Explorer export / the Japanese style check command.
  const projectRelativePath =
    tab.id.kind === "projectDocument" ? tab.id.relativePath : null;

  // #695: a glossary Description exports itself (its current draft), saved
  // or not, so only its being that kind matters here.
  items.push(
    isGlossaryDescription
      ? enabledItem("export", "command.assist.export.openDialog", true)
      : projectRelativePath === null
      ? disabledItem(
          "export",
          "command.assist.export.openDialog",
          kind === "untitled"
            ? "tabs.contextMenu.disabled.unsupportedForTab"
            : "tabs.contextMenu.disabled.notProjectDocument",
          true
        )
      : isExportableDocumentForExport(projectRelativePath, {
            enablePlainTextDocuments: ctx.enablePlainTextDocuments
          })
        ? enabledItem("export", "command.assist.export.openDialog", true)
        : disabledItem(
            "export",
            "command.assist.export.openDialog",
            "tabs.contextMenu.disabled.unsupportedForTab",
            true
          )
  );
  items.push(
    isGlossaryDescription ||
      (projectRelativePath !== null &&
        isJapaneseMachineCheckPath(projectRelativePath))
      ? enabledItem(
          "japaneseMachineCheck",
          "command.assist.japaneseMachineCheck.openDialog"
        )
      : disabledItem(
          "japaneseMachineCheck",
          "command.assist.japaneseMachineCheck.openDialog",
          projectRelativePath === null
            ? "tabs.contextMenu.disabled.notProjectDocument"
            : "tabs.contextMenu.disabled.unsupportedForTab"
        )
  );

  // --- copy group --------------------------------------------------------
  items.push(
    isProjectDocument || isExternalFile
      ? enabledItem(
          "copyAbsolutePath",
          "tabs.contextMenu.copyAbsolutePath",
          true
        )
      : disabledItem(
          "copyAbsolutePath",
          "tabs.contextMenu.copyAbsolutePath",
          "tabs.contextMenu.disabled.unsupportedForTab",
          true
        )
  );
  items.push(
    isProjectDocument
      ? enabledItem("copyRelativePath", "tabs.contextMenu.copyRelativePath")
      : disabledItem(
          "copyRelativePath",
          "tabs.contextMenu.copyRelativePath",
          "tabs.contextMenu.disabled.unsupportedForTab"
        )
  );
  items.push(
    isGlossaryDescription || isBuiltinDocument
      ? disabledItem(
          "copyFileName",
          "tabs.contextMenu.copyFileName",
          "tabs.contextMenu.disabled.unsupportedForTab"
        )
      : enabledItem("copyFileName", "tabs.contextMenu.copyFileName")
  );

  return { items };
}

function renameItem(
  isProjectDocument: boolean,
  isReadOnlyProject: boolean,
  isDirty: boolean
): TabContextMenuItem {
  if (!isProjectDocument) {
    return disabledItem(
      "renameFile",
      "tabs.contextMenu.renameFile",
      "tabs.contextMenu.disabled.notProjectDocument",
      true
    );
  }
  if (isReadOnlyProject) {
    return disabledItem(
      "renameFile",
      "tabs.contextMenu.renameFile",
      "tabs.contextMenu.disabled.readOnlyProject",
      true
    );
  }
  if (isDirty) {
    return disabledItem(
      "renameFile",
      "tabs.contextMenu.renameFile",
      "tabs.contextMenu.disabled.dirtyDocument",
      true
    );
  }
  return enabledItem("renameFile", "tabs.contextMenu.renameFile", true);
}

export interface ResolveTabCopyTextContext {
  readonly projectRootPath: string | null;
}

export interface TabCopyText {
  /** `null` = not available for this tab kind. */
  readonly absolute: string | null;
  readonly relative: string | null;
  readonly fileName: string | null;
}

export function resolveTabCopyText(
  tab: DocumentTab,
  ctx: ResolveTabCopyTextContext
): TabCopyText {
  switch (tab.id.kind) {
    case "projectDocument":
      return {
        absolute: ctx.projectRootPath
          ? projectDocumentAbsolutePath(
              ctx.projectRootPath,
              tab.id.relativePath
            )
          : null,
        relative: tab.id.relativePath,
        fileName: tab.title || tabFileNameFromPath(tab.id.relativePath)
      };
    case "file":
      return {
        absolute: tab.id.path,
        relative: null,
        fileName: tab.title || tabFileNameFromPath(tab.id.path)
      };
    case "untitled":
      return { absolute: null, relative: null, fileName: tab.title || null };
    case "glossaryDescription":
    case "builtinMarkdown":
      return { absolute: null, relative: null, fileName: null };
  }
}

/**
 * #354 (generalized to every workspace tab by #398): the post-drop index for
 * a horizontal tab reorder. `tabRects` is one `{ left, right }` per rendered
 * workspace tab in current order (document or special, the moved tab
 * included) — this geometry is identical regardless of tab kind. Returns
 * the index the moved tab should occupy in the array AFTER it is spliced
 * out and re-inserted, clamped to `[0, tabRects.length - 1]`.
 */
export function resolveTabReorderTargetIndex(
  pointerClientX: number,
  tabRects: readonly { readonly left: number; readonly right: number }[],
  movedIndex: number
): number {
  if (tabRects.length === 0) {
    return 0;
  }

  const midpointsBeforePointer = tabRects.reduce(
    (count, rect) =>
      (rect.left + rect.right) / 2 < pointerClientX ? count + 1 : count,
    0
  );

  const target =
    movedIndex < midpointsBeforePointer
      ? midpointsBeforePointer - 1
      : midpointsBeforePointer;

  return Math.max(0, Math.min(target, tabRects.length - 1));
}
