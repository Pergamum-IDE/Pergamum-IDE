import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("edit context menu is renderer-drawn (#685)", () => {
  it("Main no longer builds or pops up a native Menu for editing", () => {
    const main = read("src/main/contextMenuIpc.ts");

    expect(main).not.toMatch(/\bMenu\b/);
    expect(main).not.toContain("popup(");
    expect(main).not.toContain("popupEditMenu");
    // Native edit delegation (cut / copy / paste / selectAll) is retained.
    expect(main).toContain("webContents.cut()");
    expect(main).toContain("EDIT_CHANNELS.delegateNativeEdit");
  });

  it("the shared API and preload expose no context menu display channel", () => {
    expect(read("src/shared/api.ts")).not.toContain("CONTEXT_MENU_CHANNELS");
    expect(read("src/preload/preload.ts")).not.toContain("contextMenu");
  });

  it("App opens EditContextMenu from the right-click snapshot and restores focus before executing", () => {
    const app = read("src/renderer/App.tsx");

    expect(app).toContain("openEditMenu: setEditContextMenu");
    expect(app).toContain("<EditContextMenu");
    expect(app).toContain("restoreContextMenuFocus(openMenu.focusTarget)");
    expect(app).not.toContain("pergamum.contextMenu");
  });

  it("EditContextMenu reuses the shared position clamp", () => {
    expect(read("src/renderer/EditContextMenu.tsx")).toContain(
      "clampContextMenuPosition"
    );
  });
});
