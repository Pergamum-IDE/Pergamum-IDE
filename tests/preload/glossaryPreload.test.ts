import { describe, expect, it, vi } from "vitest";
import {
  APPLICATION_MENU_CHANNELS,
  APP_INFO_CHANNELS,
  CONTEXT_MENU_CHANNELS,
  DEBUG_LOG_CHANNELS,
  EDIT_CHANNELS,
  FILE_CHANNELS,
  GLOSSARY_CHANNELS,
  PROJECT_CHANNELS,
  type PergamumApi
} from "../../src/shared/api";
import { editorCommandIds } from "../../src/shared/commandIds";

const electronMock = vi.hoisted(() => ({
  exposedApi: undefined as PergamumApi | undefined,
  exposeInMainWorld: vi.fn((key: string, api: PergamumApi) => {
    electronMock.exposedApi = api;
  }),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMock.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electronMock.invoke,
    on: electronMock.on,
    off: electronMock.off,
    send: electronMock.send
  }
}));

await import("../../src/preload/preload");

const entryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";

describe("glossary preload API", () => {
  it("exposes project file foundation operations through the Pergamum API", async () => {
    electronMock.invoke.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    await api.projects.createProject();
    await api.projects.openProject();
    await api.projects.openStartupProject();
    await api.projects.openRecentProject("C:\\Novel\\Novel.pergamum");
    await api.projects.confirmReadOnlyProjectOpen("pending-token");
    await api.projects.cancelReadOnlyProjectOpen("pending-token");
    await api.projects.listFileExplorerChildren("Drafts");

    expect(api.projects as Record<string, unknown>).not.toHaveProperty(
      "openProjectFile"
    );
    expect(electronMock.invoke.mock.calls).toEqual([
      [PROJECT_CHANNELS.createProject],
      [PROJECT_CHANNELS.openProject],
      [PROJECT_CHANNELS.openStartupProject],
      [
        PROJECT_CHANNELS.openRecentProject,
        {
          projectFilePath: "C:\\Novel\\Novel.pergamum"
        }
      ],
      [
        PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
        {
          token: "pending-token"
        }
      ],
      [
        PROJECT_CHANNELS.cancelReadOnlyProjectOpen,
        {
          token: "pending-token"
        }
      ],
      [
        PROJECT_CHANNELS.listFileExplorerChildren,
        {
          directoryRelativePath: "Drafts"
        }
      ]
    ]);
    expect(JSON.stringify(PROJECT_CHANNELS)).not.toContain("openProjectFile");
    expect(JSON.stringify(PROJECT_CHANNELS)).not.toContain(
      "projects:openProjectFile"
    );
  });

  it("exposes glossary operations through the Pergamum API", () => {
    expect(electronMock.exposeInMainWorld).toHaveBeenCalledWith(
      "pergamum",
      expect.objectContaining({
        glossary: expect.objectContaining({
          create: expect.any(Function),
          getById: expect.any(Function),
          list: expect.any(Function),
          lookupSurface: expect.any(Function),
          update: expect.any(Function),
          delete: expect.any(Function)
        })
      })
    );
  });

  it("invokes glossary IPC channels with request payloads", async () => {
    electronMock.invoke.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    await api.glossary.create({
      kind: "item",
      canonicalSurface: "魔導炉",
      description: "魔力を生成する設備"
    });
    await api.glossary.getById(entryId);
    await api.glossary.list();
    await api.glossary.lookupSurface("魔導炉");
    await api.glossary.update({
      id: entryId,
      kind: "concept",
      description: "魔力を大量生成する技術",
      canonicalSurface: "魔導炉",
      forms: [
        {
          surface: "魔力炉",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "auto",
          matchBoundaryEnd: "auto"
        }
      ]
    });
    await api.glossary.delete(entryId, "この語彙を削除します。よろしいですか？");

    expect(electronMock.invoke.mock.calls).toEqual([
      [
        GLOSSARY_CHANNELS.create,
        {
          kind: "item",
          canonicalSurface: "魔導炉",
          description: "魔力を生成する設備"
        }
      ],
      [
        GLOSSARY_CHANNELS.getById,
        {
          id: entryId
        }
      ],
      [GLOSSARY_CHANNELS.list],
      [
        GLOSSARY_CHANNELS.lookupSurface,
        {
          surface: "魔導炉"
        }
      ],
      [
        GLOSSARY_CHANNELS.update,
        {
          id: entryId,
          kind: "concept",
          description: "魔力を大量生成する技術",
          canonicalSurface: "魔導炉",
          forms: [
            {
              surface: "魔力炉",
              relation: "alias",
              warningPolicy: "default",
              matchBoundaryStart: "auto",
              matchBoundaryEnd: "auto"
            }
          ]
        }
      ],
      [
        GLOSSARY_CHANNELS.delete,
        {
          id: entryId,
          confirmMessage: "この語彙を削除します。よろしいですか？"
        }
      ]
    ]);
  });

  it("does not send project root information in standalone save requests", async () => {
    electronMock.invoke.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    await api.files.saveMarkdown(null, "content");

    expect(electronMock.invoke).toHaveBeenCalledWith(
      FILE_CHANNELS.saveMarkdown,
      {
        path: null,
        content: "content"
      }
    );
  });

  it("exposes debug log snapshot and subscription APIs", async () => {
    electronMock.invoke.mockClear();
    electronMock.on.mockClear();
    electronMock.off.mockClear();
    electronMock.send.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    const receivedEvents: unknown[] = [];
    const unsubscribe = api.debugLog.onEvent((event) => {
      receivedEvents.push(event);
    });
    const listener = electronMock.on.mock.calls[0][1] as (
      event: unknown,
      debugLogEvent: unknown
    ) => void;
    const sanitizedEvent = {
      seq: 1,
      timestamp: "2026-08-14T22:00:21.959+09:00",
      level: "info",
      event: "app.start"
    };

    await api.debugLog.getSnapshot();
    listener({}, sanitizedEvent);
    unsubscribe();

    expect(electronMock.invoke).toHaveBeenCalledWith(
      DEBUG_LOG_CHANNELS.getSnapshot
    );
    expect(electronMock.on).toHaveBeenCalledWith(
      DEBUG_LOG_CHANNELS.event,
      expect.any(Function)
    );
    expect(electronMock.send).toHaveBeenNthCalledWith(
      1,
      DEBUG_LOG_CHANNELS.subscribe
    );
    expect(receivedEvents).toEqual([sanitizedEvent]);
    expect(electronMock.off).toHaveBeenCalledWith(
      DEBUG_LOG_CHANNELS.event,
      listener
    );
    expect(electronMock.send).toHaveBeenNthCalledWith(
      2,
      DEBUG_LOG_CHANNELS.unsubscribe
    );
  });

  it("exposes application menu command subscription with unsubscribe", () => {
    electronMock.on.mockClear();
    electronMock.off.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    const receivedCommandIds: string[] = [];
    const unsubscribe = api.applicationMenu.onCommand((commandId) => {
      receivedCommandIds.push(commandId);
    });
    const listener = electronMock.on.mock.calls[0][1] as (
      event: unknown,
      commandId: unknown
    ) => void;

    listener({}, editorCommandIds.saveDocument);
    listener({}, { invalid: true });
    unsubscribe();

    expect(electronMock.on).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      expect.any(Function)
    );
    expect(receivedCommandIds).toEqual([editorCommandIds.saveDocument]);
    expect(electronMock.off).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      listener
    );
  });

  it("exposes app info and fixed external-link actions without arbitrary URLs", async () => {
    electronMock.invoke.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    await api.appInfo.getAppInfo();
    await api.appInfo.openRepository();
    await api.appInfo.openTypewriterSoundsCredit();

    expect(electronMock.invoke.mock.calls).toEqual([
      [APP_INFO_CHANNELS.getAppInfo],
      [APP_INFO_CHANNELS.openRepository],
      [APP_INFO_CHANNELS.openTypewriterSoundsCredit]
    ]);
    expect(api.appInfo as Record<string, unknown>).not.toHaveProperty(
      "openExternal"
    );
    expect(api.appInfo as Record<string, unknown>).not.toHaveProperty(
      "openThirdPartyNotices"
    );
  });

  it("exposes context menu popup, command selection, and native edit delegation APIs", async () => {
    electronMock.invoke.mockClear();
    electronMock.on.mockClear();
    electronMock.off.mockClear();
    const api = electronMock.exposedApi;

    if (!api) {
      throw new Error("Pergamum API was not exposed.");
    }

    const popupRequest = {
      interactionId: "contextMenu.1",
      requestedSurface: "markdownEditor" as const,
      items: [
        {
          commandId: editorCommandIds.cutSelection,
          enabled: true
        }
      ]
    };
    const nativeEditRequest = {
      interactionId: "contextMenu.1",
      commandId: editorCommandIds.cutSelection,
      requestedSurface: "markdownEditor" as const,
      delegatedSurface: "markdownEditor" as const
    };
    const receivedSelections: unknown[] = [];
    const unsubscribe = api.contextMenu.onCommandSelected((selection) => {
      receivedSelections.push(selection);
    });
    const listener = electronMock.on.mock.calls[0][1] as (
      event: unknown,
      selection: unknown
    ) => void;

    await api.contextMenu.popupEditMenu(popupRequest);
    await api.edit.delegateNativeEdit(nativeEditRequest);
    listener(
      {},
      {
        interactionId: "contextMenu.1",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor"
      }
    );
    listener(
      {},
      {
        interactionId: "contextMenu.2",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "unknownEditable"
      }
    );
    unsubscribe();

    expect(electronMock.invoke).toHaveBeenCalledWith(
      CONTEXT_MENU_CHANNELS.popupEditMenu,
      popupRequest
    );
    expect(electronMock.invoke).toHaveBeenCalledWith(
      EDIT_CHANNELS.delegateNativeEdit,
      nativeEditRequest
    );
    expect(electronMock.on).toHaveBeenCalledWith(
      CONTEXT_MENU_CHANNELS.commandSelected,
      expect.any(Function)
    );
    expect(receivedSelections).toEqual([
      {
        interactionId: "contextMenu.1",
        commandId: editorCommandIds.cutSelection,
        requestedSurface: "markdownEditor"
      }
    ]);
    expect(electronMock.off).toHaveBeenCalledWith(
      CONTEXT_MENU_CHANNELS.commandSelected,
      listener
    );
  });
});
