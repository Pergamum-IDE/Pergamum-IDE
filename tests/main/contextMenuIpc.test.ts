import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions, WebContents } from "electron";
import { CONTEXT_MENU_CHANNELS, EDIT_CHANNELS } from "../../src/shared/api";
import { editorCommandIds } from "../../src/shared/commandIds";
import type { EditContextMenuPopupRequest } from "../../src/shared/editContextMenu";

const electronMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => ({
    template,
    popup: vi.fn()
  })),
  fromWebContents: vi.fn(),
  ipcHandle: vi.fn()
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents
  },
  ipcMain: {
    handle: electronMock.ipcHandle
  },
  Menu: {
    buildFromTemplate: electronMock.buildFromTemplate
  }
}));

import {
  buildEditContextMenuTemplate,
  delegateNativeEditCommand,
  popupEditContextMenu,
  registerContextMenuIpc
} from "../../src/main/contextMenuIpc";

type NativeEditWebContentsMock = {
  isDestroyed: ReturnType<typeof vi.fn<WebContents["isDestroyed"]>>;
  send: ReturnType<typeof vi.fn<WebContents["send"]>>;
  cut: ReturnType<typeof vi.fn<WebContents["cut"]>>;
  copy: ReturnType<typeof vi.fn<WebContents["copy"]>>;
  paste: ReturnType<typeof vi.fn<WebContents["paste"]>>;
  selectAll: ReturnType<typeof vi.fn<WebContents["selectAll"]>>;
};

const request: EditContextMenuPopupRequest = {
  interactionId: "contextMenu.1",
  requestedSurface: "markdownEditor",
  items: [
    { commandId: editorCommandIds.cutSelection, enabled: true },
    { commandId: editorCommandIds.copySelection, enabled: true },
    { commandId: editorCommandIds.pasteSelection, enabled: false },
    { commandId: editorCommandIds.selectAllSelection, enabled: true }
  ]
};

