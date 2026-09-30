/**
 * #640: pure listing helpers over the keybinding catalog, shaped for a future
 * Keyboard Shortcuts UI. Read-only; nothing here executes commands.
 */

import { formatKeybindingLabel } from "./format";
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

/**
 * One row per binding for the Keyboard Shortcuts screen (#646): a command with
 * several keys (Mod-p and F1) yields several rows; a command with no key on
 * the platform yields one `key: null` row. Commands with no runtime handler
 * (`notYetRegistered`) are left out, so nothing listed is a no-op.
 */
export interface KeyboardShortcutRow {
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
  /** Canonical catalog notation, or null when unassigned. */
  readonly key: string | null;
  /** Platform-aware label (`Ctrl+S` / `Cmd+S`), or null when unassigned. */
  readonly keyLabel: string | null;
  /**
   * #647: a stable id for this binding row (command + origin + key), safe to
   * use as a React key and to target an edit after filtering / sorting.
   */
  readonly rowId: string;
  /** Where the binding comes from: the catalog default, or keybindings.json. */
  readonly origin: "default" | "user";
  /**
   * #647: may the user change / unbind / reset this row? Pergamum commands
   * only: never a nativeRole / standard / readonly command.
   */
  readonly editable: boolean;
  /** #647: is there something to reset (a user binding, or an unbound default)? */
  readonly canReset: boolean;
  /** On an unassigned row standing for an unbound default: that key. */
  readonly defaultKey: string | null;
  readonly defaultKeyLabel: string | null;
  /**
   * #648: the binding's origin for display, separate from `source`:
   * `default` (catalog key), `user` (keybindings.json) or `unbound` (a default
   * removed by the user). `null` for a command that never had a key.
   */
  readonly originKind: KeyboardShortcutOriginKind | null;
}

export type KeyboardShortcutOriginKind = "default" | "user" | "unbound";

/**
 * Display rows from resolved keybindings (the effective set), sorted by
 * category, title, commandId, then the order of the keys within a command.
 */
export function listKeyboardShortcutRows(
  rows: readonly ResolvedKeybinding[],
  platform: PergamumPlatform
): KeyboardShortcutRow[] {
  return rows
    .map((row, position) => ({ row, position }))
    .filter(({ row }) => row.handlerStatus !== "notYetRegistered")
    .sort(
      (a, b) =>
        compareText(a.row.category, b.row.category) ||
        compareText(a.row.title, b.row.title) ||
        compareText(a.row.command, b.row.command) ||
        a.position - b.position
    )
    .map(({ row }) => {
      const origin = row.origin ?? "default";
      const defaultKey = row.defaultKey ?? null;
      const editable =
        row.source === "pergamum" &&
        !row.readonly &&
        row.handlerStatus !== "notYetRegistered";
      return {
      commandId: row.command,
      title: row.title,
      category: row.category,
      description: row.description,
      scope: row.scope,
      executionHost: row.executionHost,
      source: row.source,
      readonly: row.readonly,
      readonlyReason: row.readonlyReason,
      handlerStatus: row.handlerStatus,
      when: row.when,
      key: row.key,
      keyLabel: row.key === null ? null : formatKeybindingLabel(row.key, platform),
      rowId: [
        row.command,
        origin,
        row.key ?? `unassigned:${defaultKey ?? ""}`
      ].join(""),
      origin,
      editable,
      canReset: editable && (origin === "user" || defaultKey !== null),
      defaultKey,
      defaultKeyLabel:
        defaultKey === null ? null : formatKeybindingLabel(defaultKey, platform),
      originKind:
        row.key === null
          ? defaultKey === null
            ? null
            : "unbound"
          : origin
      };
    });
}

/**
 * #648: one command with all of its bindings. Display metadata comes from the
 * command (every row of one command carries the same scope / source / readonly
 * state), so it is taken from the first row.
 */
export interface KeyboardShortcutCommandGroup {
  readonly commandId: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly scope: KeybindingScope;
  readonly source: KeybindingSource;
  readonly readonly: boolean;
  readonly readonlyReason: KeybindingReadonlyReason | null;
  readonly handlerStatus: CommandHandlerStatus;
  readonly when: string | null;
  readonly editable: boolean;
  /** May the user add a shortcut to this command? Same rule as `editable`. */
  readonly canAdd: boolean;
  readonly bindings: readonly KeyboardShortcutRow[];
}

/** Groups rows by command; group and row order follow the input order. */
export function groupKeyboardShortcutRows(
  rows: readonly KeyboardShortcutRow[]
): KeyboardShortcutCommandGroup[] {
  const groups = new Map<string, KeyboardShortcutRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.commandId);
    if (bucket === undefined) {
      groups.set(row.commandId, [row]);
    } else {
      bucket.push(row);
    }
  }
  return [...groups.values()].map((bindings) => {
    const first = bindings[0] as KeyboardShortcutRow;
    return {
      commandId: first.commandId,
      title: first.title,
      category: first.category,
      description: first.description,
      scope: first.scope,
      source: first.source,
      readonly: first.readonly,
      readonlyReason: first.readonlyReason,
      handlerStatus: first.handlerStatus,
      when: first.when,
      editable: first.editable,
      canAdd: first.editable,
      bindings
    };
  });
}

/**
 * #649: a group the Keyboard Shortcuts UI shows but cannot assign / edit
 * (nativeRole, standard behavior, readonly, ...): the ReadOnly groups, hidden
 * unless "Show ReadOnly" is on. Commands with no runtime handler
 * (`notYetRegistered`) never reach a group at all. The single definition is
 * the group's `canAdd`.
 */
export function isReadonlyCommandGroup(group: KeyboardShortcutCommandGroup): boolean {
  return !group.canAdd;
}

/** #649: a user change on this binding (a user-added key, or an unbound default). */
export function isModifiedBinding(row: KeyboardShortcutRow): boolean {
  return row.originKind === "user" || row.originKind === "unbound";
}

/** #649: does the command carry any user change? (Derived; not an origin.) */
export function isModifiedCommandGroup(group: KeyboardShortcutCommandGroup): boolean {
  return group.bindings.some(isModifiedBinding);
}

/**
 * #649: the command has no effective key at all. An unbound default next to
 * another live key does NOT make a command unassigned.
 */
export function isUnassignedCommandGroup(group: KeyboardShortcutCommandGroup): boolean {
  return group.bindings.every((row) => row.key === null);
}
