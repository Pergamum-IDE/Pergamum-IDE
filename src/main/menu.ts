import {
  Menu,
  ipcMain,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from "electron";
import {
  APPLICATION_MENU_CHANNELS,
  type ApplicationMenuEnablementMap
} from "../shared/api";
import {
  applicationCommandIds,
  assistCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  isApplicationMenuCommandId,
  type ApplicationMenuCommandId
} from "../shared/commandIds";
import { t, type Language, type TranslationKey } from "../shared/i18n";
import type { DebugLogger } from "./debugLogger";
import { loadSettings } from "./settingsStore";

type MenuRole = NonNullable<MenuItemConstructorOptions["role"]>;
type ApplicationMenuWebContents = Pick<
  BrowserWindow["webContents"],
  "isDestroyed" | "send"
>;

export interface ApplicationMenuTargetWindow {
  isDestroyed(): boolean;
  readonly webContents: ApplicationMenuWebContents;
}

export interface ApplicationMenuOptions {
  getMainWindow(): ApplicationMenuTargetWindow | null;
  debugLogger?: Pick<DebugLogger, "log">;
}

const applicationName = "Pergamum";

function label(
  language: Language,
  key: TranslationKey,
  values?: Record<string, string | number>
): string {
  return t(language, key, values);
}

function roleItem(
  role: MenuRole,
  language: Language,
  key: TranslationKey,
  values?: Record<string, string | number>
): MenuItemConstructorOptions {
  return {
    role,
    label: label(language, key, values)
  };
}

function commandMenuItem(
  commandId: ApplicationMenuCommandId,
  language: Language,
  key: TranslationKey,
  options: ApplicationMenuOptions,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    // #252 follow-up: gives applyApplicationMenuEnablement a stable way to
    // find this item later via Menu.getMenuItemById, so `when`-based
    // enablement (e.g. editor.kind.markdown) can be reflected as a real
    // disabled state without rebuilding the whole menu.
    id: commandId,
    label: label(language, key),
    accelerator,
    click: () => {
      sendApplicationMenuCommand(
        options.getMainWindow,
        commandId,
        options.debugLogger
      );
    }
  };
}

function macApplicationMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  const appName = applicationName;

  return {
    label: appName,
    submenu: [
      commandMenuItem(
        applicationCommandIds.openAbout,
        language,
        "menu.aboutPergamum",
        options
      ),
      { type: "separator" },
      roleItem("services", language, "menu.services"),
      { type: "separator" },
      roleItem("hide", language, "menu.hide", { appName }),
      roleItem("hideOthers", language, "menu.hideOthers"),
      roleItem("unhide", language, "menu.showAll"),
      { type: "separator" },
      roleItem("quit", language, "menu.quit", { appName })
    ]
  };
}

/**
 * Hidden, non-mac-only accelerator for `editor.close` (#184). macOS already
 * binds `Cmd+W` to the native `role: "close"` item below (Electron assigns
 * that role's platform-default accelerator automatically), so binding
 * `CommandOrControl+W` there too would collide with it — Mac-specific
 * shortcut design for that collision is explicitly out of scope for #184,
 * so this item is Windows/Linux only for now.
 */
function editorCloseWindowsLinuxMenuItem(
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: "Close Tab (Ctrl+W)",
    accelerator: "CommandOrControl+W",
    visible: false,
    acceleratorWorksWhenHidden: true,
    click: () => {
      sendApplicationMenuCommand(
        options.getMainWindow,
        editorCommandIds.close,
        options.debugLogger
      );
    }
  };
}

