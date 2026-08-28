import { app, BrowserWindow, ipcMain, powerMonitor } from "electron";
import started from "electron-squirrel-startup";
import path from "node:path";
import { parseDebugModeFromArgv } from "./debugMode";
import { registerAppInfoIpc } from "./appInfoIpc";
import {
  createDebugLogger,
  createDebugLogRuntimeDetails,
  resolveDebugLogsDirectory,
  setDebugLogger,
  type DebugLogger
} from "./debugLogger";
import { registerContextMenuIpc } from "./contextMenuIpc";
import { registerDebugLogIpc } from "./debugLogIpc";
import { registerFileIpc } from "./fileIpc";
import { registerGlossaryIpc } from "./glossaryIpc";
import { installApplicationMenu, registerApplicationMenuIpc } from "./menu";
import {
  currentActiveProjectFilePath,
  currentProjectId,
  defaultProjectWriteOwnershipManager,
  registerProjectIpc,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectWindowTitle
} from "./projectIpc";
import { registerSettingsIpc } from "./settingsIpc";
import { SESSION_CHANNELS } from "../shared/api";
import { createUuidv7 } from "./ids";
import { createSessionStore } from "./sessionStore";
import {
  createSessionStoreController,
  type SessionStoreController
} from "./sessionStoreIpc";
import { installAppShutdownCleanup } from "./shutdownCleanup";
import { extractStartupProjectFilePathFromArgv } from "./startupProjectArgv";
import {
  createWindowLifecycleController,
  type WindowLifecycleController
} from "./windowLifecycle";

let mainWindow: BrowserWindow | null = null;
let windowLifecycleController: WindowLifecycleController | null = null;
let sessionStoreController: SessionStoreController | null = null;
const pergamumDebugMode = parseDebugModeFromArgv(process.argv);
// #272: one process-run identity for the lifetime of this Pergamum process.
const instanceRunId = createUuidv7();

if (started) {
  app.quit();
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  windowLifecycleController?.registerWindow(mainWindow);
  sessionStoreController?.attachWindow(mainWindow);

  mainWindow.on("closed", () => {
    sessionStoreController?.detachWindow();
    mainWindow = null;
  });

  setProjectWindowTitleTargetProvider(() => mainWindow);


  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  await mainWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
  );

  await updateCurrentProjectWindowTitle();
}

function installDebugLogLifecycleHandlers(logger: DebugLogger): void {
  installAppShutdownCleanup(app, async () => {
    try {
      await releaseCurrentProjectWriteOwnership();
    } finally {
      logger.flushAndClose();
    }
  });

  process.on("uncaughtException", (error) => {
    logger.log({
      level: "error",
      event: "app.uncaughtException",
      details: {
        operation: "unknown",
        result: "failed",
        error
      }
    });
    logger.flushAndClose();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logger.log({
      level: "error",
      event: "app.unhandledRejection",
      details: {
        operation: "unknown",
        result: "failed",
        error: reason
      }
    });
    logger.flushAndClose();
    process.exit(1);
  });
}

app.whenReady().then(async () => {
  const startupProjectFilePath = extractStartupProjectFilePathFromArgv(
    process.argv,
    {
      isPackaged: app.isPackaged
    }
  );
  const debugLogger = createDebugLogger({
    enabled: pergamumDebugMode,
    runtime: createDebugLogRuntimeDetails(app, pergamumDebugMode),
    isDevelopmentBuild: !app.isPackaged
  });
  setDebugLogger(debugLogger);
  installDebugLogLifecycleHandlers(debugLogger);
  debugLogger.log({
    level: "info",
    event: "app.start",
    details: {
      appVersion: true,
      platform: true,
      arch: true,
      locale: true,
      electronVersion: true,
      nodeVersion: true,
      debugMode: true
    }
  });
  debugLogger.openFileSink(resolveDebugLogsDirectory(app));

  windowLifecycleController = createWindowLifecycleController({
    app,
    ipcMain,
    getOpenWindowCount: () =>
      BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
        .length,
    systemTerminationSource: powerMonitor
  });

  await installApplicationMenu({
    getMainWindow: () => mainWindow,
    requestApplicationQuit: () => {
      windowLifecycleController?.requestApplicationQuit();
    },
    debugLogger
  });
  registerApplicationMenuIpc();
  registerDebugLogIpc(debugLogger);
  registerContextMenuIpc(debugLogger);
  registerFileIpc(debugLogger);
  registerGlossaryIpc(debugLogger);
  registerProjectIpc(
    debugLogger,
    defaultProjectWriteOwnershipManager,
    undefined,
    startupProjectFilePath
  );
  registerSettingsIpc();
  registerAppInfoIpc();

  // #272: durable Session restore-set persistence (write-out side only).
  sessionStoreController = createSessionStoreController({
    ipcMain,
    sessionStore: createSessionStore({
      baseDirectory: path.join(app.getPath("userData"), "sessions")
    }),
    instanceRunId,
    getMainWindow: () => mainWindow,
    getCurrentProjectId: () => currentProjectId(),
    getCurrentProjectFilePath: () => currentActiveProjectFilePath(),
    // A storage-class failure on a window-driven re-persist: tell the
    // renderer coordinator to SUSPEND (it shows the single Error dialog).
    onSessionStorageFailure: (reason) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(SESSION_CHANNELS.storageFailure, {
          reason
        });
      }
    }
  });
  sessionStoreController.registerIpc();

  void createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
