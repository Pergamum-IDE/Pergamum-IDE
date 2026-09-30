/**
 * #643: renderer window-listener / pane shortcuts, derived from the shared
 * keybinding catalog.
 *
 * Covers the shortcuts that are neither Electron menu accelerators (#642) nor
 * CodeMirror keymaps (#641): the global Command Palette / pane-toggle /
 * preview / image / syntax-checker listeners, tab switching, Find next /
 * previous (F3), and the File Explorer / tab-bar local keydown handlers.
 *
 * Execution stays where it was; only WHICH key triggers a command comes from
 * the catalog. UI-internal keys (dialog / listbox / popover / palette
 * candidate movement, reorder arrows, button activation) are not catalog
 * commands and are not handled here.
 */

import {
  resolveDefaultKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../shared/keybindings";
import { getRuntimePlatform } from "../platformModifier";
import {
  eventMatchesCatalogKey,
  type CatalogKeyEvent
} from "./catalogKeyMatch";

/** Command ids of the renderer-side shortcut families. */
export const rendererShortcutCommandIds = {
  commandPaletteFile: "workbench.commandPalette.file.open",
  commandPaletteHeading: "workbench.commandPalette.heading.open",
  commandPaletteProjectSearch: "workbench.commandPalette.projectSearch.open",
  commandPaletteGlossary: "workbench.commandPalette.glossary.open",
  commandPaletteLine: "workbench.commandPalette.line.open",
  toggleFiles: "workspace.files.toggle",
  toggleGlossary: "workspace.glossary.toggle",
  toggleDocumentMap: "workspace.documentMap.toggle",
  toggleDocumentMetrics: "workspace.documentMetrics.toggle",
  previewToggle: "editor.preview.toggle",
  imageInsert: "editor.image.insert",
  toggleSyntaxChecker: "editor.markdown.toggleSyntaxChecker",
  tabsPrevious: "workspace.tabs.previous",
  tabsNext: "workspace.tabs.next",
  findNext: "editor.find.next",
  findPrevious: "editor.find.previous",
  filesRename: "workspace.files.rename",
  filesCopy: "workspace.files.copy",
  filesCut: "workspace.files.cut",
  filesPaste: "workspace.files.paste",
  filesDelete: "workspace.files.delete"
} as const;

/**
 * Editor-scope commands that are nevertheless handled by a renderer window
 * listener (outside the CodeMirror keymap): F3 / Shift+F3 navigation, and the
 * preview / image / syntax-checker shortcuts that must also work when focus
 * is not in the editor. (Image and syntax checker are ALSO in the CodeMirror
 * keymap for editor focus; the keymap consumes the event first, so the window
 * listener never double-fires.)
 */
export const RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS: readonly string[] = [
  rendererShortcutCommandIds.findNext,
  rendererShortcutCommandIds.findPrevious,
  rendererShortcutCommandIds.previewToggle,
  rendererShortcutCommandIds.imageInsert,
  rendererShortcutCommandIds.toggleSyntaxChecker
];

/** Every renderer-side shortcut command. */
export const RENDERER_SHORTCUT_COMMAND_IDS: readonly string[] = Object.values(
  rendererShortcutCommandIds
);

/**
 * Customizable renderer-listener bindings that have a key on `platform`.
 * Only app / pane commands and the explicit window-listener editor commands;
 * menu-only app commands, readonly (nativeRole / standard) rows and
 * `key: null` rows are excluded.
 */
export function resolveRendererShortcutKeybindings(
  platform: PergamumPlatform
): ResolvedKeybinding[] {
  const listed = new Set(RENDERER_SHORTCUT_COMMAND_IDS);
  const editorExceptions = new Set(RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS);
  return resolveDefaultKeybindings(platform).filter(
    (binding) =>
      listed.has(binding.command) &&
      binding.source === "pergamum" &&
      !binding.readonly &&
      binding.key !== null &&
      (binding.scope === "app" ||
        binding.scope === "pane" ||
        (binding.scope === "editor" && editorExceptions.has(binding.command)))
  );
}

/** Serializable description of one renderer shortcut binding. */
export interface RendererShortcutDescriptor {
  readonly platform: PergamumPlatform;
  readonly commandId: string;
  readonly key: string;
  readonly scope: ResolvedKeybinding["scope"];
  readonly source: ResolvedKeybinding["source"];
  readonly when: string | null;
  readonly handlerStatus: ResolvedKeybinding["handlerStatus"];
}

export function createRendererShortcutBindings(
  platform: PergamumPlatform
): RendererShortcutDescriptor[] {
  return resolveRendererShortcutKeybindings(platform).map((binding) => ({
    platform,
    commandId: binding.command,
    key: binding.key as string,
    scope: binding.scope,
    source: binding.source,
    when: binding.when,
    handlerStatus: binding.handlerStatus
  }));
}

const keysByPlatform = new Map<PergamumPlatform, Map<string, string[]>>();

function keysFor(platform: PergamumPlatform, commandId: string): string[] {
  let byCommand = keysByPlatform.get(platform);
  if (byCommand === undefined) {
    byCommand = new Map();
    for (const binding of resolveRendererShortcutKeybindings(platform)) {
      const keys = byCommand.get(binding.command) ?? [];
      keys.push(binding.key as string);
      byCommand.set(binding.command, keys);
    }
    keysByPlatform.set(platform, byCommand);
  }
  return byCommand.get(commandId) ?? [];
}

/**
 * Does `event` trigger renderer shortcut `commandId` on `platform`?
 *
 * Preserves the listeners' long-standing semantics: letters match on the
 * logical `event.key` (so non-QWERTY layouts behave as before); Mod is exactly
 * Cmd on darwin / Ctrl elsewhere (never Ctrl+Cmd); AltGraph is not Ctrl+Alt;
 * symbol keys such as `#` `@` `:` `%` match on the character regardless of
 * Shift / Alt; every other binding requires its exact modifiers (so `Delete`
 * does not match Shift+Delete); an IME composition never matches; a platform
 * where the catalog key is `null` has no binding at all.
 */
export function matchRendererShortcut(
  event: CatalogKeyEvent,
  commandId: string,
  platform: PergamumPlatform = getRuntimePlatform()
): boolean {
  if (event.isComposing) {
    return false;
  }
  return keysFor(platform, commandId).some((key) =>
    eventMatchesCatalogKey(event, key, platform, {
      keyBasis: "logical",
      tolerateSymbolModifiers: true
    })
  );
}
