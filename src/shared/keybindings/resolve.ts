/**
 * #639: resolves the default catalog for one platform.
 *
 * Default keybindings only. There is no user `keybindings.json` overlay yet;
 * a future overlay would be applied on top of this result.
 */

import { keybindingCommands } from "./commands";
import { defaultKeybindings } from "./defaults";
import { reservedKeybindings } from "./reserved";
import {
  pergamumPlatforms,
  type DefaultKeybinding,
  type KeybindingCatalog,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "./types";

export const defaultKeybindingCatalog: KeybindingCatalog = {
  commands: keybindingCommands,
  defaults: defaultKeybindings,
  reserved: reservedKeybindings
};

export function isPergamumPlatform(value: string): value is PergamumPlatform {
  return (pergamumPlatforms as readonly string[]).includes(value);
}

/** undefined = use the common key; null = unassigned on this platform. */
function keyForPlatform(
  entry: DefaultKeybinding,
  platform: PergamumPlatform
): string | null {
  const override =
    platform === "darwin"
      ? entry.mac
      : platform === "win32"
        ? entry.win
        : entry.linux;
  return override === undefined ? entry.key : override;
}

/**
 * One row per default entry. A catalog command without any default entry
 * yields a single row with `key: null`. Entries that reference an unknown
 * command are skipped here (validation reports them).
 */
export function resolveDefaultKeybindings(
  platform: PergamumPlatform,
  catalog: KeybindingCatalog = defaultKeybindingCatalog
): ResolvedKeybinding[] {
  if (!isPergamumPlatform(platform)) {
    throw new RangeError(`Unknown platform: ${String(platform)}`);
  }

  const commandsById = new Map(
    catalog.commands.map((command) => [command.id, command])
  );
  const resolved: ResolvedKeybinding[] = [];
  const commandsWithEntry = new Set<string>();

  for (const entry of catalog.defaults) {
    const command = commandsById.get(entry.command);
    if (command === undefined) {
      continue;
    }
    commandsWithEntry.add(command.id);
    resolved.push(toResolved(command, keyForPlatform(entry, platform), entry));
  }

  for (const command of catalog.commands) {
    if (!commandsWithEntry.has(command.id)) {
      resolved.push(toResolved(command, null));
    }
  }

  return resolved;
}

function toResolved(
  command: KeybindingCatalog["commands"][number],
  key: string | null,
  entry?: DefaultKeybinding
): ResolvedKeybinding {
  return {
    command: command.id,
    key,
    title: command.title,
    category: command.category,
    scope: command.scope,
    executionHost: command.executionHost,
    source: command.source,
    readonly: command.readonly,
    readonlyReason: command.readonlyReason,
    when: entry?.when ?? command.when,
    description: command.description,
    handlerStatus: command.handlerStatus
  };
}