function fileMenu(
  language: Language,
  platform: NodeJS.Platform,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  const appName = applicationName;
  const commandItems: MenuItemConstructorOptions[] = [
    commandMenuItem(
      applicationCommandIds.createProject,
      language,
      "menu.createProject",
      options
    ),
    commandMenuItem(
      applicationCommandIds.openProject,
      language,
      "menu.openProject",
      options,
      "CommandOrControl+Shift+O"
    ),
    commandMenuItem(
      editorCommandIds.openMarkdownDocument,
      language,
      "menu.openMarkdownFile",
      options,
      "CommandOrControl+O"
    ),
    commandMenuItem(
      editorCommandIds.saveDocument,
      language,
      "menu.save",
      options,
      "CommandOrControl+S"
    ),
    commandMenuItem(
      editorCommandIds.saveAs,
      language,
      "menu.saveAs",
      options,
      "CommandOrControl+Shift+S"
    ),
    commandMenuItem(
      applicationCommandIds.toggleRecentProjects,
      language,
      "menu.recentProjects",
      options
    )
  ];

  return {
    label: label(language, "menu.file"),
    submenu:
      platform === "darwin"
        ? [
            ...commandItems,
            { type: "separator" },
            roleItem("close", language, "menu.close")
          ]
        : [
            ...commandItems,
            editorCloseWindowsLinuxMenuItem(options),
            { type: "separator" },
            roleItem("quit", language, "menu.quit", { appName })
          ]
  };
}

function editMenu(language: Language): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.edit"),
    submenu: [
      roleItem("undo", language, "menu.undo"),
      roleItem("redo", language, "menu.redo"),
      { type: "separator" },
      roleItem("cut", language, "menu.cut"),
      roleItem("copy", language, "menu.copy"),
      roleItem("paste", language, "menu.paste"),
      { type: "separator" },
      roleItem("selectAll", language, "menu.selectAll")
    ]
  };
}

function viewMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.view"),
    submenu: [
      commandMenuItem(
        commandPaletteCommandIds.open,
        language,
        "menu.commandPalette",
        options,
        "CommandOrControl+Shift+P"
      ),
      commandPaletteF1MenuItem(options),
      { type: "separator" },
      roleItem("reload", language, "menu.reload"),
      roleItem("forceReload", language, "menu.forceReload"),
      roleItem("toggleDevTools", language, "menu.toggleDevTools"),
      { type: "separator" },
      roleItem("resetZoom", language, "menu.actualSize"),
      roleItem("zoomIn", language, "menu.zoomIn"),
      roleItem("zoomOut", language, "menu.zoomOut"),
      { type: "separator" },
      roleItem("togglefullscreen", language, "menu.toggleFullScreen")
    ]
  };
}

/**
 * Electron menu items only carry a single accelerator string, so F1 is bound
 * via a second, hidden menu item rather than a second visible "Command
 * Palette..." entry. Hidden items still fire their accelerator by default
 * (acceleratorWorksWhenHidden defaults to true); it is set explicitly here
 * to document the intent.
 */
function commandPaletteF1MenuItem(
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: "Command Palette (F1)",
    accelerator: "F1",
    visible: false,
    acceleratorWorksWhenHidden: true,
    click: () => {
      sendApplicationMenuCommand(
        options.getMainWindow,
        commandPaletteCommandIds.open,
        options.debugLogger
      );
    }
  };
}

/**
 * Assist menu for document-level support commands. It currently hosts
 * line-ending diagnostics and paragraph indentation bulk operations.
 */
function assistMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.assist"),
    submenu: [
      commandMenuItem(
        assistCommandIds.showLineEndingDistribution,
        language,
        "menu.assist.showLineEndingDistribution",
        options
      ),
      commandMenuItem(
        assistCommandIds.insertParagraphIndent,
        language,
        "menu.assist.paragraphIndent.insert",
        options
      ),
      commandMenuItem(
        assistCommandIds.removeParagraphIndent,
        language,
        "menu.assist.paragraphIndent.remove",
        options
      )
    ]
  };
}

function macWindowMenu(language: Language): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.window"),
    submenu: [
      roleItem("minimize", language, "menu.minimize"),
      roleItem("zoom", language, "menu.zoom"),
      { type: "separator" },
      roleItem("front", language, "menu.bringAllToFront")
    ]
  };
}

function helpMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    role: "help",
    label: label(language, "menu.help"),
    submenu: [
      commandMenuItem(
        applicationCommandIds.openAbout,
        language,
        "menu.aboutPergamum",
        options
      )
    ]
  };
}

