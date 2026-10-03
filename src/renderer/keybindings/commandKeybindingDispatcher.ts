/**
 * #693: the generic Renderer-side executor for user-assignable app-scope
 * commands.
 *
 * Who runs a key, exclusively:
 *   - native accelerator  -> Electron's menu (the command opted in with
 *                            `nativeAccelerator` in the menu model)
 *   - dedicated shortcut  -> a renderer listener / pane handler
 *                            (`rendererShortcutCommandIds`)
 *   - editor-scope        -> the CodeMirror keymap
 *   - everything else that is a registered, user-assignable app-scope command
 *                         -> HERE: the effective key is matched and the command
 *                            runs through the Command Registry.
 *
 * Without this, a command such as Japanese Style Check could show its key in
 * the Renderer menu (presentation) yet never run, because it is deliberately not
 * a native accelerator. Nothing here knows any particular command.
 */

import { useEffect, useRef } from "react";
import { getApplicationMenuModel, NATIVE_MENU_ACCELERATOR_COMMAND_IDS } from "../../shared/applicationMenuModel";
import type {
  PergamumPlatform,
  ResolvedKeybinding
} from "../../shared/keybindings";
import {
  isEditableTextInputTarget,
  isModalOrDialogActive
} from "../editorTabShortcuts";
import { getRuntimePlatform } from "../platformModifier";
import {
  eventMatchesCatalogKey,
  type CatalogKeyEvent
} from "./catalogKeyMatch";
import { getEffectiveKeybindingRows } from "./effectiveKeybindingStore";
import { RENDERER_SHORTCUT_COMMAND_IDS } from "./rendererShortcuts";

/**
 * The bindings this dispatcher owns: effective, bound, user-assignable
 * (app scope, Pergamum source, not readonly) commands that are registered in
 * the Command Registry and are not already run by a native accelerator or a
 * dedicated renderer shortcut.
 */
export function resolveCommandKeybindingDispatchBindings(
  rows: readonly ResolvedKeybinding[]
): ResolvedKeybinding[] {
  const native = new Set<string>(NATIVE_MENU_ACCELERATOR_COMMAND_IDS);
  const dedicated = new Set<string>(RENDERER_SHORTCUT_COMMAND_IDS);

  return rows.filter(
    (binding) =>
      binding.scope === "app" &&
      binding.source === "pergamum" &&
      !binding.readonly &&
      binding.key !== null &&
      binding.handlerStatus === "registered" &&
      !native.has(binding.command) &&
      !dedicated.has(binding.command)
  );
}

const bindingsByRows = new WeakMap<
  readonly ResolvedKeybinding[],
  ResolvedKeybinding[]
>();

function bindingsFor(rows: readonly ResolvedKeybinding[]): ResolvedKeybinding[] {
  let bindings = bindingsByRows.get(rows);

  if (bindings === undefined) {
    bindings = resolveCommandKeybindingDispatchBindings(rows);
    bindingsByRows.set(rows, bindings);
  }

  return bindings;
}

/** The command whose effective key `event` is, or `null`. */
export function matchCommandKeybinding(
  event: CatalogKeyEvent,
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[] = getEffectiveKeybindingRows(platform)
): string | null {
  for (const binding of bindingsFor(rows)) {
    if (eventMatchesCatalogKey(event, binding.key as string, platform)) {
      return binding.command;
    }
  }

  return null;
}

/**
 * Alt + a menu mnemonic letter opens that menu (Windows / Linux Renderer menu
 * bar). The menu has priority: such a key is never a shortcut here, whatever
 * is bound to it.
 */
export function isApplicationMenuMnemonicKey(
  event: Pick<
    CatalogKeyEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
  platform: PergamumPlatform
): boolean {
  if (
    platform === "darwin" ||
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return false;
  }

  const letter = event.key.toLocaleUpperCase("en-US");

  return getApplicationMenuModel(platform).some(
    (menu) => menu.mnemonic !== undefined && menu.mnemonic === letter
  );
}

export interface CommandKeybindingKeyEvent extends CatalogKeyEvent {
  readonly defaultPrevented: boolean;
  readonly keyCode?: number;
  readonly target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface CommandKeybindingDispatchDeps {
  readonly platform?: PergamumPlatform;
  readonly rows?: readonly ResolvedKeybinding[];
  /** Command Registry enablement (`when` and `isEnabled`) for the command. */
  readonly isEnabled: (commandId: string) => boolean;
  /** Runs the command through the Command Registry. */
  readonly execute: (commandId: string) => void;
}

/**
 * Handles one keydown. Returns whether it ran (and consumed) a command.
 * Silent - the key is left alone - for: an IME composition, an event that
 * something else already handled, Application Menu mnemonics, a text field or
 * a modal dialog (like the other global shortcuts), a key that matches no
 * dispatched command, and a command the registry says is disabled.
 */
export function handleCommandKeybindingKeyDown(
  event: CommandKeybindingKeyEvent,
  deps: CommandKeybindingDispatchDeps
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }

  const platform = deps.platform ?? getRuntimePlatform();

  if (isApplicationMenuMnemonicKey(event, platform)) {
    return false;
  }

  const commandId = matchCommandKeybinding(event, platform, deps.rows);

  if (commandId === null) {
    return false;
  }

  if (
    isEditableTextInputTarget(event.target) ||
    isModalOrDialogActive(event.target)
  ) {
    return false;
  }

  if (!deps.isEnabled(commandId)) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  deps.execute(commandId);

  return true;
}

/**
 * Attaches ONE capture-phase window keydown listener. The latest `deps` are
 * read through a ref, so callers may pass fresh closures every render. The
 * effective rows are read at event time: a rebind / unbind applies at once.
 */
export function useCommandKeybindingDispatcher(
  deps: CommandKeybindingDispatchDeps
): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      handleCommandKeybindingKeyDown(event, depsRef.current);
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);
}
