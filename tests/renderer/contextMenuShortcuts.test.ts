import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { editorCommandIds } from "../../src/shared/commandIds";
import {
  formatKeybindingLabel,
  type ResolvedKeybinding
} from "../../src/shared/keybindings";
import { resolveDefaultKeybindings } from "../../src/shared/keybindings/resolve";
import {
  createContextMenuShortcutResolver,
  documentTabContextMenuShortcutCommandId,
  editContextMenuShortcutCommandIds,
  fileExplorerContextMenuShortcutCommandIds
} from "../../src/renderer/contextMenuShortcuts";
import { rendererShortcutCommandIds } from "../../src/renderer/keybindings/rendererShortcuts";

const win = resolveDefaultKeybindings("win32");

function withKey(
  rows: readonly ResolvedKeybinding[],
  commandId: string,
  key: string | null
): ResolvedKeybinding[] {
  return rows.map((row) => (row.command === commandId ? { ...row, key } : row));
}

describe("context menu shortcut resolver (#683 / #685)", () => {
  it("formats the effective primary binding with the shared formatter", () => {
    const resolve = createContextMenuShortcutResolver("win32", win);
    const cutRow = win.find(
      (row) => row.command === editorCommandIds.cutSelection && row.key !== null
    )!;

    expect(resolve(editorCommandIds.cutSelection)).toBe(
      formatKeybindingLabel(cutRow.key!, "win32")
    );
    expect(resolve(editorCommandIds.cutSelection)).toBeTruthy();
  });

  it("shows a user override instead of the default", () => {
    const rows = withKey(win, editorCommandIds.cutSelection, "Mod-Shift-9");
    const resolve = createContextMenuShortcutResolver("win32", rows);

    expect(resolve(editorCommandIds.cutSelection)).toBe(
      formatKeybindingLabel("Mod-Shift-9", "win32")
    );
  });

  it("shows nothing for an unbound command", () => {
    const rows = withKey(win, editorCommandIds.copySelection, null);

    expect(
      createContextMenuShortcutResolver("win32", rows)(
        editorCommandIds.copySelection
      )
    ).toBeUndefined();
  });

  it("shows only the primary binding when a command has several", () => {
    const saveAs = win.filter((row) => row.command === "editor.saveAs");
    expect(saveAs.length).toBeGreaterThan(1);

    expect(
      createContextMenuShortcutResolver("win32", win)("editor.saveAs")
    ).toBe(formatKeybindingLabel(saveAs[0].key!, "win32"));
  });

  it("uses the platform formatter", () => {
    const mac = resolveDefaultKeybindings("darwin");
    const key = mac.find(
      (row) => row.command === editorCommandIds.copySelection
    )!.key!;

    expect(
      createContextMenuShortcutResolver("darwin", mac)(
        editorCommandIds.copySelection
      )
    ).toBe(formatKeybindingLabel(key, "darwin"));
    expect(
      createContextMenuShortcutResolver("darwin", mac)(
        editorCommandIds.copySelection
      )
    ).not.toBe(
      createContextMenuShortcutResolver("win32", win)(
        editorCommandIds.copySelection
      )
    );
  });

  it("returns nothing for unmapped / unknown commands", () => {
    const resolve = createContextMenuShortcutResolver("win32", win);

    expect(resolve(null)).toBeUndefined();
    expect(resolve(undefined)).toBeUndefined();
    expect(resolve("no.such.command")).toBeUndefined();
  });
});

