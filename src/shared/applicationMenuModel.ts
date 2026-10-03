/**
 * #662: the canonical Application Menu model.
 *
 * A declarative, Electron-free description of WHAT the application menu
 * contains: structure, command identity, i18n label keys and native-role
 * metadata. It is the single definition both menu surfaces are built from
 * (#661): the Electron native menu today (see `main/applicationMenuAdapter`),
 * and later the Renderer menu bar.
 *
 * Two separate questions about a command item's key (#693):
 *   - shortcut DISPLAY (`shortcutDisplay`): is its effective primary key shown
 *     as a label? Read by the Renderer menu (Windows / Linux).
 *   - native ACCELERATOR (`nativeAccelerator`): is its key registered with
 *     Electron's native menu, which then handles the keystroke itself? Opt-in:
 *     the default is no accelerator. Showing a key never registers it.
 *
 * What is deliberately NOT in here:
 *   - shortcut strings: labels and accelerators both come from the effective
 *     keybindings; the model only holds the two policies above
 *   - enablement: the renderer's CommandContext is the one source of truth,
 *     keyed by `commandId`
 *   - click handlers / dispatch / Electron types: adapter concerns
 */

import {
  applicationCommandIds,
  assistCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  glossaryTabCommandIds,
  projectSettingsCommandIds,
  searchSelectionShortcutCommandIds,
  workspaceCommandIds,
  type ApplicationMenuCommandId
} from "./commandIds";
import type { TranslationKey } from "./i18n";
import type { PergamumPlatform } from "./keybindings";

/** The product name shown in the macOS application menu / `{appName}` labels. */
export const APPLICATION_MENU_APP_NAME = "Pergamum";

/**
 * Native (OS / Electron provided) behaviors. A native-role item is NEVER
 * routed through a Pergamum command handler: the adapter maps it to the
 * Electron role of the same name so the OS semantics are kept.
 */
export type NativeMenuRole =
  | "services"
  | "hide"
  | "hideOthers"
  | "unhide"
  | "close"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "toggleDevTools"
  | "togglefullscreen"
  | "minimize"
  | "zoom"
  | "front"
  | "help";

export type ApplicationMenuLabel =
  | {
      readonly key: TranslationKey;
      readonly values?: Readonly<Record<string, string | number>>;
    }
  /** Not translated (the macOS application menu is just the product name). */
  | { readonly literal: string };

/**
 * Whether the Renderer menu labels a command item with its effective primary
 * shortcut (the first bound key; user overrides and unbinds included).
 *   - `primary` (default): show it
 *   - `none`: never show one
 * This is presentation only. It says nothing about native registration, and the
 * macOS native menu (whose items are drawn by the OS) cannot show a key that is
 * not also a native accelerator - it shows none rather than fake one.
 */
export type ApplicationMenuShortcutDisplay = "primary" | "none";

/**
 * Whether a command item registers its effective key(s) as an Electron native
 * menu accelerator. Opt-in: the default is `none` - the key is then handled by
 * the Renderer's configurable keybinding path only.
 *   - `primary`: the visible native item carries the primary key
 *   - `hiddenPrimary`: the primary key is bound through a hidden item and the
 *     visible native item shows no accelerator label (#591: Electron localizes
 *     the comma key as "Ctrl+カンマ" on Japanese Windows)
 *   - `none`: no accelerator
 */
export type ApplicationMenuNativeAccelerator =
  | "primary"
  | "hiddenPrimary"
  | "none";

interface ApplicationMenuItemBase {
  /** Omitted = every platform. */
  readonly platforms?: readonly PergamumPlatform[];
}

export interface ApplicationMenuCommandItem extends ApplicationMenuItemBase {
  readonly type: "command";
  /** Canonical identity; also the stable id used for enablement updates. */
  readonly commandId: ApplicationMenuCommandId;
  readonly label: ApplicationMenuLabel;
  /** Default `primary`. See {@link ApplicationMenuShortcutDisplay}. */
  readonly shortcutDisplay?: ApplicationMenuShortcutDisplay;
  /** Default `none`. See {@link ApplicationMenuNativeAccelerator}. */
  readonly nativeAccelerator?: ApplicationMenuNativeAccelerator;
  /**
   * #664: display only. The keybinding catalog row (a readonly native-role
   * row, e.g. `app.quit`) whose key the Renderer menu shows although this
   * item binds no customizable key (`shortcutDisplay: "none"`): the native
   * menu backend binds it itself. It is an id, never a shortcut string.
   */
  readonly shortcutDisplayId?: string;
  /**
   * Native only (needs a `nativeAccelerator`): the command's second and later
   * catalog keys (F1, F12, `Mod-+`, ...) are also registered, through hidden
   * items, without a second visible entry (#642). Never shown as a label.
   */
  readonly nativeKeyAlias?: true;
}

