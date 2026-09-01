import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #354: App wires the editor tab context menu. App-level behavior in this
 * repo is verified by asserting the wiring in `App.tsx` (the same approach
 * as `externalMarkdownNotificationWiring` / `fileExplorerVisibilityOnTabClose`).
 */
const appSource = readFileSync("src/renderer/App.tsx", "utf8");

describe("editor tab context menu wiring (#354)", () => {
  it("passes onTabAction / describeTabContextMenu / onReorderDocuments to DocumentTabBar and drops the #355 select props", () => {
    const block = appSource.slice(
      appSource.indexOf("<DocumentTabBar"),
      appSource.indexOf("</section>", appSource.indexOf("<DocumentTabBar"))
    );
    expect(block).toContain("onTabAction={handleTabAction}");
    expect(block).toContain(
      "describeTabContextMenu={describeTabContextMenuForTab}"
    );
    expect(block).toContain("onReorderDocuments={handleReorderDocuments}");
    expect(block).not.toContain("onSelectInFileExplorer=");
    expect(block).not.toContain("canSelectInFileExplorer=");
  });

  it("dispatches every action against the right-clicked tab", () => {
    expect(appSource).toContain(
      "function handleTabAction(\n    action: TabContextMenuAction,\n    tab: DocumentTab\n  ): void"
    );
    // Close Tab reuses the existing editor close command with an explicit id.
    expect(appSource).toContain('case "close":');
    expect(appSource).toContain("editorCommandIds.close");
    // batch close
    expect(appSource).toContain('void closeTabsBatch(tab.id, "others")');
    expect(appSource).toContain('void closeTabsBatch(tab.id, "left")');
    expect(appSource).toContain('void closeTabsBatch(tab.id, "right")');
  });

  it("batch close snapshots ids, reads fresh state per iteration, and stops on cancel", () => {
    const fn = appSource.slice(
      appSource.indexOf("async function closeTabsBatch("),
      appSource.indexOf("async function handleTabContextMenuCopy(")
    );
    expect(fn).toContain("editorIdsForBatchTabClose(\n      openDocumentsStateRef.current");
    expect(fn).toContain("for (const targetId of targetIds)");
    expect(fn).toContain("await closeOneTabWithConfirmation(targetId)");
    expect(fn).toContain('if (outcome === "cancelled") {');
    expect(fn).toContain("return;");

    const one = appSource.slice(
      appSource.indexOf("async function closeOneTabWithConfirmation("),
      appSource.indexOf("async function closeTabsBatch(")
    );
    expect(one).toContain("state: openDocumentsStateRef.current");
    expect(one).toContain("runEditorCloseFlow(editorId,");
  });

  it("Rename Tab File reuses the File Explorer rename request with an explicit target and reveals the sidebar", () => {
    const branch = appSource.slice(
      appSource.indexOf('case "renameFile": {'),
      appSource.indexOf('case "saveAs":')
    );
    expect(branch).toContain('tab.id.kind !== "projectDocument"');
    expect(branch).toContain('project?.accessMode.kind === "readOnly"');
    expect(branch).toContain("tab.isDirty");
    expect(branch).toContain("revealFileExplorerSidebar()");
    expect(branch).toContain("setFileExplorerRenameEntryRequest({");
    expect(branch).toContain("target: { relativePath }");
  });

  it("Save Tab As reuses saveFile({ editorId, forceSaveAs: true }) without activating the tab", () => {
    const branch = appSource.slice(
      appSource.indexOf('case "saveAs":'),
      appSource.indexOf('case "copyAbsolutePath":')
    );
    expect(branch).toContain('tab.id.kind === "glossaryEntry"');
    expect(branch).toContain(
      "void saveFile({ editorId: tab.id, forceSaveAs: true })"
    );
    expect(branch).not.toContain("activateDocument");
  });

  it("Copy commands resolve text via the pure helper, notify on success, and open a dialog on failure", () => {
    const fn = appSource.slice(
      appSource.indexOf("async function handleTabContextMenuCopy("),
      appSource.indexOf("function handleTabAction(")
    );
    expect(fn).toContain("resolveTabCopyText(tab, {");
    expect(fn).toContain("projectRootPath: project?.rootPath ?? null");
    expect(fn).toContain(
      "performClipboardCopy(navigatorClipboardAdapter, text)"
    );
    // success -> NotificationToast
    expect(fn).toContain("notificationController.notify({");
    expect(fn).toContain("notification.tabAbsolutePathCopied");
    expect(fn).toContain("notification.tabRelativePathCopied");
    expect(fn).toContain("notification.tabFileNameCopied");
    // failure -> Dialog (never a toast, never status only)
    expect(fn).toContain("confirmDialog({");
    expect(fn).toContain("dialog.clipboardCopyFailed.title");
    expect(fn).toContain("dialog.clipboardCopyFailed.message");
    expect(fn).toContain("cancelLabel: null");
  });

  it("reorder applies the pure reorderOpenDocuments to openDocumentsState", () => {
    expect(appSource).toContain(
      "function handleReorderDocuments(\n    movedEditorId: EditorId,\n    targetIndex: number\n  ): void"
    );
    expect(appSource).toContain(
      "reorderOpenDocuments(state, movedEditorId, targetIndex)"
    );
  });

  it("Select in File Explorer keeps the #355 reveal request wiring, acting on the right-clicked tab", () => {
    const branch = appSource.slice(
      appSource.indexOf('case "selectInFileExplorer": {'),
      appSource.indexOf('case "renameFile": {')
    );
    expect(branch).toContain("revealFileExplorerSidebar()");
    expect(branch).toContain("setFileExplorerRevealRequest({");
    // uses the RIGHT-CLICKED tab id, resolved to the on-disk-cased path
    expect(branch).toContain("openProjectDocumentRelativePath(tab.id)");
    // never the raw (case-normalized) editor id path
    expect(branch).not.toContain("relativePath: tab.id.relativePath");
  });

  // ----- BLOCKER regression guards (dogfood #354) -----------------------

  it("BLOCKER 1: only Select in File Explorer issues a reveal request — never activate / close / save / copy / reorder", () => {
    const fn = appSource.slice(
      appSource.indexOf("function handleTabAction("),
      appSource.indexOf("function describeTabContextMenuForTab(")
    );
    // exactly one reveal-request emission in the whole dispatcher
    expect(fn.match(/setFileExplorerRevealRequest\(/g)).toHaveLength(1);
    // and it is inside the selectInFileExplorer case (before renameFile)
    const revealAt = fn.indexOf("setFileExplorerRevealRequest(");
    expect(revealAt).toBeGreaterThan(fn.indexOf('case "selectInFileExplorer"'));
    expect(revealAt).toBeLessThan(fn.indexOf('case "renameFile"'));

    // close / save as / copy branches must not touch reveal or sidebar
    const closeToCopyEnd = fn.slice(
      fn.indexOf('case "closeOthers":'),
      fn.indexOf('case "selectInFileExplorer"')
    );
    expect(closeToCopyEnd).not.toContain("revealFileExplorerSidebar");
    expect(closeToCopyEnd).not.toContain("setFileExplorerRevealRequest");

    const saveAndCopy = fn.slice(fn.indexOf('case "saveAs":'));
    expect(saveAndCopy).not.toContain("revealFileExplorerSidebar");
    expect(saveAndCopy).not.toContain("setFileExplorerRevealRequest");

    // reorder handler must not touch reveal / sidebar
    const reorder = appSource.slice(
      appSource.indexOf("function handleReorderDocuments("),
      appSource.indexOf("function handleActivityBarModeClick(")
    );
    expect(reorder).not.toContain("revealFileExplorerSidebar");
    expect(reorder).not.toContain("setFileExplorerRevealRequest");
  });

  it("BLOCKER 2: the reveal / rename target is the open editor's on-disk-cased relativePath, not the case-normalized EditorId", () => {
    const helper = appSource.slice(
      appSource.indexOf("function openProjectDocumentRelativePath("),
      appSource.indexOf("function handleTabAction(")
    );
    const helperFlat = helper.replace(/\s+/g, " ");
    expect(helperFlat).toContain(
      "findOpenDocument( openDocumentsStateRef.current, editorId )"
    );
    expect(helperFlat).toContain(
      "currentEditorProjectRelativePath(openDocument.editor)"
    );
    expect(helperFlat).toContain("?? editorId.relativePath");

    const rename = appSource.slice(
      appSource.indexOf('case "renameFile": {'),
      appSource.indexOf('case "saveAs":')
    );
    expect(rename).toContain("openProjectDocumentRelativePath(tab.id)");
    expect(rename).toContain("target: { relativePath }");
    expect(rename).not.toContain("relativePath: tab.id.relativePath");
  });
});
