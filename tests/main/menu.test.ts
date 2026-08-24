import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { APPLICATION_MENU_CHANNELS } from "../../src/shared/api";
import {
  applicationCommandIds,
  applicationMenuCommandIds,
  commandPaletteCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";

const electronMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({
    template
  })),
  setApplicationMenu: vi.fn(),
  getPath: vi.fn()
}));

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: electronMock.buildFromTemplate,
    setApplicationMenu: electronMock.setApplicationMenu
  },
  app: {
    getPath: electronMock.getPath
  }
}));

import {
  buildApplicationMenu,
  sendApplicationMenuCommand,
  type ApplicationMenuOptions,
  type ApplicationMenuTargetWindow
} from "../../src/main/menu";

describe("application menu", () => {
  it("builds an application menu template", () => {
    const template = buildApplicationMenu("en", emptyMenuOptions(), "win32");

    expect(template.length).toBeGreaterThan(0);
    expect(findTopLevelMenu(template, "File")).toBeTruthy();
  });

  it("keeps Quit in the Windows and Linux File menus", () => {
    for (const platform of ["win32", "linux"] as const) {
      const fileItems = fileMenuItems(platform);

      expect(fileItems.some((item) => item.role === "quit")).toBe(true);
    }
  });

  it("keeps Quit out of the macOS File menu and in the macOS App menu", () => {
    const template = buildApplicationMenu("en", emptyMenuOptions(), "darwin");
    const fileItems = submenuItems(findTopLevelMenu(template, "File"));
    const appItems = submenuItems(findTopLevelMenu(template, "Pergamum"));

    expect(fileItems.some((item) => item.role === "quit")).toBe(false);
    expect(appItems.some((item) => item.role === "quit")).toBe(true);
  });

  it("preserves the macOS File menu Close role", () => {
    const fileItems = fileMenuItems("darwin");

    expect(fileItems.some((item) => item.role === "close")).toBe(true);
  });

  it("sends shared File menu command IDs from command menu items", () => {
    const { window, send } = menuWindowMock();
    const fileItems = fileMenuItems("win32", {
      getMainWindow: () => window
    });

    clickCommandItems(fileItems);

    expect(send.mock.calls.map((call) => call[1])).toEqual([
      applicationCommandIds.createProject,
      applicationCommandIds.openProject,
      editorCommandIds.openMarkdownDocument,
      editorCommandIds.saveDocument,
      editorCommandIds.saveAs,
      applicationCommandIds.toggleRecentProjects,
      editorCommandIds.close
    ]);
  });

  it("keeps the application-menu-sendable allowlist a superset of the File menu", () => {
    for (const commandId of [
      applicationCommandIds.openAbout,
      applicationCommandIds.createProject,
      applicationCommandIds.openProject,
      editorCommandIds.openMarkdownDocument,
      editorCommandIds.saveDocument,
      editorCommandIds.saveAs,
      applicationCommandIds.toggleRecentProjects,
      editorCommandIds.close
    ]) {
      expect(applicationMenuCommandIds).toContain(commandId);
    }
    expect(applicationMenuCommandIds).toContain(commandPaletteCommandIds.open);
  });

  it("routes About menu items through the custom app.about.open command", () => {
    const { window, send } = menuWindowMock();
    const helpItems = helpMenuItems("win32", { getMainWindow: () => window });
    const macAppItems = submenuItems(
      findTopLevelMenu(
        buildApplicationMenu("en", { getMainWindow: () => window }, "darwin"),
        "Pergamum"
      )
    );

    helpItems.find((item) => item.label === "About Pergamum")?.click?.(
      {} as never,
      null as never,
      {} as never
    );
    macAppItems.find((item) => item.label === "About Pergamum")?.click?.(
      {} as never,
      null as never,
      {} as never
    );

    expect(send).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      applicationCommandIds.openAbout
    );
    expect(
      [...helpItems, ...macAppItems].some((item) => item.role === "about")
    ).toBe(false);
  });

  it("rejects command IDs outside the File menu allowlist in main", () => {
    const { window, send } = menuWindowMock();

    expect(
      sendApplicationMenuCommand(() => window, "workspace.files.focus")
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not use focused-window routing", () => {
    const source = readFileSync("src/main/menu.ts", "utf8");

    expect(source).not.toContain("getFocusedWindow");
  });

  it("does nothing when the main window is unavailable", () => {
    expect(sendApplicationMenuCommand(() => null, editorCommandIds.saveDocument))
      .toBe(false);
  });

  it("does nothing when the main window is destroyed", () => {
    const { window, send } = menuWindowMock({ windowDestroyed: true });

    expect(
      sendApplicationMenuCommand(() => window, editorCommandIds.saveDocument)
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when webContents is destroyed", () => {
    const { window, send } = menuWindowMock({ webContentsDestroyed: true });

    expect(
      sendApplicationMenuCommand(() => window, editorCommandIds.saveDocument)
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends menu commands over the application menu IPC channel", () => {
    const { window, send } = menuWindowMock();

    expect(
      sendApplicationMenuCommand(() => window, editorCommandIds.saveDocument)
    ).toBe(true);
    expect(send).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      editorCommandIds.saveDocument
    );
  });

  it("logs successful menu command routing before sending IPC", () => {
    const { window, send } = menuWindowMock();
    const debugLogger = debugLoggerMock();

    expect(
      sendApplicationMenuCommand(
        () => window,
        editorCommandIds.saveDocument,
        debugLogger
      )
    ).toBe(true);

    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "debug",
      event: "application_menu.command.sent",
      details: {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "succeeded",
        trigger: "unknown"
      }
    });
    expect(debugLogger.log.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]
    );
  });

  it("logs ignored menu command routing reasons", () => {
    const debugLogger = debugLoggerMock();
    const { window: destroyedWebContentsWindow } = menuWindowMock({
      webContentsDestroyed: true
    });

    sendApplicationMenuCommand(
      () => null,
      editorCommandIds.saveDocument,
      debugLogger
    );
    sendApplicationMenuCommand(
      () => destroyedWebContentsWindow,
      editorCommandIds.saveDocument,
      debugLogger
    );
    sendApplicationMenuCommand(
      () => destroyedWebContentsWindow,
      "workspace.files.focus",
      debugLogger
    );

    expect(debugLogger.log.mock.calls.map((call) => call[0].details)).toEqual([
      {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "ignored",
        trigger: "unknown",
        reason: "window_unavailable"
      },
      {
        commandId: editorCommandIds.saveDocument,
        operation: "command",
        result: "ignored",
        trigger: "unknown",
        reason: "web_contents_destroyed"
      },
      {
        commandId: "workspace.files.focus",
        operation: "command",
        result: "ignored",
        trigger: "unknown",
        reason: "invalid_command"
      }
    ]);
  });

  it("sets accelerators on the existing File command items", () => {
    const fileItems = fileMenuItems("win32");

    expect(fileItemByLabel(fileItems, "Create Project...").accelerator).toBe(
      undefined
    );
    expect(fileItemByLabel(fileItems, "Open Project").accelerator).toBe(
      "CommandOrControl+Shift+O"
    );
    expect(fileItemByLabel(fileItems, "Open Markdown File").accelerator).toBe(
      "CommandOrControl+O"
    );
    expect(fileItemByLabel(fileItems, "Save").accelerator).toBe(
      "CommandOrControl+S"
    );
    expect(fileItemByLabel(fileItems, "Save As...").accelerator).toBe(
      "CommandOrControl+Shift+S"
    );
  });

  it("does not add an accelerator to Recent Projects", () => {
    const fileItems = fileMenuItems("win32");

    expect(fileItemByLabel(fileItems, "Recent Projects").accelerator).toBe(
      undefined
    );
  });

  it("keeps File command accelerators in macOS and Windows/Linux templates", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const fileItems = fileMenuItems(platform);

      expect(fileItemByLabel(fileItems, "Open Project").accelerator).toBe(
        "CommandOrControl+Shift+O"
      );
      expect(fileItemByLabel(fileItems, "Open Markdown File").accelerator).toBe(
        "CommandOrControl+O"
      );
      expect(fileItemByLabel(fileItems, "Save").accelerator).toBe(
        "CommandOrControl+S"
      );
      expect(fileItemByLabel(fileItems, "Save As...").accelerator).toBe(
        "CommandOrControl+Shift+S"
      );
    }
  });

  it("adds a Command Palette item to the View menu with a CommandOrControl+Shift+P accelerator", () => {
    const viewItems = viewMenuItems("win32");
    const item = viewItems.find(
      (candidate) => candidate.label === "Command Palette..."
    );

    expect(item).toBeTruthy();
    expect(item?.accelerator).toBe("CommandOrControl+Shift+P");
  });

  it("sends the Command Palette open command from the View menu item", () => {
    const { window, send } = menuWindowMock();
    const viewItems = viewMenuItems("win32", { getMainWindow: () => window });

    clickCommandItems(viewItems);

    expect(send).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      commandPaletteCommandIds.open
    );
  });

  it("binds F1 to the Command Palette open command as a hidden item", () => {
    const viewItems = viewMenuItems("win32");
    const f1Item = viewItems.find((candidate) => candidate.accelerator === "F1");

    expect(f1Item).toBeTruthy();
    expect(f1Item?.visible).toBe(false);
    expect(f1Item?.acceleratorWorksWhenHidden).toBe(true);

    const { window, send } = menuWindowMock();

    viewMenuItems("win32", { getMainWindow: () => window }).find(
      (candidate) => candidate.accelerator === "F1"
    )?.click?.({} as never, null as never, {} as never);

    expect(send).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      commandPaletteCommandIds.open
    );
  });

  it("binds Ctrl+W to editor.close as a hidden item on Windows and Linux (#184)", () => {
    for (const platform of ["win32", "linux"] as const) {
      const fileItems = fileMenuItems(platform);
      const closeItem = fileItems.find(
        (candidate) => candidate.accelerator === "CommandOrControl+W"
      );

      expect(closeItem).toBeTruthy();
      expect(closeItem?.visible).toBe(false);
      expect(closeItem?.acceleratorWorksWhenHidden).toBe(true);

      const { window, send } = menuWindowMock();

      fileMenuItems(platform, { getMainWindow: () => window })
        .find((candidate) => candidate.accelerator === "CommandOrControl+W")
        ?.click?.({} as never, null as never, {} as never);

      expect(send).toHaveBeenCalledWith(
        APPLICATION_MENU_CHANNELS.command,
        editorCommandIds.close
      );
    }
  });

  it("does not bind CommandOrControl+W on macOS — it would collide with the native role:close accelerator (#184)", () => {
    const fileItems = fileMenuItems("darwin");

    expect(
      fileItems.some((item) => item.accelerator === "CommandOrControl+W")
    ).toBe(false);
    expect(fileItems.some((item) => item.role === "close")).toBe(true);
  });

  it("does not bind Ctrl+F4 anywhere in the menu", () => {
    const source = readFileSync("src/main/menu.ts", "utf8");

    expect(source).not.toContain("F4");
  });
});

