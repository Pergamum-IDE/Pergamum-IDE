/**
 * #664: connects the Renderer application menu to what Pergamum already has.
 * Nothing here is a second implementation:
 *
 *   click (command)      -> the same renderer-side execution the native menu's
 *                           IPC command uses (CommandRegistry, source
 *                           "applicationMenu"); Quit therefore keeps its
 *                           dirty-document preflight
 *   click (native role)  -> Electron runs the role (allowlisted IPC), or the
 *                           existing full screen API
 *   shortcut label       -> the effective keybindings, selected with the same
 *                           rule as the native accelerators, formatted by the
 *                           shared formatter
 *   disabled             -> CommandRegistry.isEnabledForContext, the same
 *                           evaluation that is pushed to the native menu
 */

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import {
  isRendererMenuNativeRole,
  type RendererMenuNativeRole
} from "../shared/api";
import {
  applicationMenuCommandIds,
  noArgumentMenuCommandId
} from "../shared/commandIds";
import type { CommandContext } from "../shared/commandEnablement";
import type { CommandRegistry } from "../shared/commandRegistry";
import {
  formatKeybindingLabel,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../shared/keybindings";
import {
  MENU_ACCELERATOR_COMMAND_IDS,
  selectMenuKeybindingKeys,
  selectNativeRoleKey
} from "../shared/menuKeybindingSelection";
import type {
  RendererMenuInvokeTarget,
  RendererMenuShortcutRequest
} from "./applicationMenuProjection";
import {
  getEffectiveKeybindingRows,
  getEffectiveKeybindingsRevision,
  subscribeEffectiveKeybindings
} from "./keybindings/effectiveKeybindingStore";
import { getRuntimePlatform } from "./platformModifier";

type EnablementRegistry = Pick<CommandRegistry, "isEnabledForContext">;

/**
 * Enablement of every application-menu command for `context`. The one
 * calculation behind both the native menu push (#252) and the Renderer menu.
 */
export function computeApplicationMenuEnablement(
  registry: EnablementRegistry,
  context: CommandContext
): Record<string, boolean> {
  const enablement: Record<string, boolean> = {};

  for (const commandId of applicationMenuCommandIds) {
    enablement[commandId] = registry.isEnabledForContext(
      noArgumentMenuCommandId(commandId),
      context
    );
  }

  return enablement;
}

/**
 * Disabled state of one menu command. A command the registry does not know is
 * disabled, never silently enabled (the registry throws for unknown ids).
 */
export function isApplicationMenuCommandDisabled(
  registry: EnablementRegistry,
  context: CommandContext,
  commandId: string
): boolean {
  try {
    return !registry.isEnabledForContext(
      commandId as Parameters<EnablementRegistry["isEnabledForContext"]>[0],
      context
    );
  } catch {
    return true;
  }
}

/**
 * The shortcut label for a menu item, from the effective rows (so a user
 * override shows, and an unbound command shows nothing - never a default).
 */
export function createMenuShortcutLabelResolver(
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[]
): (request: RendererMenuShortcutRequest) => string | undefined {
  const customizable = selectMenuKeybindingKeys(
    rows,
    MENU_ACCELERATOR_COMMAND_IDS
  );

  return (request) => {
    const key =
      request.kind === "customizable"
        ? customizable.get(request.id)?.[0]
        : selectNativeRoleKey(rows, request.id);

    return key === undefined ? undefined : formatKeybindingLabel(key, platform);
  };
}

export interface ApplicationMenuInvokerDeps {
  /** The shared renderer-side execution of an application-menu command. */
  readonly executeCommand: (commandId: string) => void;
  readonly isCommandDisabled: (commandId: string) => boolean;
  readonly invokeNativeRole: (role: RendererMenuNativeRole) => unknown;
  readonly toggleFullscreen: () => unknown;
}

export function createApplicationMenuInvoker(
  deps: ApplicationMenuInvokerDeps
): (target: RendererMenuInvokeTarget) => void {
  return (target) => {
    if (target.type === "command") {
      deps.executeCommand(target.commandId);
      return;
    }

    // A native role with a command id is enabled by that command (the safety
    // net for a menu that was open while the state changed).
    if (
      target.commandId !== undefined &&
      deps.isCommandDisabled(target.commandId)
    ) {
      return;
    }

    if (target.role === "togglefullscreen") {
      void deps.toggleFullscreen();
      return;
    }

    if (isRendererMenuNativeRole(target.role)) {
      void deps.invokeNativeRole(target.role);
    }
    // Any other role (macOS-only) never reaches the Renderer menu.
  };
}

export interface ApplicationMenuIntegration {
  readonly onInvoke: (target: RendererMenuInvokeTarget) => void;
  readonly getShortcutLabel: (
    request: RendererMenuShortcutRequest
  ) => string | undefined;
  readonly isDisabled: (commandId: string) => boolean;
}

export function useApplicationMenuIntegration(input: {
  readonly commandRegistry: CommandRegistry;
  readonly commandContext: CommandContext;
  readonly executeMenuCommand: (commandId: string) => void;
}): ApplicationMenuIntegration {
  const { commandRegistry, commandContext } = input;
  const platform = getRuntimePlatform();
  // Live: a Keyboard Shortcuts save or an edit of keybindings.json replaces the
  // store, which re-renders the menu even while it is open.
  const keybindingsRevision = useSyncExternalStore(
    subscribeEffectiveKeybindings,
    getEffectiveKeybindingsRevision
  );
  const getShortcutLabel = useMemo(
    () =>
      createMenuShortcutLabelResolver(
        platform,
        getEffectiveKeybindingRows(platform)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [platform, keybindingsRevision]
  );
  const isDisabled = useCallback(
    (commandId: string) =>
      isApplicationMenuCommandDisabled(commandRegistry, commandContext, commandId),
    [commandRegistry, commandContext]
  );
  const executeRef = useRef(input.executeMenuCommand);
  executeRef.current = input.executeMenuCommand;
  const isDisabledRef = useRef(isDisabled);
  isDisabledRef.current = isDisabled;
  const onInvoke = useMemo(
    () =>
      createApplicationMenuInvoker({
        executeCommand: (commandId) => executeRef.current(commandId),
        isCommandDisabled: (commandId) => isDisabledRef.current(commandId),
        invokeNativeRole: (role) =>
          window.pergamum.applicationMenu.invokeNativeRole(role),
        toggleFullscreen: () => window.pergamum.window.toggleFullscreen()
      }),
    []
  );

  return { onInvoke, getShortcutLabel, isDisabled };
}
