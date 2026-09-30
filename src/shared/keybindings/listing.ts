/**
 * #640: pure listing helpers over the keybinding catalog, shaped for a future
 * Keyboard Shortcuts UI. Read-only; nothing here executes commands.
 */

import { resolveDefaultKeybindings, defaultKeybindingCatalog } from "./resolve";
import type {
  CommandHandlerStatus,
  CommandMetadata,
  KeybindingCatalog,
  KeybindingExecutionHost,
  KeybindingReadonlyReason,
  KeybindingScope,
  KeybindingSource,
  PergamumPlatform,
  ResolvedKeybinding
} from "./types";

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Every command's metadata in a deterministic order: category, then title,
 * then id (plain code-unit comparison, locale independent).
 */
export function listCommandMetadata(
  catalog: KeybindingCatalog = defaultKeybindingCatalog
): CommandMetadata[] {
  return [...catalog.commands].sort(
    (a, b) =>
      compareText(a.category, b.category) ||
      compareText(a.title, b.title) ||
      compareText(a.id, b.id)
  );
}

/**
 * One item per command. A command with several default keys has several
 * `bindings`; a command with no key on the platform has `bindings: []` and
 * `key: null`. `key` is the first (primary) binding.
 */
export interface KeyboardShortcutListItem {
  readonly commandId: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly scope: KeybindingScope;
  readonly executionHost: KeybindingExecutionHost;
  readonly source: KeybindingSource;
  readonly readonly: boolean;
  readonly readonlyReason: KeybindingReadonlyReason | null;
  readonly handlerStatus: CommandHandlerStatus;
  readonly when: string | null;
  readonly platform: PergamumPlatform;
  readonly key: string | null;
  readonly bindings: readonly ResolvedKeybinding[];
}

export function listResolvedKeyboardShortcutItems(
  platform: PergamumPlatform,
  catalog: KeybindingCatalog = defaultKeybindingCatalog
): KeyboardShortcutListItem[] {
  const bindingsByCommand = new Map<string, ResolvedKeybinding[]>();
  for (const binding of resolveDefaultKeybindings(platform, catalog)) {
    if (binding.key === null) {
      continue;
    }
    const list = bindingsByCommand.get(binding.command) ?? [];
    list.push(binding);
    bindingsByCommand.set(binding.command, list);
  }

  return listCommandMetadata(catalog).map((command) => {
    const bindings = bindingsByCommand.get(command.id) ?? [];
    return {
      commandId: command.id,
      title: command.title,
      category: command.category,
      description: command.description,
      scope: command.scope,
      executionHost: command.executionHost,
      source: command.source,
      readonly: command.readonly,
      readonlyReason: command.readonlyReason,
      handlerStatus: command.handlerStatus,
      when: command.when,
      platform,
      key: bindings[0]?.key ?? null,
      bindings
    };
  });
}
