/**
 * #718 Slice 2: Generic command shortcut resolver and tooltip formatting.
 *
 * Resolves effective primary keybinding labels from the runtime keybinding store
 * (reflecting user overrides, explicit unbinds, and platform formatting),
 * and formats command-backed tooltips without polluting accessible names.
 */

import React, { useCallback, useSyncExternalStore } from "react";
import {
  formatKeybindingLabel,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../shared/keybindings";
import {
  getEffectiveKeybindingRows,
  getEffectiveKeybindingsRevision,
  subscribeEffectiveKeybindings
} from "./keybindings/effectiveKeybindingStore";
import { getRuntimePlatform } from "./platformModifier";

export type CommandShortcutResolver = (
  commandId: string | null | undefined
) => string | undefined;

/**
 * Returns true if a React dispatcher is currently active (i.e. inside a component render).
 * Prevents "Invalid hook call" warnings when components are invoked directly as plain functions in tests.
 */
function hasReactRenderContext(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    return Boolean(internals?.ReactCurrentDispatcher?.current);
  } catch {
    return false;
  }
}

/**
 * Returns the primary (first bound) key of a command in catalog order,
 * or undefined if unbound / not found.
 */
export function primaryKey(
  rows: readonly ResolvedKeybinding[],
  commandId: string
): string | undefined {
  for (const binding of rows) {
    if (binding.command === commandId && binding.key !== null) {
      return binding.key;
    }
  }

  return undefined;
}

/**
 * Creates a pure resolver that returns the formatted primary shortcut label
 * for a commandId, or undefined if unbound or not found.
 */
export function createCommandShortcutResolver(
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[]
): CommandShortcutResolver {
  return (commandId) => {
    if (!commandId) {
      return undefined;
    }
    const key = primaryKey(rows, commandId);

    return key === undefined ? undefined : formatKeybindingLabel(key, platform);
  };
}

/**
 * React hook: returns a resolver bound to the live effective-keybinding store.
 * The returned resolver identity updates when the store revision changes,
 * driving live UI re-renders on rebind / unbind.
 */
export function useCommandShortcutResolver(): CommandShortcutResolver {
  if (!hasReactRenderContext()) {
    // When invoked outside a React render context (e.g. legacy component
    // unit tests calling `ActivityBar(...)` directly as a plain function),
    // fall back to reading the effective keybinding rows synchronously.
    const platform = getRuntimePlatform();

    return createCommandShortcutResolver(
      platform,
      getEffectiveKeybindingRows(platform)
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const revision = useSyncExternalStore(
    subscribeEffectiveKeybindings,
    getEffectiveKeybindingsRevision,
    getEffectiveKeybindingsRevision
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useCallback(
    (commandId) => {
      const platform = getRuntimePlatform();

      return createCommandShortcutResolver(
        platform,
        getEffectiveKeybindingRows(platform)
      )(commandId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision]
  );
}

/**
 * Pure helper: appends a formatted shortcut to a base tooltip label.
 *
 * Appends the shortcut in parentheses when present, or returns baseLabel as-is
 * when shortcut is undefined or empty. Never renders empty parentheses `()`.
 */
export function formatCommandTooltip(
  baseLabel: string,
  shortcut: string | undefined
): string {
  if (!shortcut || shortcut.trim() === "") {
    return baseLabel;
  }

  return `${baseLabel} (${shortcut})`;
}
