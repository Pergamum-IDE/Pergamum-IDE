import { contextBridge, ipcRenderer } from "electron";
import { nodePlatformToAppPlatform } from "./platform";
import {
  APPLICATION_MENU_CHANNELS,
  APP_INFO_CHANNELS,
  CONTEXT_MENU_CHANNELS,
  DEBUG_LOG_CHANNELS,
  EDIT_CHANNELS,
  FILE_CHANNELS,
  GLOSSARY_CHANNELS,
  LIFECYCLE_CHANNELS,
  PROJECT_CHANNELS,
  SETTINGS_CHANNELS,
  type PergamumApi
} from "../shared/api";
import {
  isEditContextMenuCommandId,
  isEditableContextSurface,
  type EditContextMenuCommandSelection
} from "../shared/editContextMenu";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextMenuCommandSelectionFromUnknown(
  value: unknown
): EditContextMenuCommandSelection | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.interactionId !== "string" ||
    !isEditContextMenuCommandId(value.commandId) ||
    !isEditableContextSurface(value.requestedSurface)
  ) {
    return null;
  }

  return {
    interactionId: value.interactionId,
    commandId: value.commandId,
    requestedSurface: value.requestedSurface
  };
}

const pergamumApi: PergamumApi = {
  platform: nodePlatformToAppPlatform(process.platform),
  files: {
    openMarkdown: (documentOpenId) =>
      ipcRenderer.invoke(FILE_CHANNELS.openMarkdown, { documentOpenId }),
    saveMarkdown: (filePath, content) =>
      ipcRenderer.invoke(FILE_CHANNELS.saveMarkdown, {
        path: filePath,
        content
      }),
    selectMarkdownSavePath: (defaultPath) =>
      ipcRenderer.invoke(FILE_CHANNELS.selectMarkdownSavePath, {
        defaultPath
      }),
    writeMarkdown: (filePath, content) =>
      ipcRenderer.invoke(FILE_CHANNELS.writeMarkdown, {
        path: filePath,
        content
      })
  },
  projects: {
    createProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.createProject),
    openProject: () => ipcRenderer.invoke(PROJECT_CHANNELS.openProject),
    openStartupProject: () =>
      ipcRenderer.invoke(PROJECT_CHANNELS.openStartupProject),
    openRecentProject: (projectFilePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.openRecentProject, {
        projectFilePath
      }),
    confirmReadOnlyProjectOpen: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.confirmReadOnlyProjectOpen, {
        token
      }),
    cancelReadOnlyProjectOpen: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.cancelReadOnlyProjectOpen, {
        token
      }),
    readProjectDocument: (relativePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.readProjectDocument, {
        relativePath
      }),
    saveProjectDocument: (relativePath, content) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.saveProjectDocument, {
        relativePath,
        content
      }),
    closeCurrentProject: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.closeCurrentProject, request)
  },
  settings: {
    getSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getSettings),
    saveSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveSettings, settings)
  },
  glossary: {
    create: (input) => ipcRenderer.invoke(GLOSSARY_CHANNELS.create, input),
    getById: (id) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.getById, {
        id
      }),
    list: () => ipcRenderer.invoke(GLOSSARY_CHANNELS.list),
    lookupSurface: (surface) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.lookupSurface, {
        surface
      }),
    update: (input) => ipcRenderer.invoke(GLOSSARY_CHANNELS.update, input),
    delete: (id, confirmMessage) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.delete, {
        id,
        confirmMessage
      })
  },
  debugLog: {
    logEvent: (request) =>
      ipcRenderer.invoke(DEBUG_LOG_CHANNELS.logEvent, request),
    getSnapshot: () => ipcRenderer.invoke(DEBUG_LOG_CHANNELS.getSnapshot),
    onEvent: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        debugLogEvent: unknown
      ) => {
        callback(debugLogEvent as Parameters<typeof callback>[0]);
      };

      ipcRenderer.on(DEBUG_LOG_CHANNELS.event, listener);
      ipcRenderer.send(DEBUG_LOG_CHANNELS.subscribe);

      return () => {
        ipcRenderer.off(DEBUG_LOG_CHANNELS.event, listener);
        ipcRenderer.send(DEBUG_LOG_CHANNELS.unsubscribe);
      };
    }
  },
  applicationMenu: {
    onCommand: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        commandId: unknown
      ) => {
        if (typeof commandId === "string") {
          callback(commandId);
        }
      };

      ipcRenderer.on(APPLICATION_MENU_CHANNELS.command, listener);

      return () => {
        ipcRenderer.off(APPLICATION_MENU_CHANNELS.command, listener);
      };
    },
    setEnablement: (enablement) => {
      ipcRenderer.send(APPLICATION_MENU_CHANNELS.setEnablement, enablement);
    }
  },
  lifecycle: {
    onWindowCloseRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: unknown
      ) => {
        if (
          isRecord(request) &&
          typeof request.requestId === "string" &&
          request.intent === "ordinaryWindowClose" &&
          typeof request.isFinalWindow === "boolean"
        ) {
          callback({
            requestId: request.requestId,
            intent: request.intent,
            isFinalWindow: request.isFinalWindow
          });
        }
      };

      ipcRenderer.on(LIFECYCLE_CHANNELS.windowCloseRequested, listener);

      return () => {
        ipcRenderer.off(LIFECYCLE_CHANNELS.windowCloseRequested, listener);
      };
    },
    respondWindowCloseRequest: (decision) =>
      ipcRenderer.invoke(
        LIFECYCLE_CHANNELS.respondWindowCloseRequest,
        decision
      ),
    quitApplication: (request) =>
      ipcRenderer.invoke(LIFECYCLE_CHANNELS.quitApplication, request)
  },
  contextMenu: {
    popupEditMenu: (request) =>
      ipcRenderer.invoke(CONTEXT_MENU_CHANNELS.popupEditMenu, request),
    onCommandSelected: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        selection: unknown
      ) => {
        const validatedSelection =
          contextMenuCommandSelectionFromUnknown(selection);

        if (validatedSelection) {
          callback(validatedSelection);
        }
      };

      ipcRenderer.on(CONTEXT_MENU_CHANNELS.commandSelected, listener);

      return () => {
        ipcRenderer.off(CONTEXT_MENU_CHANNELS.commandSelected, listener);
      };
    }
  },
  edit: {
    delegateNativeEdit: (request) =>
      ipcRenderer.invoke(EDIT_CHANNELS.delegateNativeEdit, request)
  },
  appInfo: {
    getAppInfo: () => ipcRenderer.invoke(APP_INFO_CHANNELS.getAppInfo),
    openRepository: () => ipcRenderer.invoke(APP_INFO_CHANNELS.openRepository),
    openTypewriterSoundsCredit: () =>
      ipcRenderer.invoke(APP_INFO_CHANNELS.openTypewriterSoundsCredit)
  }
};

contextBridge.exposeInMainWorld("pergamum", pergamumApi);
