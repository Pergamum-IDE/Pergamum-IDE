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
import { isApplicationMenuCommandId } from "../shared/commandIds";
import type { Language } from "../shared/i18n";
import type { ResolvedKeybinding } from "../shared/keybindings";
import type { DebugLogger } from "./debugLogger";
import { buildNativeMenuTemplate } from "./applicationMenuAdapter";
import {
  createMenuAcceleratorLookup,
  nodePlatformToPergamumPlatform
} from "./menuAccelerators";
import { loadSettings } from "./settingsStore";

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
  /**
   * #645: the effective keybindings (defaults + user keybindings.json) the
   * menu accelerators come from. Omitted = the shipped defaults.
   */
  keybindingRows?: readonly ResolvedKeybinding[];
  requestApplicationQuit?: () => void;
  debugLogger?: Pick<DebugLogger, "log">;
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

/**
 * The native menu template. The structure comes from the canonical model
 * (`shared/applicationMenuModel`); `applicationMenuAdapter` turns it into
 * Electron items. What stays here is the runtime wiring: how a command reaches
 * the renderer (`sendApplicationMenuCommand`) and the Quit fallback.
 */
export function buildApplicationMenu(
  language: Language,
  options: ApplicationMenuOptions,
  platform: NodeJS.Platform = process.platform
): MenuItemConstructorOptions[] {
  const pergamumPlatform = nodePlatformToPergamumPlatform(platform);

  return buildNativeMenuTemplate({
    language,
    platform: pergamumPlatform,
    // #642: accelerators of Pergamum custom commands come from the shared
    // keybinding catalog, resolved for the MAIN process' platform.
    // #645: `keybindingRows` are the effective keybindings (user overrides).
    accelerators: createMenuAcceleratorLookup(
      pergamumPlatform,
      undefined,
      undefined,
      options.keybindingRows
    ),
    sendCommand: (commandId) =>
      sendApplicationMenuCommand(
        options.getMainWindow,
        commandId,
        options.debugLogger
      ),
    requestApplicationQuit: options.requestApplicationQuit
  });
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
  // A rebuilt menu starts with every item enabled: restore what the renderer
  // had reported.
  applyApplicationMenuEnablement({ ...lastMenuEnablement });
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
 * the stable `id: commandId` that `applicationMenuAdapter` sets on every
 * command menu item) instead of reconstructing the whole menu, so a
 * live `CommandContext` change (e.g. Application Settings becoming the
 * active tab, which makes `editor.kind.markdown` false) is reflected
 * immediately without flicker or losing menu state.
 */
/**
 * The last enablement the renderer reported, so a rebuilt menu (#647: after a
 * keybinding change) gets the same enabled / disabled items back.
 */
const lastMenuEnablement: Record<string, boolean> = {};

export function applyApplicationMenuEnablement(
  enablement: ApplicationMenuEnablementMap
): void {
  Object.assign(lastMenuEnablement, enablement);
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
