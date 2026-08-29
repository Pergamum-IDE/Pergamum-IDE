import { app, BrowserWindow, ipcMain, powerMonitor, screen } from "electron";
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
  registerCurrentProjectDocumentPath,
  registerProjectIpc,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectWindowTitle
} from "./projectIpc";
import { registerSettingsIpc } from "./settingsIpc";
import { SESSION_CHANNELS, type ColdStartRestorePayload } from "../shared/api";
import type { AppPlatform } from "../shared/platform";
import type { WindowSessionState } from "../shared/session";
import { selectRestoreSession } from "../shared/sessionRestore";
import { createUuidv7 } from "./ids";
import { createSessionStore, type SessionStore } from "./sessionStore";
import {
  createSessionStoreController,
  type SessionStoreController
} from "./sessionStoreIpc";
import {
  coldStartRestorePayload,
  registerColdStartRestoreIpc
} from "./coldStartRestoreIpc";
import {
  readColdStartRestoreSet,
  type ColdStartRestoreRead
} from "./sessionRestoreRead";
import {
  applyWindowSessionMode,
  resolveWindowPlacement,
  type DisplayWorkAreaLike
} from "./windowStateRestore";
import { installAppShutdownCleanup } from "./shutdownCleanup";
import { extractStartupProjectFilePathFromArgv } from "./startupProjectArgv";
import { extractColdStartLaunchTarget } from "./startupLaunchTarget";
import {
  createWindowLifecycleController,
  type WindowLifecycleController
} from "./windowLifecycle";
import {
  initializeRecoveryStore,
  recoveryStoreOwnerDatabase,
  recoveryStoreStatus,
  shutdownRecoveryStore
} from "./recoveryStore";
import { registerRecoveryStoreIpc } from "./recoveryStoreIpc";
import { registerRecoveryDocumentIpc } from "./recoveryDocumentIpc";
import { registerRecoveryCandidateIpc } from "./recoveryCandidateIpc";

let mainWindow: BrowserWindow | null = null;
let windowLifecycleController: WindowLifecycleController | null = null;
let sessionStoreController: SessionStoreController | null = null;
// #274: the cold-start restore payload (bounded restore-set read + launch
// target), assembled once at startup and served ONLY to the initial
// cold-start window. `coldStartWebContentsId` is that window's webContents
// id — a later `app.activate` window (macOS) gets the neutral payload and
// never replays the startup Session snapshot / launch target / Window
// placement (BLOCKER 2).
let coldStartPayload: ColdStartRestorePayload | null = null;
let coldStartWebContentsId: number | null = null;
const pergamumDebugMode = parseDebugModeFromArgv(process.argv);
// #272: one process-run identity for the lifetime of this Pergamum process.
const instanceRunId = createUuidv7();

if (started) {
  app.quit();
}

