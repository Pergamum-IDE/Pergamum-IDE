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
  RECOVERY_CHANNELS,
  SESSION_CHANNELS,
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
    readMarkdownFile: (filePath) =>
      ipcRenderer.invoke(FILE_CHANNELS.readMarkdownFile, { path: filePath }),
    statMarkdownFile: (filePath) =>
      ipcRenderer.invoke(FILE_CHANNELS.statMarkdownFile, { path: filePath }),
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
    openProjectByFilePath: (projectFilePath, expectedProjectId) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.openProjectByFilePath, {
        projectFilePath,
        expectedProjectId
      }),
    openRecentProject: (projectFilePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.openRecentProject, {
        projectFilePath
      }),
    confirmCreateProjectInExistingRoot: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.confirmCreateProjectInExistingRoot, {
        token
      }),
    cancelCreateProjectInExistingRoot: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.cancelCreateProjectInExistingRoot, {
        token
      }),
    confirmReadOnlyProjectOpen: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.confirmReadOnlyProjectOpen, {
        token
      }),
    cancelReadOnlyProjectOpen: (token) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.cancelReadOnlyProjectOpen, {
        token
      }),
    listFileExplorerChildren: (directoryRelativePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.listFileExplorerChildren, {
        directoryRelativePath
      }),
    createFileExplorerMarkdownFile: (parentDirectoryRelativePath, name) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.createFileExplorerMarkdownFile, {
        parentDirectoryRelativePath,
        name
      }),
    createFileExplorerFolder: (parentDirectoryRelativePath, name) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.createFileExplorerFolder, {
        parentDirectoryRelativePath,
        name
      }),
    renameFileExplorerEntry: (
      sourceRelativePath,
      newName,
      dirtyProjectDocumentRelativePaths
    ) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.renameFileExplorerEntry, {
        sourceRelativePath,
        newName,
        dirtyProjectDocumentRelativePaths:
          dirtyProjectDocumentRelativePaths ?? []
      }),
    moveFileExplorerEntries: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.moveFileExplorerEntries, request),
    statFileExplorerEntries: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.statFileExplorerEntries, request),
    planFileExplorerCopyEntries: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.planFileExplorerCopyEntries, request),
    executeFileExplorerCopyPlan: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.executeFileExplorerCopyPlan, request),
    collectFileExplorerDeleteTargets: (request) =>
      ipcRenderer.invoke(
        PROJECT_CHANNELS.collectFileExplorerDeleteTargets,
        request
      ),
    deleteFileExplorerEntry: (request) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.deleteFileExplorerEntry, request),
    readProjectDocument: (relativePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.readProjectDocument, {
        relativePath
      }),
    readProjectDocumentPreviewLine: (relativePath) =>
      ipcRenderer.invoke(PROJECT_CHANNELS.readProjectDocumentPreviewLine, {
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
  session: {
    persist: (snapshot) =>
      ipcRenderer.invoke(SESSION_CHANNELS.persistSession, snapshot),
    dropFromRestoreSet: (sessionId) =>
      ipcRenderer.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
        sessionId
      }),
    getColdStartRestore: () =>
      ipcRenderer.invoke(SESSION_CHANNELS.getColdStartRestore),
    onStorageFailure: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        const reason =
          isRecord(payload) && typeof payload.reason === "string"
            ? payload.reason
            : "writeFailed";
        callback(reason);
      };

      ipcRenderer.on(SESSION_CHANNELS.storageFailure, listener);

      return () => {
        ipcRenderer.off(SESSION_CHANNELS.storageFailure, listener);
      };
    }
  },
  recovery: {
    getStoreStatus: () =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.getStoreStatus),
    upsertDocument: (payload) =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.upsertDocument, payload),
    deleteDocument: (documentKey) =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.deleteDocument, { documentKey }),
    listCandidates: () =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.listCandidates),
    evaluateStartupCandidates: () =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.evaluateStartupCandidates),
    markCandidatesSeen: () =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.markCandidatesSeen),
    restoreCandidates: (request) =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.restoreCandidates, request),
    finalizeRestoredCandidates: (request) =>
      ipcRenderer.invoke(
        RECOVERY_CHANNELS.finalizeRestoredCandidates,
        request
      ),
    discardCandidates: (request) =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.discardCandidates, request),
    getReport: (language) =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.getReport, language),
    hasRecoverableCandidates: () =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.hasRecoverableCandidates)
  },
  glossary: {
    create: (input) => ipcRenderer.invoke(GLOSSARY_CHANNELS.create, input),
    getById: (id) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.getById, {
        id
      }),
    list: () => ipcRenderer.invoke(GLOSSARY_CHANNELS.list),
    update: (input) => ipcRenderer.invoke(GLOSSARY_CHANNELS.update, input),
    delete: (id) => ipcRenderer.invoke(GLOSSARY_CHANNELS.delete, { id }),
    reorderEntries: (entryIdsInOrder) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.reorderEntries, { entryIdsInOrder }),
    listTags: () => ipcRenderer.invoke(GLOSSARY_CHANNELS.listTags),
    createTag: (input) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.createTag, input),
    updateTag: (input) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.updateTag, input),
    deleteTag: (id) => ipcRenderer.invoke(GLOSSARY_CHANNELS.deleteTag, { id }),
    reorderTags: (tagIdsInOrder) =>
      ipcRenderer.invoke(GLOSSARY_CHANNELS.reorderTags, { tagIdsInOrder })
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
