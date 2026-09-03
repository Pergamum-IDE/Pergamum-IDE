import { describe, expect, it } from "vitest";
import { editCommandIds, editorCommandIds } from "../../src/shared/commandIds";
import {
  editContextMenuItems,
  editableContextSurfaces,
  isEditableContextSurface,
  pergamumContextSurfaceAttribute
} from "../../src/shared/editContextMenu";

describe("edit context menu shared definitions", () => {
  it("defines only the four Edit selection command IDs", () => {
    expect([...editCommandIds]).toEqual([
      "editor.selection.cut",
      "editor.selection.copy",
      "editor.selection.paste",
      "editor.selection.selectAll"
    ]);
  });

  it("builds the context menu from command IDs and labels only", () => {
    expect(editContextMenuItems).toEqual([
      { commandId: editorCommandIds.cutSelection, labelKey: "menu.cut" },
      { commandId: editorCommandIds.copySelection, labelKey: "menu.copy" },
      { commandId: editorCommandIds.pasteSelection, labelKey: "menu.paste" },
      {
        commandId: editorCommandIds.selectAllSelection,
        labelKey: "menu.selectAll"
      }
    ]);
    expect(
      editContextMenuItems.some((item) =>
        Object.values(item).some((value) => typeof value === "function")
      )
    ).toBe(false);
  });

  it("does not include File or project commands in the context menu", () => {
    const labels = editContextMenuItems.map((item) => item.labelKey);
    const commandIds = editContextMenuItems.map((item) => item.commandId);

    expect(labels).toEqual(["menu.cut", "menu.copy", "menu.paste", "menu.selectAll"]);
    expect(labels).not.toContain("menu.save");
    expect(labels).not.toContain("menu.openMarkdownFile");
    expect(labels).not.toContain("menu.openProject");
    expect(labels).not.toContain("menu.recentProjects");
    expect(commandIds).not.toContain(editorCommandIds.saveDocument);
    expect(commandIds).not.toContain(editorCommandIds.openMarkdownDocument);
  });

  it("uses the project-owned context surface attribute", () => {
    expect(pergamumContextSurfaceAttribute).toBe(
      "data-pergamum-context-surface"
    );
  });

  it("allows only the three supported editable surfaces to open the popup", () => {
    expect([...editableContextSurfaces]).toEqual([
      "markdownEditor",
      "glossaryDescription",
      "glossaryAtomValue"
    ]);
    expect(isEditableContextSurface("unknownEditable")).toBe(false);
    expect(isEditableContextSurface("unsupported")).toBe(false);
  });
});