describe("context menu IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds only the four Edit context menu items", () => {
    const onSelect = vi.fn();
    const template = buildEditContextMenuTemplate(request, "en", onSelect);

    expect(template.map((item) => item.label)).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Select All"
    ]);
    expect(template.map((item) => item.enabled)).toEqual([
      true,
      true,
      false,
      true
    ]);
    expect(template.map((item) => item.label)).not.toContain("Save");
    expect(template.map((item) => item.label)).not.toContain("Open Project");
    expect(template.map((item) => item.label)).not.toContain("Recent Projects");
  });

  it("sends command IDs back to renderer and logs opened after popup succeeds", () => {
    const send = vi.fn();
    const debugLogger = { log: vi.fn() };
    const window = { isDestroyed: () => false };
    const webContents = {
      isDestroyed: () => false,
      send
    };

    const opened = popupEditContextMenu({
      request,
      language: "en",
      webContents,
      window: window as never,
      debugLogger
    });
    const template = electronMock.buildFromTemplate.mock.calls[0][0];
    const builtMenu = electronMock.buildFromTemplate.mock.results[0].value;

    template[0].click?.({} as never, window as never, webContents as never);

    expect(opened).toBe(true);
    expect(electronMock.buildFromTemplate).toHaveBeenCalledTimes(1);
    expect(builtMenu.popup).toHaveBeenCalledWith({ window });
    expect(builtMenu.popup.mock.invocationCallOrder[0]).toBeLessThan(
      debugLogger.log.mock.invocationCallOrder[0]
    );
    expect(send).toHaveBeenCalledWith(CONTEXT_MENU_CHANNELS.commandSelected, {
      interactionId: "contextMenu.1",
      commandId: editorCommandIds.cutSelection,
      requestedSurface: "markdownEditor"
    });
    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.opened",
      details: {
        interactionId: "contextMenu.1",
        requestedSurface: "markdownEditor"
      }
    });
    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.command.selected",
      details: {
        interactionId: "contextMenu.1",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor"
      }
    });
  });

  it("logs false popup decisions without calling Menu.popup", () => {
    const debugLogger = { log: vi.fn() };
    const webContents = nativeEditWebContents();

    expect(
      popupEditContextMenu({
        request: {
          ...request,
          requestedSurface: "unknownEditable" as never
        },
        language: "en",
        webContents,
        window: { isDestroyed: () => false } as never,
        debugLogger
      })
    ).toBe(false);
    expect(
      popupEditContextMenu({
        request,
        language: "en",
        webContents,
        window: null,
        debugLogger
      })
    ).toBe(false);
    expect(
      popupEditContextMenu({
        request,
        language: "en",
        webContents,
        window: { isDestroyed: () => true } as never,
        debugLogger
      })
    ).toBe(false);
    expect(
      popupEditContextMenu({
        request,
        language: "en",
        webContents: nativeEditWebContents({
          isDestroyed: vi.fn(() => true)
        }),
        window: { isDestroyed: () => false } as never,
        debugLogger
      })
    ).toBe(false);

    expect(electronMock.buildFromTemplate).not.toHaveBeenCalled();
    expect(debugLogger.log.mock.calls.map((call) => call[0])).toEqual([
      {
        level: "debug",
        event: "contextMenu.suppressed",
        details: {
          interactionId: "contextMenu.1",
          requestedSurface: "unknownEditable",
          result: "ignored",
          reason: "unsupported_surface"
        }
      },
      {
        level: "debug",
        event: "contextMenu.suppressed",
        details: {
          interactionId: "contextMenu.1",
          requestedSurface: "markdownEditor",
          result: "ignored",
          reason: "window_unavailable"
        }
      },
      {
        level: "debug",
        event: "contextMenu.suppressed",
        details: {
          interactionId: "contextMenu.1",
          requestedSurface: "markdownEditor",
          result: "ignored",
          reason: "window_unavailable"
        }
      },
      {
        level: "debug",
        event: "contextMenu.suppressed",
        details: {
          interactionId: "contextMenu.1",
          requestedSurface: "markdownEditor",
          result: "ignored",
          reason: "web_contents_destroyed"
        }
      }
    ]);
  });

  it("logs suppressed instead of opened when Menu.popup throws", () => {
    const debugLogger = { log: vi.fn() };
    const popup = vi.fn(() => {
      throw new Error("popup failed");
    });
    const window = { isDestroyed: () => false };

    electronMock.buildFromTemplate.mockReturnValueOnce({
      template: [],
      popup
    });

    expect(
      popupEditContextMenu({
        request,
        language: "en",
        webContents: nativeEditWebContents(),
        window: window as never,
        debugLogger
      })
    ).toBe(false);

    expect(popup).toHaveBeenCalledWith({ window });
    expect(debugLogger.log.mock.calls.map((call) => call[0])).toEqual([
      {
        level: "debug",
        event: "contextMenu.suppressed",
        details: {
          interactionId: "contextMenu.1",
          requestedSurface: "markdownEditor",
          result: "ignored",
          reason: "window_unavailable"
        }
      }
    ]);
    expect(JSON.stringify(debugLogger.log.mock.calls)).not.toContain(
      "contextMenu.opened"
    );
  });

  it("logs malformed popup payloads without raw invalid values", async () => {
    const debugLogger = { log: vi.fn() };

    registerContextMenuIpc(debugLogger);

    await expect(
      ipcHandler(CONTEXT_MENU_CHANNELS.popupEditMenu)(
        { sender: nativeEditWebContents() },
        {
          interactionId: "contextMenu.bad",
          requestedSurface: "unsupported"
        }
      )
    ).resolves.toBe(false);

    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "debug",
      event: "contextMenu.suppressed",
      details: {
        interactionId: "contextMenu.bad",
        result: "ignored",
        reason: "invalid_command"
      }
    });
    expect(JSON.stringify(debugLogger.log.mock.calls)).not.toContain(
      "unsupported"
    );
  });

  it("delegates native edit operations to webContents without claiming success", () => {
    const debugLogger = { log: vi.fn() };
    const webContents = nativeEditWebContents();

    expect(
      delegateNativeEditCommand({
        request: {
          interactionId: "contextMenu.2",
          commandId: editorCommandIds.pasteSelection,
          requestedSurface: "glossaryDescription",
          delegatedSurface: "glossaryDescription",
          editorIdKind: "glossaryEntry",
          hasSelection: false
        },
        webContents,
        debugLogger
      })
    ).toBe(true);

    expect(webContents.paste).toHaveBeenCalledTimes(1);
    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "debug",
      event: "edit.command.delegated",
      details: {
        interactionId: "contextMenu.2",
        commandId: editorCommandIds.pasteSelection,
        requestedSurface: "glossaryDescription",
        delegatedSurface: "glossaryDescription",
        editorIdKind: "glossaryEntry",
        hasSelection: false
      }
    });
    expect(JSON.stringify(debugLogger.log.mock.calls)).not.toContain(
      "succeeded"
    );
  });

  it("logs native edit delegation failures at error level", () => {
    const debugLogger = { log: vi.fn() };
    const webContents = nativeEditWebContents({
      isDestroyed: vi.fn(() => true)
    });

    expect(
      delegateNativeEditCommand({
        request: {
          interactionId: "contextMenu.3",
          commandId: editorCommandIds.copySelection,
          requestedSurface: "glossaryAtomValue",
          delegatedSurface: "unknownEditable"
        },
        webContents,
        debugLogger
      })
    ).toBe(false);

    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "error",
      event: "edit.command.failed",
      details: {
        interactionId: "contextMenu.3",
        commandId: editorCommandIds.copySelection,
        requestedSurface: "glossaryAtomValue",
        delegatedSurface: "unknownEditable",
        result: "failed",
        reason: "web_contents_destroyed"
      }
    });
  });

  it("logs malformed native edit payloads without raw invalid values", () => {
    const debugLogger = { log: vi.fn() };

    registerContextMenuIpc(debugLogger);

    expect(
      ipcHandler(EDIT_CHANNELS.delegateNativeEdit)(
        { sender: nativeEditWebContents() },
        {
          interactionId: "contextMenu.nativeBad",
          commandId: "editor.selection.invalid",
          requestedSurface: "markdownEditor",
          delegatedSurface: "markdownEditor"
        }
      )
    ).toBe(false);

    expect(debugLogger.log).toHaveBeenCalledWith({
      level: "error",
      event: "edit.command.failed",
      details: {
        interactionId: "contextMenu.nativeBad",
        result: "failed",
        reason: "invalid_command"
      }
    });
    expect(JSON.stringify(debugLogger.log.mock.calls)).not.toContain(
      "editor.selection.invalid"
    );
  });
});

function nativeEditWebContents(
  overrides: Partial<NativeEditWebContentsMock> = {}
): NativeEditWebContentsMock {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    cut: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    ...overrides
  };
}

function ipcHandler(channel: string): (...args: unknown[]) => unknown {
  const handler = electronMock.ipcHandle.mock.calls.find(
    (call) => call[0] === channel
  )?.[1];

  if (typeof handler !== "function") {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler as (...args: unknown[]) => unknown;
}
