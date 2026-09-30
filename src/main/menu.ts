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
  glossaryTabCommandIds,
  isApplicationMenuCommandId,
  projectSettingsCommandIds,
  searchSelectionShortcutCommandIds,
  workspaceCommandIds,
  type ApplicationMenuCommandId
} from "../shared/commandIds";
import { t, type Language, type TranslationKey } from "../shared/i18n";
import type { DebugLogger } from "./debugLogger";
import {
  createMenuAcceleratorLookup,
  nodePlatformToPergamumPlatform,
  type MenuAcceleratorLookup
} from "./menuAccelerators";
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
  requestApplicationQuit?: () => void;
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
  values?: Record<string, string | number>,
  accelerator?: string,
  id?: string
): MenuItemConstructorOptions {
  return {
    ...(id ? { id } : {}),
    role,
    label: label(language, key, values),
    // Electron assigns each role a built-in default accelerator when this
    // is omitted. Pass one explicitly to override it (e.g. #535 follow-up:
    // `toggleDevTools`'s own default, CmdOrCtrl+Shift+I on Windows/Linux,
    // collides with the Insert Image toolbar shortcut).
    ...(accelerator ? { accelerator } : {})
  };
}

function commandMenuItem(
  commandId: ApplicationMenuCommandId,
  language: Language,
  key: TranslationKey,
  options: ApplicationMenuOptions,
  accelerator?: string,
  values?: Record<string, string | number>
): MenuItemConstructorOptions {
  return {
    // #252 follow-up: gives applyApplicationMenuEnablement a stable way to
    // find this item later via Menu.getMenuItemById, so `when`-based
    // enablement (e.g. editor.kind.markdown) can be reflected as a real
    // disabled state without rebuilding the whole menu.
    id: commandId,
    label: label(language, key, values),
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

function quitApplicationMenuItem(
  language: Language,
  options: ApplicationMenuOptions,
  accelerator: string
): MenuItemConstructorOptions {
  const appName = applicationName;

  return {
    id: applicationCommandIds.quitApplication,
    label: label(language, "menu.quit", { appName }),
    accelerator,
    click: () => {
      const sentToRenderer = sendApplicationMenuCommand(
        options.getMainWindow,
        applicationCommandIds.quitApplication,
        options.debugLogger
      );

      if (!sentToRenderer) {
        options.requestApplicationQuit?.();
      }
    }
  };
}

function macApplicationMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: applicationName,
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
      roleItem("hide", language, "menu.hide", { appName: applicationName }),
      roleItem("hideOthers", language, "menu.hideOthers"),
      roleItem("unhide", language, "menu.showAll"),
      { type: "separator" },
      quitApplicationMenuItem(language, options, "Command+Q")
    ]
  };
}

function importMenu(
  language: Language,
  options: ApplicationMenuOptions
): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.file.import"),
    submenu: [
      commandMenuItem(
        applicationCommandIds.openBulkTextImportDialog,
        language,
        "menu.file.import.bulkTextFiles",
        options
      )
    ]
  };
}

