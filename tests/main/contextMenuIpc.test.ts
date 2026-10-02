import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { EDIT_CHANNELS } from "../../src/shared/api";
import { editorCommandIds } from "../../src/shared/commandIds";

const electronMock = vi.hoisted(() => ({
  ipcHandle: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcHandle
  }
}));

import {
  delegateNativeEditCommand,
  registerContextMenuIpc
} from "../../src/main/contextMenuIpc";

type NativeEditWebContentsMock = {
  isDestroyed: ReturnType<typeof vi.fn<WebContents["isDestroyed"]>>;
  cut: ReturnType<typeof vi.fn<WebContents["cut"]>>;
  copy: ReturnType<typeof vi.fn<WebContents["copy"]>>;
  paste: ReturnType<typeof vi.fn<WebContents["paste"]>>;
  selectAll: ReturnType<typeof vi.fn<WebContents["selectAll"]>>;
};

describe("context menu IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers only the native edit delegation channel (#685: the edit menu is renderer-drawn)", () => {
    registerContextMenuIpc();

    expect(electronMock.ipcHandle.mock.calls.map((call) => call[0])).toEqual([
      EDIT_CHANNELS.delegateNativeEdit
    ]);
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
