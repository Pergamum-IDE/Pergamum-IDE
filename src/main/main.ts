import { app, BrowserWindow } from "electron";
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
import { installApplicationMenu } from "./menu";
import {
  defaultProjectWriteOwnershipManager,
  registerProjectIpc,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectWindowTitle
} from "./projectIpc";
import { registerSettingsIpc } from "./settingsIpc";
import { extractStartupProjectFilePathFromArgv } from "./startupProjectArgv";

let mainWindow: BrowserWindow | null = null;
const pergamumDebugMode = parseDebugModeFromArgv(process.argv);

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

  mainWindow.on("closed", () => {
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
  app.on("before-quit", () => {
    void releaseCurrentProjectWriteOwnership();
    logger.flushAndClose();
  });
  app.on("will-quit", () => {
    void releaseCurrentProjectWriteOwnership();
    logger.flushAndClose();
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

  await installApplicationMenu({
    getMainWindow: () => mainWindow,
    debugLogger
  });
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