describe("context menu shortcut mappings (#683 / #685)", () => {
  it("Edit menu maps each item to its own native edit command", () => {
    expect(editContextMenuShortcutCommandIds).toEqual({
      [editorCommandIds.cutSelection]: editorCommandIds.cutSelection,
      [editorCommandIds.copySelection]: editorCommandIds.copySelection,
      [editorCommandIds.pasteSelection]: editorCommandIds.pasteSelection,
      [editorCommandIds.selectAllSelection]:
        editorCommandIds.selectAllSelection
    });
  });

  it("File Explorer maps only Copy / Cut / Paste / Rename / Delete", () => {
    expect(fileExplorerContextMenuShortcutCommandIds).toEqual({
      copy: rendererShortcutCommandIds.filesCopy,
      cut: rendererShortcutCommandIds.filesCut,
      paste: rendererShortcutCommandIds.filesPaste,
      rename: rendererShortcutCommandIds.filesRename,
      delete: rendererShortcutCommandIds.filesDelete
    });
    for (const unmapped of ["new-file", "new-folder", "export", "move"]) {
      expect(fileExplorerContextMenuShortcutCommandIds).not.toHaveProperty(
        unmapped
      );
    }
  });

  it("Document Tab shows shortcuts only for the ACTIVE clicked tab", () => {
    const inactive = { isActive: false, isProjectDocument: true };
    const active = { isActive: true, isProjectDocument: true };

    for (const action of [
      "close",
      "closeOthers",
      "closeToLeft",
      "closeToRight",
      "selectInFileExplorer",
      "renameFile",
      "saveAs",
      "copyAbsolutePath",
      "copyRelativePath",
      "copyFileName"
    ] as const) {
      expect(
        documentTabContextMenuShortcutCommandId(action, inactive)
      ).toBeNull();
    }

    expect(documentTabContextMenuShortcutCommandId("close", active)).toBe(
      editorCommandIds.close
    );
    expect(documentTabContextMenuShortcutCommandId("saveAs", active)).toBe(
      editorCommandIds.saveAs
    );
    expect(documentTabContextMenuShortcutCommandId("renameFile", active)).toBe(
      rendererShortcutCommandIds.filesRename
    );
    expect(
      documentTabContextMenuShortcutCommandId("renameFile", {
        isActive: true,
        isProjectDocument: false
      })
    ).toBeNull();
    for (const action of [
      "closeOthers",
      "closeToLeft",
      "closeToRight",
      "selectInFileExplorer",
      "copyAbsolutePath",
      "copyRelativePath",
      "copyFileName"
    ] as const) {
      expect(documentTabContextMenuShortcutCommandId(action, active)).toBeNull();
    }
  });

  it("never hardcodes shortcut strings", () => {
    const source = readFileSync("src/renderer/contextMenuShortcuts.ts", "utf8");

    expect(source).not.toMatch(/["'](Ctrl|Cmd|Mod|Alt|Shift)[-+]/);
    expect(source).toContain("formatKeybindingLabel");
    expect(source).toContain("getEffectiveKeybindingRows");
  });
});

describe("Document Tab: Export / Japanese Style Check shortcuts (#684)", () => {
  const active = { isActive: true, isProjectDocument: true };
  const inactive = { isActive: false, isProjectDocument: true };

  it("Export never shows a shortcut: its key exports the project, the item the clicked file", () => {
    expect(documentTabContextMenuShortcutCommandId("export", active)).toBeNull();
    expect(
      documentTabContextMenuShortcutCommandId("export", inactive)
    ).toBeNull();
  });

  it("Japanese Style Check shows its shortcut only on the active tab", () => {
    expect(
      documentTabContextMenuShortcutCommandId("japaneseMachineCheck", active)
    ).toBe("assist.japaneseMachineCheck.openDialog");
    expect(
      documentTabContextMenuShortcutCommandId("japaneseMachineCheck", {
        isActive: true,
        isProjectDocument: false
      })
    ).toBe("assist.japaneseMachineCheck.openDialog");
    expect(
      documentTabContextMenuShortcutCommandId("japaneseMachineCheck", inactive)
    ).toBeNull();
  });

  it("the label comes from the effective binding (user rebind / unbind)", () => {
    const id = "assist.japaneseMachineCheck.openDialog";
    const base = createContextMenuShortcutResolver("win32", win);

    expect(base(id)).toBeUndefined(); // no default key: never invented

    const bound = win.map((row) =>
      row.command === id ? { ...row, key: "Mod-Shift-9" } : row
    );
    const rows = bound.some((row) => row.command === id)
      ? bound
      : [...win, { ...win[0], command: id, key: "Mod-Shift-9" }];

    expect(createContextMenuShortcutResolver("win32", rows)(id)).toBe(
      formatKeybindingLabel("Mod-Shift-9", "win32")
    );
  });
});