function fileMenu(
  language: Language,
  platform: NodeJS.Platform,
  options: ApplicationMenuOptions,
  accelerators: MenuAcceleratorLookup
): MenuItemConstructorOptions {
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
      accelerators.get(applicationCommandIds.openProject)
    ),
    commandMenuItem(
      applicationCommandIds.closeProject,
      language,
      "menu.closeProject",
      options
    ),
    { type: "separator" },
    importMenu(language, options),
    { type: "separator" },
    commandMenuItem(
      editorCommandIds.newFile,
      language,
      "menu.newFile",
      options,
      accelerators.get(editorCommandIds.newFile)
    ),
    // #556: CommandOrControl+O was freed up for the Command Palette's
    // project-file-open mode (a renderer-level global shortcut — see
    // App.tsx). Keeping it here as an Electron menu accelerator would
    // intercept the keystroke before the renderer ever sees it (same
    // mechanism removed for Reload in #552), so this item is now
    // mouse/menu-only.
    commandMenuItem(
      editorCommandIds.openMarkdownDocument,
      language,
      "menu.openMarkdownFile",
      options
    ),
    commandMenuItem(
      editorCommandIds.close,
      language,
      "menu.closeCurrentTab",
      options,
      accelerators.get(editorCommandIds.close)
    ),
    commandMenuItem(
      editorCommandIds.saveDocument,
      language,
      "menu.save",
      options,
      accelerators.get(editorCommandIds.saveDocument)
    ),
    commandMenuItem(
      editorCommandIds.saveAll,
      language,
      "menu.saveAll",
      options,
      accelerators.get(editorCommandIds.saveAll)
    ),
    commandMenuItem(
      editorCommandIds.saveAs,
      language,
      "menu.saveAs",
      options,
      accelerators.get(editorCommandIds.saveAs)
    ),
    ...saveAsF12MenuItem(options, accelerators.getAll(editorCommandIds.saveAs)[1]),
    { type: "separator" },
    commandMenuItem(
      projectSettingsCommandIds.open,
      language,
      "menu.projectSettings",
      options
    ),
    commandMenuItem(
      workspaceCommandIds.openApplicationSettings,
      language,
      "menu.applicationSettings",
      options
    ),
    ...applicationSettingsHiddenAcceleratorMenuItem(
      options,
      accelerators.get(workspaceCommandIds.openApplicationSettings)
    )
  ];

  return {
    label: label(language, "menu.file"),
    submenu:
      platform === "darwin"
        ? [
            ...commandItems,
            { type: "separator" },
            // #636: Cmd+W belongs to `editor.close` (active document tab).
            // The native Close Window role gets Cmd+Shift+W so the two
            // never claim the same accelerator on macOS.
            roleItem(
              "close",
              language,
              "menu.close",
              undefined,
              "CommandOrControl+Shift+W"
            )
          ]
        : [
            ...commandItems,
            { type: "separator" },
            quitApplicationMenuItem(language, options, "CommandOrControl+Q")
          ]
  };
}

function editMenu(
  language: Language,
  options: ApplicationMenuOptions,
  accelerators: MenuAcceleratorLookup
): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.edit"),
    submenu: [
      roleItem("undo", language, "menu.undo", undefined, undefined, editorCommandIds.undo),
      roleItem("redo", language, "menu.redo", undefined, undefined, editorCommandIds.redo),
      { type: "separator" },
      roleItem("cut", language, "menu.cut", undefined, undefined, editorCommandIds.cutSelection),
      roleItem("copy", language, "menu.copy", undefined, undefined, editorCommandIds.copySelection),
      roleItem("paste", language, "menu.paste", undefined, undefined, editorCommandIds.pasteSelection),
      { type: "separator" },
      roleItem("selectAll", language, "menu.selectAll", undefined, undefined, editorCommandIds.selectAllSelection),
      { type: "separator" },
      // #457: seeds the currently selected text (anywhere in the Pergamum
      // UI, not just the active editor) into Project Search / Replace. The
      // accelerator carries no payload - the renderer resolves the
      // selection itself when the command executes.
      commandMenuItem(
        searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
        language,
        "menu.edit.findInProject",
        options,
        accelerators.get(
          searchSelectionShortcutCommandIds.openProjectSearchFromSelection
        )
      ),
      commandMenuItem(
        searchSelectionShortcutCommandIds.openProjectReplaceFromSelection,
        language,
        "menu.edit.replaceInProject",
        options,
        accelerators.get(
          searchSelectionShortcutCommandIds.openProjectReplaceFromSelection
        )
      )
    ]
  };
}

function viewMenu(
  language: Language,
  options: ApplicationMenuOptions,
  accelerators: MenuAcceleratorLookup
): MenuItemConstructorOptions {
  return {
    label: label(language, "menu.view"),
    submenu: [
      commandMenuItem(
        commandPaletteCommandIds.open,
        language,
        "menu.commandPalette",
        options,
        // #554: Mod+P is Pergamum's primary Command Palette / launcher
        // shortcut (moved off Mod+Shift+P, which VSCode uses — Pergamum is
        // not a VSCode clone). Preview toggle now owns Mod+Shift+P instead
        // (see the `togglePreview` global shortcut in App.tsx).
        accelerators.get(commandPaletteCommandIds.open)
      ),
      ...commandPaletteF1MenuItem(
        options,
        accelerators.getAll(commandPaletteCommandIds.open)[1]
      ),
      { type: "separator" },
      roleItem(
        "toggleDevTools",
        language,
        "menu.toggleDevTools",
        undefined,
        "CommandOrControl+Shift+D"
      ),
      { type: "separator" },
      commandMenuItem(
        applicationCommandIds.zoomIn,
        language,
        "menu.zoomIn",
        options,
        accelerators.get(applicationCommandIds.zoomIn)
      ),
      ...zoomInPlusAliasMenuItem(
        options,
        accelerators.getAll(applicationCommandIds.zoomIn)[1]
      ),
      commandMenuItem(
        applicationCommandIds.zoomOut,
        language,
        "menu.zoomOut",
        options,
        accelerators.get(applicationCommandIds.zoomOut)
      ),
      commandMenuItem(
        applicationCommandIds.resetZoom,
        language,
        "menu.actualSize",
        options,
        accelerators.get(applicationCommandIds.resetZoom)
      ),
      { type: "separator" },
      roleItem("togglefullscreen", language, "menu.toggleFullScreen")
    ]
  };
}