function nodePlatformToAppPlatform(platform: NodeJS.Platform): AppPlatform {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

/**
 * #274: the window state to apply on cold start — from the single Session
 * the renderer will select (same pure selection, same inputs, so it cannot
 * diverge). `null` when there is nothing to restore.
 */
function coldStartWindowSessionState(
  payload: ColdStartRestorePayload
): WindowSessionState | null {
  if (payload.read.kind !== "ok") {
    return null;
  }

  const selection = selectRestoreSession({
    candidates: payload.read.sessions,
    launchTarget: payload.launchTarget,
    platform: nodePlatformToAppPlatform(process.platform)
  });

  return selection.kind === "selected" ? selection.session.window : null;
}

async function createMainWindow(isColdStartWindow: boolean): Promise<void> {
  // #274: saved Window placement + mode apply ONLY to the initial cold-start
  // window. A later `app.activate` window opens with the built-in defaults.
  const displays: DisplayWorkAreaLike[] = screen
    .getAllDisplays()
    .map((display) => ({ workArea: display.workArea }));
  const placement = resolveWindowPlacement(
    isColdStartWindow && coldStartPayload
      ? coldStartWindowSessionState(coldStartPayload)
      : null,
    displays
  );

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    ...(placement.bounds ?? {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (isColdStartWindow) {
    coldStartWebContentsId = mainWindow.webContents.id;
  }

  // #274 (BLOCKER 4): apply the saved maximize / fullscreen mode BEFORE the
  // renderer content is loaded, so the renderer's Session restore (which
  // only begins after its bundle + settings have loaded) can never run
  // ahead of the Window mode being applied. Order contract:
  //   Window (+ mode) → renderer load → layout → documents/editors → #273.
  applyWindowSessionMode(mainWindow, placement.mode);

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
      // #285: release the Recovery Store ownership lock (owner only) before
      // the project write lock, so a normal quit leaves nothing behind.
      await shutdownRecoveryStore(logger);
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
  const startupProjectArgvOptions = { isPackaged: app.isPackaged };
  const startupProjectFilePath = extractStartupProjectFilePathFromArgv(
    process.argv,
    startupProjectArgvOptions
  );
  // #274: cold-start launch target (`.pergamum` or Markdown). Extracted
  // here so the restore payload can carry it; runtime `second-instance` /
  // `open-file` forwarding stays out of scope.
  const coldStartLaunchTarget = extractColdStartLaunchTarget(
    process.argv,
    startupProjectArgvOptions
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

  const sessionStore: SessionStore = createSessionStore({
    baseDirectory: path.join(app.getPath("userData"), "sessions")
  });

  // #272: durable Session restore-set persistence (write-out side).
  sessionStoreController = createSessionStoreController({
    ipcMain,
    sessionStore,
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

  // #274: bounded, cold-start restore-set read. Runs BEFORE the window is
  // created so Window state can be applied to the initial BrowserWindow.
  // A timeout / unavailable manifest never blocks startup and never
  // repairs, rewrites, or deletes anything.
  const coldStartRead: ColdStartRestoreRead = await readColdStartRestoreSet({
    store: sessionStore
  });
  coldStartPayload = coldStartRestorePayload(
    coldStartRead,
    coldStartLaunchTarget
  );
  registerColdStartRestoreIpc(ipcMain, {
    getColdStartPayload: () => coldStartPayload!,
    getColdStartWebContentsId: () => coldStartWebContentsId
  });

  // #285: bring up the app-userData Recovery Store. First-come owner lock;
  // a non-owner instance stays silent. A failure here NEVER blocks startup
  // — the status is simply held as `unavailable`.
  try {
    await initializeRecoveryStore({
      userDataPath: app.getPath("userData"),
      instanceRunId,
      appVersion: app.getVersion(),
      logger: debugLogger
    });
  } catch (error) {
    debugLogger.log({
      level: "error",
      event: "recovery.store.init.failed",
      details: { pathKind: "appData", reason: "unknown", error }
    });
  }
  registerRecoveryStoreIpc(ipcMain, recoveryStoreStatus);
  // #286: renderer → main dirty Markdown payload persistence. Owner-only
  // (the handlers guard on `recoveryStoreStatus()`); a non-owner instance
  // silently returns `{ ok: false, skipped }`.
  registerRecoveryDocumentIpc(ipcMain, {
    getStatus: recoveryStoreStatus,
    getOwnerDatabase: recoveryStoreOwnerDatabase,
    instanceRunId,
    appVersion: app.getVersion(),
    logger: debugLogger
  });
  // #287: Recovery candidate dialog — list / restore / discard / report.
  // Owner-only; a non-owner instance gets a silent `{ ok: false, skipped }`.
  registerRecoveryCandidateIpc(ipcMain, {
    getStatus: recoveryStoreStatus,
    getOwnerDatabase: recoveryStoreOwnerDatabase,
    instanceRunId,
    appVersion: app.getVersion(),
    logger: debugLogger,
    // #287 follow-up: a recovered file written inside the open project root
    // becomes a project document so the renderer opens it project-owned.
    registerRestoredProjectDocument: registerCurrentProjectDocumentPath
  });

  void createMainWindow(true);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(false);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