export interface ApplicationMenuNativeRoleItem extends ApplicationMenuItemBase {
  readonly type: "nativeRole";
  readonly role: NativeMenuRole;
  readonly label: ApplicationMenuLabel;
  /** Set when the renderer reports enablement for this item's command. */
  readonly commandId?: ApplicationMenuCommandId;
  /**
   * #664: display only. The keybinding catalog row documenting this role's
   * shortcut when it is not `commandId` (e.g. `developer.toggleDevTools`).
   */
  readonly shortcutDisplayId?: string;
}

export interface ApplicationMenuSubmenuItem extends ApplicationMenuItemBase {
  readonly type: "submenu";
  readonly label: ApplicationMenuLabel;
  /**
   * #668: the menu's access key (mnemonic) as ONE uppercase Latin letter. It
   * is semantic identity, not presentation: translations never contain it
   * (no `&File` / `ファイル(&F)`), and each surface decides how to show it
   * (the Renderer menu appends `(F)` to labels that lack the letter). Alt-key
   * activation (#665) reads it from here. Set on the top-level menus only; it
   * is not a command shortcut (those come from the keybindings).
   */
  readonly mnemonic?: string;
  /** The submenu itself is a native role (the Help menu). */
  readonly role?: "help";
  readonly items: readonly ApplicationMenuItem[];
}

export interface ApplicationMenuSeparatorItem extends ApplicationMenuItemBase {
  readonly type: "separator";
}

export type ApplicationMenuItem =
  | ApplicationMenuCommandItem
  | ApplicationMenuNativeRoleItem
  | ApplicationMenuSubmenuItem
  | ApplicationMenuSeparatorItem;

/** A top-level menu (File, Edit, ...). */
export type ApplicationMenuTopLevelItem = ApplicationMenuSubmenuItem;

const separator: ApplicationMenuSeparatorItem = { type: "separator" };

function command(
  commandId: ApplicationMenuCommandId,
  key: TranslationKey,
  extras: Pick<
    ApplicationMenuCommandItem,
    | "shortcutDisplay"
    | "nativeAccelerator"
    | "nativeKeyAlias"
    | "platforms"
    | "shortcutDisplayId"
  > = {}
): ApplicationMenuCommandItem {
  return { type: "command", commandId, label: { key }, ...extras };
}

function nativeRole(
  role: NativeMenuRole,
  key: TranslationKey,
  extras: Pick<
    ApplicationMenuNativeRoleItem,
    "commandId" | "platforms" | "shortcutDisplayId"
  > & { values?: Readonly<Record<string, string | number>> } = {}
): ApplicationMenuNativeRoleItem {
  const { values, ...rest } = extras;
  return {
    type: "nativeRole",
    role,
    label: values ? { key, values } : { key },
    ...rest
  };
}

function submenu(
  key: TranslationKey,
  items: readonly ApplicationMenuItem[],
  extras: Pick<
    ApplicationMenuSubmenuItem,
    "role" | "platforms" | "mnemonic"
  > = {}
): ApplicationMenuSubmenuItem {
  return { type: "submenu", label: { key }, items, ...extras };
}

/**
 * Quit is a command (`app.quit`), not a bare native role: it runs the
 * renderer's dirty-document preflight first (see the adapter). It lives in the
 * macOS application menu and, elsewhere, at the end of the File menu.
 */
function quitItem(
  platforms: readonly PergamumPlatform[]
): ApplicationMenuCommandItem {
  return {
    type: "command",
    commandId: applicationCommandIds.quitApplication,
    label: { key: "menu.quit", values: { appName: APPLICATION_MENU_APP_NAME } },
    shortcutDisplay: "none",
    // The native backend binds Quit's fixed accelerator (an explicit one, not
    // a customizable key); the catalog row documents it (readonly native
    // role), so the Renderer menu can show it.
    shortcutDisplayId: "app.quit",
    platforms
  };
}

const macApplicationMenu: ApplicationMenuTopLevelItem = {
  type: "submenu",
  label: { literal: APPLICATION_MENU_APP_NAME },
  platforms: ["darwin"],
  items: [
    command(applicationCommandIds.openAbout, "menu.aboutPergamum"),
    separator,
    nativeRole("services", "menu.services"),
    separator,
    nativeRole("hide", "menu.hide", {
      values: { appName: APPLICATION_MENU_APP_NAME }
    }),
    nativeRole("hideOthers", "menu.hideOthers"),
    nativeRole("unhide", "menu.showAll"),
    separator,
    quitItem(["darwin"])
  ]
};

