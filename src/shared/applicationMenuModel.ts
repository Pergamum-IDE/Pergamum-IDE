/**
 * #662: the canonical Application Menu model.
 *
 * A declarative, Electron-free description of WHAT the application menu
 * contains: structure, command identity, i18n label keys and native-role
 * metadata. It is the single definition both menu surfaces are built from
 * (#661): the Electron native menu today (see `main/applicationMenuAdapter`),
 * and later the Renderer menu bar.
 *
 * What is deliberately NOT in here:
 *   - shortcut strings: accelerators come from the effective keybindings
 *     (`main/menuAccelerators`); the model only says how a command item uses
 *     them (`keybinding` / `keyAlias`)
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
 * How a command item uses the effective keybindings of its `commandId`.
 *   - `primary` (default): the item carries the command's primary key
 *   - `primaryUnlabeled`: the primary key is bound, but the visible item shows
 *     no shortcut label (#591: Electron localizes the comma key label as
 *     "Ctrl+カンマ" on Japanese Windows)
 *   - `none`: the item never carries a shortcut
 */
export type ApplicationMenuKeybinding = "primary" | "primaryUnlabeled" | "none";

interface ApplicationMenuItemBase {
  /** Omitted = every platform. */
  readonly platforms?: readonly PergamumPlatform[];
}

export interface ApplicationMenuCommandItem extends ApplicationMenuItemBase {
  readonly type: "command";
  /** Canonical identity; also the stable id used for enablement updates. */
  readonly commandId: ApplicationMenuCommandId;
  readonly label: ApplicationMenuLabel;
  readonly keybinding?: ApplicationMenuKeybinding;
  /**
   * The command's second and later catalog keys (F1, F12, `Mod-+`, ...) are
   * also active, without a second visible entry (#642).
   */
  readonly keyAlias?: true;
}

export interface ApplicationMenuNativeRoleItem extends ApplicationMenuItemBase {
  readonly type: "nativeRole";
  readonly role: NativeMenuRole;
  readonly label: ApplicationMenuLabel;
  /** Set when the renderer reports enablement for this item's command. */
  readonly commandId?: ApplicationMenuCommandId;
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
  extras: Pick<ApplicationMenuCommandItem, "keybinding" | "keyAlias" | "platforms"> = {}
): ApplicationMenuCommandItem {
  return { type: "command", commandId, label: { key }, ...extras };
}

function nativeRole(
  role: NativeMenuRole,
  key: TranslationKey,
  extras: Pick<
    ApplicationMenuNativeRoleItem,
    "commandId" | "platforms"
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
    keybinding: "none",
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
  command(applicationCommandIds.openProject, "menu.openProject"),
  command(applicationCommandIds.closeProject, "menu.closeProject"),
  separator,
  submenu("menu.file.import", [
    command(
      applicationCommandIds.openBulkTextImportDialog,
      "menu.file.import.bulkTextFiles"
    )
  ]),
  separator,
  command(editorCommandIds.newFile, "menu.newFile"),
  // #556: CommandOrControl+O was freed up for the Command Palette's
  // project-file-open mode (a renderer-level global shortcut). An Electron
  // menu accelerator would intercept the keystroke before the renderer ever
  // sees it (same mechanism removed for Reload in #552), so this item is
  // mouse/menu-only.
  command(editorCommandIds.openMarkdownDocument, "menu.openMarkdownFile", {
    keybinding: "none"
  }),
  command(editorCommandIds.close, "menu.closeCurrentTab"),
  command(editorCommandIds.saveDocument, "menu.save"),
  command(editorCommandIds.saveAll, "menu.saveAll"),
  // #587 Slice 5: F12 is the second catalog key (an alias, no second entry).
  command(editorCommandIds.saveAs, "menu.saveAs", { keyAlias: true }),
  separator,
  command(projectSettingsCommandIds.open, "menu.projectSettings"),
  // #646: the read-only Keyboard Shortcuts screen, right before Application
  // Settings. A menu entry only: it carries no accelerator.
  command(workspaceCommandIds.openKeyboardShortcuts, "menu.keyboardShortcuts"),
  // #591 follow-up: the key is bound but the item shows no shortcut label.
  command(
    workspaceCommandIds.openApplicationSettings,
    "menu.applicationSettings",
    { keybinding: "primaryUnlabeled" }
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
    "menu.edit.findInProject"
  ),
  command(
    searchSelectionShortcutCommandIds.openProjectReplaceFromSelection,
    "menu.edit.replaceInProject"
  )
], { mnemonic: "E" });

const viewMenu: ApplicationMenuTopLevelItem = submenu("menu.view", [
  // #554: Mod+P is the primary Command Palette / launcher shortcut; F1 is its
  // alias (no second visible entry).
  command(commandPaletteCommandIds.open, "menu.commandPalette", {
    keyAlias: true
  }),
  separator,
  nativeRole("toggleDevTools", "menu.toggleDevTools"),
  separator,
  // `Mod-+` is Zoom In's alias.
  command(applicationCommandIds.zoomIn, "menu.zoomIn", { keyAlias: true }),
  command(applicationCommandIds.zoomOut, "menu.zoomOut"),
  command(applicationCommandIds.resetZoom, "menu.actualSize"),
  separator,
  nativeRole("togglefullscreen", "menu.toggleFullScreen")
], { mnemonic: "V" });

const assistMenu: ApplicationMenuTopLevelItem = submenu("menu.assist", [
  command(
    assistCommandIds.showLineEndingDistribution,
    "menu.assist.showLineEndingDistribution"
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