export function sendApplicationMenuCommand(
  getMainWindow: () => ApplicationMenuTargetWindow | null,
  commandId: string,
  debugLogger?: Pick<DebugLogger, "log">
): boolean {
  if (!isApplicationMenuCommandId(commandId)) {
    logApplicationMenuCommandSent(debugLogger, commandId, "ignored", {
      reason: "invalid_command"
    });
    return false;
  }

  const window = getMainWindow();

  if (!window || window.isDestroyed()) {
    logApplicationMenuCommandSent(debugLogger, commandId, "ignored", {
      reason: "window_unavailable"
    });
    return false;
  }

  if (window.webContents.isDestroyed()) {
    logApplicationMenuCommandSent(debugLogger, commandId, "ignored", {
      reason: "web_contents_destroyed"
    });
    return false;
  }

  logApplicationMenuCommandSent(debugLogger, commandId, "succeeded");
  window.webContents.send(APPLICATION_MENU_CHANNELS.command, commandId);
  return true;
}

function logApplicationMenuCommandSent(
  debugLogger: Pick<DebugLogger, "log"> | undefined,
  commandId: string,
  result: "succeeded" | "ignored",
  details: {
    reason?:
      | "invalid_command"
      | "window_unavailable"
      | "web_contents_destroyed";
    trigger?: "menu" | "accelerator" | "unknown";
  } = {}
): void {
  debugLogger?.log({
    level: "debug",
    event: "application_menu.command.sent",
    details: {
      commandId,
      operation: "command",
      result,
      trigger: details.trigger ?? "unknown",
      ...(details.reason ? { reason: details.reason } : {})
    }
  });
}

export function buildApplicationMenu(
  language: Language,
  options: ApplicationMenuOptions,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    ...(platform === "darwin" ? [macApplicationMenu(language, options)] : []),
    fileMenu(language, platform, options),
    editMenu(language),
    viewMenu(language, options),
    assistMenu(language, options),
    ...(platform === "darwin" ? [macWindowMenu(language)] : []),
    helpMenu(language, options)
  ];

  return template;
}

export function createApplicationMenu(
  language: Language,
  options: ApplicationMenuOptions,
  platform: NodeJS.Platform = process.platform
): Menu {
  return Menu.buildFromTemplate(
    buildApplicationMenu(language, options, platform)
  );
}

export async function installApplicationMenu(
  options: ApplicationMenuOptions
): Promise<void> {
  const settings = await loadSettings();

  Menu.setApplicationMenu(
    createApplicationMenu(settings.workbench.language, options)
  );
}

function isApplicationMenuEnablementMap(
  value: unknown
): value is ApplicationMenuEnablementMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([commandId, enabled]) =>
      isApplicationMenuCommandId(commandId) && typeof enabled === "boolean"
  );
}

/**
 * #252 follow-up: the native menu is built once at startup and never
 * rebuilt — this updates individual `MenuItem.enabled` flags in place (via
 * the stable `id: commandId` set on every command menu item by
 * `commandMenuItem` above) instead of reconstructing the whole menu, so a
 * live `CommandContext` change (e.g. Application Settings becoming the
 * active tab, which makes `editor.kind.markdown` false) is reflected
 * immediately without flicker or losing menu state.
 */
export function applyApplicationMenuEnablement(
  enablement: ApplicationMenuEnablementMap
): void {
  const menu = Menu.getApplicationMenu();

  if (!menu) {
    return;
  }

  for (const [commandId, enabled] of Object.entries(enablement)) {
    const item = menu.getMenuItemById(commandId);

    if (item) {
      item.enabled = enabled;
    }
  }
}

export function registerApplicationMenuIpc(): void {
  ipcMain.on(APPLICATION_MENU_CHANNELS.setEnablement, (_event, payload) => {
    if (isApplicationMenuEnablementMap(payload)) {
      applyApplicationMenuEnablement(payload);
    }
  });
}