const fileMenu: ApplicationMenuTopLevelItem = submenu("menu.file", [
  command(applicationCommandIds.createProject, "menu.createProject"),
  command(applicationCommandIds.openProject, "menu.openProject", {
    nativeAccelerator: "primary"
  }),
  command(applicationCommandIds.closeProject, "menu.closeProject"),
  separator,
  submenu("menu.file.import", [
    command(
      applicationCommandIds.openBulkTextImportDialog,
      "menu.file.import.bulkTextFiles"
    )
  ]),
  separator,
  command(editorCommandIds.newFile, "menu.newFile", {
    nativeAccelerator: "primary"
  }),
  // #556: CommandOrControl+O was freed up for the Command Palette's
  // project-file-open mode (a renderer-level global shortcut). An Electron
  // menu accelerator would intercept the keystroke before the renderer ever
  // sees it (same mechanism removed for Reload in #552), so this item is
  // never carries a native accelerator (the default). If the user binds a key
  // to it, the Renderer menu may label it, but only the Renderer's own
  // keybinding path handles the keystroke.
  command(editorCommandIds.openMarkdownDocument, "menu.openMarkdownFile"),
  command(editorCommandIds.close, "menu.closeCurrentTab", {
    nativeAccelerator: "primary"
  }),
  command(editorCommandIds.saveDocument, "menu.save", {
    nativeAccelerator: "primary"
  }),
  command(editorCommandIds.saveAll, "menu.saveAll", {
    nativeAccelerator: "primary"
  }),
  // #587 Slice 5: F12 is the second catalog key (an alias, no second entry).
  command(editorCommandIds.saveAs, "menu.saveAs", {
    nativeAccelerator: "primary",
    nativeKeyAlias: true
  }),
  separator,
  command(projectSettingsCommandIds.open, "menu.projectSettings"),
  // #646: the read-only Keyboard Shortcuts screen, right before Application
  // Settings. A menu entry only: it carries no native accelerator.
  command(workspaceCommandIds.openKeyboardShortcuts, "menu.keyboardShortcuts"),
  // #591 follow-up: the key is bound (through a hidden native item) but the
  // visible native item shows no accelerator label. The Renderer menu still
  // shows the effective primary key (shortcutDisplay defaults to primary).
  command(
    workspaceCommandIds.openApplicationSettings,
    "menu.applicationSettings",
    { nativeAccelerator: "hiddenPrimary" }
  ),
  separator,
  // #636: Cmd+W belongs to `editor.close` (active document tab). The native
  // Close Window role gets its own, different accelerator on macOS (adapter)
  // so the two never claim the same one.
  nativeRole("close", "menu.close", { platforms: ["darwin"] }),
  quitItem(["win32", "linux"])
], { mnemonic: "F" });

const editMenu: ApplicationMenuTopLevelItem = submenu("menu.edit", [
  // The edit roles keep native behavior; their command ids only let the
  // renderer's enablement reach the items.
  nativeRole("undo", "menu.undo", { commandId: editorCommandIds.undo }),
  nativeRole("redo", "menu.redo", { commandId: editorCommandIds.redo }),
  separator,
  nativeRole("cut", "menu.cut", { commandId: editorCommandIds.cutSelection }),
  nativeRole("copy", "menu.copy", { commandId: editorCommandIds.copySelection }),
  nativeRole("paste", "menu.paste", {
    commandId: editorCommandIds.pasteSelection
  }),
  separator,
  nativeRole("selectAll", "menu.selectAll", {
    commandId: editorCommandIds.selectAllSelection
  }),
  separator,
  // #457: seeds the currently selected text (anywhere in the Pergamum UI, not
  // just the active editor) into Project Search / Replace. The accelerator
  // carries no payload - the renderer resolves the selection itself.
  command(
    searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
    "menu.edit.findInProject",
    { nativeAccelerator: "primary" }
  ),
  command(
    searchSelectionShortcutCommandIds.openProjectReplaceFromSelection,
    "menu.edit.replaceInProject",
    { nativeAccelerator: "primary" }
  )
], { mnemonic: "E" });