function emptyMenuOptions(): ApplicationMenuOptions {
  return {
    getMainWindow: () => null
  };
}

function debugLoggerMock(): { log: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn()
  };
}

function findTopLevelMenu(
  template: readonly MenuItemConstructorOptions[],
  label: string
): MenuItemConstructorOptions {
  const menu = template.find((item) => item.label === label);

  if (!menu) {
    throw new Error(`Top-level menu was not found: ${label}`);
  }

  return menu;
}

function submenuItems(
  item: MenuItemConstructorOptions
): MenuItemConstructorOptions[] {
  if (!Array.isArray(item.submenu)) {
    throw new Error("Expected a submenu template.");
  }

  return item.submenu;
}

function fileMenuItems(
  platform: NodeJS.Platform,
  options: ApplicationMenuOptions = emptyMenuOptions()
): MenuItemConstructorOptions[] {
  return submenuItems(
    findTopLevelMenu(buildApplicationMenu("en", options, platform), "File")
  );
}

function viewMenuItems(
  platform: NodeJS.Platform,
  options: ApplicationMenuOptions = emptyMenuOptions()
): MenuItemConstructorOptions[] {
  return submenuItems(
    findTopLevelMenu(buildApplicationMenu("en", options, platform), "View")
  );
}

function helpMenuItems(
  platform: NodeJS.Platform,
  options: ApplicationMenuOptions = emptyMenuOptions()
): MenuItemConstructorOptions[] {
  return submenuItems(
    findTopLevelMenu(buildApplicationMenu("en", options, platform), "Help")
  );
}

function fileItemByLabel(
  items: readonly MenuItemConstructorOptions[],
  label: string
): MenuItemConstructorOptions {
  const item = items.find((candidate) => candidate.label === label);

  if (!item) {
    throw new Error(`File menu item was not found: ${label}`);
  }

  return item;
}

function clickCommandItems(items: readonly MenuItemConstructorOptions[]): void {
  for (const item of items) {
    if (item.click) {
      item.click({} as never, null as never, {} as never);
    }
  }
}

function menuWindowMock(options: {
  windowDestroyed?: boolean;
  webContentsDestroyed?: boolean;
} = {}): {
  window: ApplicationMenuTargetWindow;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn();

  return {
    window: {
      isDestroyed: () => options.windowDestroyed ?? false,
      webContents: {
        isDestroyed: () => options.webContentsDestroyed ?? false,
        send
      }
    },
    send
  };
}
