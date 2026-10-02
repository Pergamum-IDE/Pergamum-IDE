import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({ ipcMain: { handle: electronMock.handle } }));

import {
  invokeRendererMenuNativeRole,
  registerApplicationMenuNativeRoleIpc,
  type NativeRoleWebContents
} from "../../src/main/applicationMenuNativeRole";
import {
  APPLICATION_MENU_CHANNELS,
  isRendererMenuNativeRole,
  rendererMenuNativeRoles
} from "../../src/shared/api";

function fakeWebContents(destroyed = false) {
  const contents = {
    isDestroyed: () => destroyed,
    undo: vi.fn(),
    redo: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    toggleDevTools: vi.fn()
  };
  return contents satisfies NativeRoleWebContents;
}

describe("Renderer menu native role bridge (#664)", () => {
  it("is a small allowlist: edit roles and DevTools only", () => {
    expect([...rendererMenuNativeRoles]).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll",
      "toggleDevTools"
    ]);
  });

  it.each(rendererMenuNativeRoles)(
    "%s runs the matching web contents operation exactly once",
    (role) => {
      const contents = fakeWebContents();

      expect(invokeRendererMenuNativeRole(contents, role)).toBe(true);

      for (const name of rendererMenuNativeRoles) {
        expect(contents[name]).toHaveBeenCalledTimes(name === role ? 1 : 0);
      }
    }
  );

  it.each([
    "hide",
    "hideOthers",
    "services",
    "close",
    "minimize",
    "zoom",
    "front",
    "quit",
    "togglefullscreen",
    "reload",
    "forceReload",
    "toString",
    "",
    42,
    null,
    undefined,
    { role: "copy" }
  ])("rejects %j without touching the web contents", (role) => {
    const contents = fakeWebContents();

    expect(isRendererMenuNativeRole(role)).toBe(false);
    expect(invokeRendererMenuNativeRole(contents, role)).toBe(false);
    for (const name of rendererMenuNativeRoles) {
      expect(contents[name]).not.toHaveBeenCalled();
    }
  });

  it("does nothing for a destroyed web contents", () => {
    const contents = fakeWebContents(true);

    expect(invokeRendererMenuNativeRole(contents, "copy")).toBe(false);
    expect(contents.copy).not.toHaveBeenCalled();
  });

  it("registers one invoke handler that acts on the sender's web contents", () => {
    registerApplicationMenuNativeRoleIpc();

    const call = electronMock.handle.mock.calls.find(
      ([channel]) => channel === APPLICATION_MENU_CHANNELS.invokeNativeRole
    );
    expect(call).toBeTruthy();

    const contents = fakeWebContents();
    const handler = call![1] as (
      event: { sender: NativeRoleWebContents },
      role: unknown
    ) => boolean;

    expect(handler({ sender: contents }, "paste")).toBe(true);
    expect(contents.paste).toHaveBeenCalledTimes(1);
    expect(handler({ sender: contents }, "hide")).toBe(false);
  });

  it("is wired in the main process and exposed through the preload bridge", () => {
    const main = readFileSync("src/main/main.ts", "utf8");
    const preload = readFileSync("src/preload/preload.ts", "utf8");

    expect(main).toContain("registerApplicationMenuNativeRoleIpc();");
    expect(preload).toContain(
      "ipcRenderer.invoke(APPLICATION_MENU_CHANNELS.invokeNativeRole, role)"
    );
  });

  it("keeps the native Application Menu backend (no menu removal)", () => {
    const menu = readFileSync("src/main/menu.ts", "utf8");
    const main = readFileSync("src/main/main.ts", "utf8");

    for (const source of [menu, main]) {
      expect(source).not.toMatch(/setApplicationMenu\(\s*null\s*\)/);
      expect(source).not.toMatch(/removeMenu\(/);
    }
  });
});