const viewMenu: ApplicationMenuTopLevelItem = submenu("menu.view", [
  // #554: Mod+P is the primary Command Palette / launcher shortcut; F1 is its
  // alias (no second visible entry).
  command(commandPaletteCommandIds.open, "menu.commandPalette", {
    nativeAccelerator: "primary",
    nativeKeyAlias: true
  }),
  separator,
  nativeRole("toggleDevTools", "menu.toggleDevTools", {
    shortcutDisplayId: "developer.toggleDevTools"
  }),
  separator,
  // `Mod-+` is Zoom In's alias.
  command(applicationCommandIds.zoomIn, "menu.zoomIn", {
    nativeAccelerator: "primary",
    nativeKeyAlias: true
  }),
  command(applicationCommandIds.zoomOut, "menu.zoomOut", {
    nativeAccelerator: "primary"
  }),
  command(applicationCommandIds.resetZoom, "menu.actualSize", {
    nativeAccelerator: "primary"
  }),
  separator,
  nativeRole("togglefullscreen", "menu.toggleFullScreen", {
    shortcutDisplayId: "window.toggleFullscreen"
  })
], { mnemonic: "V" });

const assistMenu: ApplicationMenuTopLevelItem = submenu("menu.assist", [
  command(
    assistCommandIds.showLineEndingDistribution,
    "menu.assist.showLineEndingDistribution"
  ),
  command(
    assistCommandIds.openJapaneseMachineCheckDialog,
    "menu.assist.japaneseMachineCheck"
  ),
  command(
    assistCommandIds.insertParagraphIndent,
    "menu.assist.paragraphIndent.insert"
  ),
  command(
    assistCommandIds.removeParagraphIndent,
    "menu.assist.paragraphIndent.remove"
  ),
  separator,
  command(
    glossaryTabCommandIds.manageEntries,
    "menu.assist.manageGlossaryEntries"
  ),
  command(glossaryTabCommandIds.manageTags, "menu.assist.manageGlossaryTags")
], { mnemonic: "A" });

const macWindowMenu: ApplicationMenuTopLevelItem = submenu(
  "menu.window",
  [
    nativeRole("minimize", "menu.minimize"),
    nativeRole("zoom", "menu.zoom"),
    separator,
    nativeRole("front", "menu.bringAllToFront")
  ],
  { platforms: ["darwin"] }
);

const helpMenu: ApplicationMenuTopLevelItem = submenu(
  "menu.help",
  [
    command(workspaceCommandIds.showResumeHub, "menu.showResumeHub"),
    command(applicationCommandIds.openUsageTour, "menu.usageTour"),
    command(
      applicationCommandIds.openMarkdownCheatSheet,
      "menu.markdownCheatSheet"
    ),
    separator,
    command(applicationCommandIds.openAbout, "menu.aboutPergamum")
  ],
  { role: "help", mnemonic: "H" }
);

/** The platform-independent definition, platform overlays marked per item. */
export const applicationMenuModel: readonly ApplicationMenuTopLevelItem[] = [
  macApplicationMenu,
  fileMenu,
  editMenu,
  viewMenu,
  assistMenu,
  macWindowMenu,
  helpMenu
];

function collectNativeAcceleratorCommandIds(
  items: readonly ApplicationMenuItem[],
  into: Set<string>
): void {
  for (const item of items) {
    if (item.type === "submenu") {
      collectNativeAcceleratorCommandIds(item.items, into);
    } else if (
      item.type === "command" &&
      (item.nativeAccelerator ?? "none") !== "none"
    ) {
      into.add(item.commandId);
    }
  }
}

/**
 * The commands whose keys are registered as Electron native menu accelerators:
 * exactly the items that opted in with `nativeAccelerator`. This is the only
 * native-accelerator allowlist; the Renderer menu's shortcut labels do not use
 * it (presentation is separate, #693). Quit's fixed accelerator and the native
 * roles' are not customizable keys and are handled by the adapter itself.
 */
export const NATIVE_MENU_ACCELERATOR_COMMAND_IDS: readonly string[] = (() => {
  const ids = new Set<string>();

  collectNativeAcceleratorCommandIds(applicationMenuModel, ids);

  return [...ids];
})();

function isForPlatform(
  item: ApplicationMenuItem,
  platform: PergamumPlatform
): boolean {
  return item.platforms === undefined || item.platforms.includes(platform);
}

function resolveItems(
  items: readonly ApplicationMenuItem[],
  platform: PergamumPlatform
): ApplicationMenuItem[] {
  return items
    .filter((item) => isForPlatform(item, platform))
    .map((item) =>
      item.type === "submenu"
        ? { ...item, items: resolveItems(item.items, platform) }
        : item
    );
}

/**
 * The menu as one platform sees it: items whose `platforms` exclude it are
 * dropped (recursively). Pure; the model itself is never mutated.
 */
export function getApplicationMenuModel(
  platform: PergamumPlatform
): readonly ApplicationMenuTopLevelItem[] {
  return resolveItems(
    applicationMenuModel,
    platform
  ) as ApplicationMenuTopLevelItem[];
}