/**
 * A hidden menu item that only carries an extra accelerator for a command.
 * Electron menu items hold a single accelerator string, so each alias key of
 * a catalog command (#642: the 2nd and later default keys) is bound through
 * its own hidden item rather than a second visible entry. Hidden items still
 * fire their accelerator (acceleratorWorksWhenHidden defaults to true; it is
 * set explicitly to document the intent). With no accelerator (the catalog
 * has no such key on this platform) there is nothing to bind, so no item is
 * created.
 */
function hiddenAcceleratorAliasItems(
  options: ApplicationMenuOptions,
  commandId: ApplicationMenuCommandId,
  aliasLabel: string,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  if (accelerator === undefined) {
    return [];
  }
  return [
    {
      label: aliasLabel,
      accelerator,
      visible: false,
      acceleratorWorksWhenHidden: true,
      click: () => {
        sendApplicationMenuCommand(
          options.getMainWindow,
          commandId,
          options.debugLogger
        );
      }
    }
  ];
}

/** Hidden accelerator alias for Zoom In (`Mod-+`, i.e. `CommandOrControl+Plus`). */
function zoomInPlusAliasMenuItem(
  options: ApplicationMenuOptions,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  return hiddenAcceleratorAliasItems(
    options,
    applicationCommandIds.zoomIn,
    "Zoom In (+)",
    accelerator
  );
}

/**
 * F1 for the Command Palette, bound via a hidden item rather than a second
 * visible "Command Palette..." entry.
 */
function commandPaletteF1MenuItem(
  options: ApplicationMenuOptions,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  return hiddenAcceleratorAliasItems(
    options,
    commandPaletteCommandIds.open,
    "Command Palette (F1)",
    accelerator
  );
}

/**
 * #587 Slice 5: F12 as a hidden accelerator alias for `editor.saveAs`.
 * The primary menu item displays `Ctrl+Shift+S`; F12 is bound as a second,
 * hidden item matching `commandPaletteF1MenuItem`'s design above.
 */
function saveAsF12MenuItem(
  options: ApplicationMenuOptions,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  return hiddenAcceleratorAliasItems(
    options,
    editorCommandIds.saveAs,
    "Save As (F12)",
    accelerator
  );
}

/**
 * #591 follow-up: Electron localizes the comma accelerator label on Japanese
 * Windows as "Ctrl+カンマ". Keep the visible item without an accelerator label
 * and register the catalog's `Mod-,` on a hidden item.
 */
function applicationSettingsHiddenAcceleratorMenuItem(
  options: ApplicationMenuOptions,
  accelerator: string | undefined
): MenuItemConstructorOptions[] {
  return hiddenAcceleratorAliasItems(
    options,
    workspaceCommandIds.openApplicationSettings,
    "Application Settings (Ctrl+,)",
    accelerator
  );
}

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
      ),
      { type: "separator" },
      commandMenuItem(
        glossaryTabCommandIds.manageEntries,
        language,
        "menu.assist.manageGlossaryEntries",
        options
      ),
      commandMenuItem(
        glossaryTabCommandIds.manageTags,
        language,
        "menu.assist.manageGlossaryTags",
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
        workspaceCommandIds.showResumeHub,
        language,
        "menu.showResumeHub",
        options
      ),
      { type: "separator" },
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
  // #642: accelerators of Pergamum custom commands come from the shared
  // keybinding catalog, resolved for the MAIN process' platform.
  const accelerators = createMenuAcceleratorLookup(
    nodePlatformToPergamumPlatform(platform)
  );
  const template: MenuItemConstructorOptions[] = [
    ...(platform === "darwin" ? [macApplicationMenu(language, options)] : []),
    fileMenu(language, platform, options, accelerators),
    editMenu(language, options, accelerators),
    viewMenu(language, options, accelerators),
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
