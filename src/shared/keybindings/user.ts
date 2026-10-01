/**
 * #645: user keybindings (`keybindings.json`) - parsing, serialization, and
 * the overlay that turns the default catalog + user entries into the
 * effective keybindings.
 *
 * File format: a VS Code-like JSON array subset.
 *
 *   [
 *     { "key": "Mod-Alt-f", "command": "editor.find.replace.open" },
 *     { "key": "Mod-h", "command": "-editor.find.replace.open" }
 *   ]
 *
 * - `key`: canonical catalog notation. A single uppercase letter is accepted
 *   and lowercased ("Mod-Alt-F" -> "Mod-Alt-f"); nothing else is loosened.
 * - `command`: a command id; a leading `-` makes the entry an UNBIND of that
 *   key for that command.
 * - `when`: display metadata only (no expression engine). It must equal the
 *   command's own `when` (or a default row's); anything else is rejected.
 * - Unknown fields are ignored with a warning (and dropped on re-save).
 *
 * Overlay (deterministic, VS Code style): defaults for the platform -> all
 * unbinds (file order) -> positive entries (file order). A positive entry
 * ALWAYS adds a binding; a default binding is removed only by an unbind entry.
 * (Changing a default is therefore "unbind the old key + add the new one".)
 * An unbound default stays in the effective rows as an unassigned row that
 * remembers its `defaultKey`, so it can be restored. An entry that is invalid,
 * targets a readonly / nativeRole / standard command, uses a reserved key
 * (reusing the #644 validation), or collides with another binding in the same
 * scope is ignored with a diagnostic; the defaults stay in effect. Diagnostics
 * carry the entry's index in the file, and never include file contents or
 * paths.
 */

import {
  isValidKeybindingKey,
  toCodeMirrorKey
} from "./format";
import { defaultKeybindingCatalog, resolveDefaultKeybindings } from "./resolve";
import { reservedUseDiagnostics } from "./validate";
import type {
  KeybindingCatalog,
  KeybindingCommand,
  KeybindingDiagnostic,
  PergamumPlatform,
  ResolvedKeybinding
} from "./types";

export interface UserKeybindingEntry {
  readonly key: string;
  /** A command id, or `-<command id>` to unbind. */
  readonly command: string;
  readonly when?: string;
}

export interface ParsedUserKeybindings {
  readonly entries: UserKeybindingEntry[];
  /** For each entry, its index in the file (skipped items leave gaps). */
  readonly sourceIndices: number[];
  readonly diagnostics: KeybindingDiagnostic[];
}

export interface EffectiveKeybindingResult {
  readonly keybindings: ResolvedKeybinding[];
  readonly diagnostics: KeybindingDiagnostic[];
}

const knownFields: ReadonlySet<string> = new Set(["key", "command", "when"]);

/** Lowercases a trailing single uppercase letter ("Mod-H" -> "Mod-h"). */
export function normalizeUserKeyNotation(key: string): string {
  if (/^[A-Z]$/.test(key)) {
    return key.toLowerCase();
  }
  return /-[A-Z]$/.test(key)
    ? `${key.slice(0, -1)}${key.slice(-1).toLowerCase()}`
    : key;
}

/**
 * Best effort: the position of a JSON syntax error, taken from the engine's
 * message only as numbers (never its text, which can quote the file). Nothing
 * is returned when the message has no recognizable position.
 */
function syntaxErrorPosition(
  error: unknown,
  source: string
): { line?: number; column?: number } {
  const text = error instanceof Error ? error.message : "";
  const explicit = /line (\d+) column (\d+)/.exec(text);
  if (explicit !== null) {
    return { line: Number(explicit[1]), column: Number(explicit[2]) };
  }
  const offset = /position (\d+)/.exec(text);
  if (offset === null) {
    return {};
  }
  const position = Number(offset[1]);
  if (!Number.isSafeInteger(position) || position > source.length) {
    return {};
  }
  const before = source.slice(0, position);
  const lastNewline = before.lastIndexOf("\n");
  return {
    line: before.split("\n").length,
    column: position - lastNewline
  };
}

/**
 * #652: whether "Reset All" has anything to do. The user entries are the
 * source of truth; any diagnostic also counts, because a malformed / invalid
 * keybindings.json can show no entries at all and Reset All is how a user
 * recovers from it.
 */
export function hasResettableKeybindingChanges(
  userEntries: readonly UserKeybindingEntry[],
  diagnostics: readonly KeybindingDiagnostic[]
): boolean {
  return userEntries.length > 0 || diagnostics.length > 0;
}

export function parseUserKeybindingsJson(source: string): ParsedUserKeybindings {
  const result: ParsedUserKeybindings = {
    entries: [],
    sourceIndices: [],
    diagnostics: []
  };
  if (source.trim() === "") {
    return result;
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    // The parser's own message can quote file content; keep it out. Only a
    // numeric position is taken from it, when one can be found safely.
    result.diagnostics.push({
      code: "jsonParseError",
      severity: "error",
      message: "keybindings.json is not valid JSON; no user keybindings applied",
      ...syntaxErrorPosition(error, source)
    });
    return result;
  }

  if (!Array.isArray(value)) {
    result.diagnostics.push({
      code: "rootMustBeArray",
      severity: "error",
      message: "keybindings.json must contain a JSON array; no user keybindings applied"
    });
    return result;
  }

  value.forEach((item: unknown, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      result.diagnostics.push({
        code: "entryMustBeObject",
        severity: "error",
        message: `Entry ${index} must be an object`,
        index
      });
      return;
    }
    const record = item as Record<string, unknown>;

    for (const field of Object.keys(record)) {
      if (!knownFields.has(field)) {
        result.diagnostics.push({
          code: "unknownField",
          severity: "warning",
          message: `Entry ${index}: unknown field "${field}" is ignored`,
          index,
          field
        });
      }
    }

    const command = record.command;
    const key = record.key;
    const when = record.when;
    const commandText = typeof command === "string" ? command : undefined;
    const keyText = typeof key === "string" ? key : undefined;
    // Every problem of the entry is reported, not just the first.
    const before = result.diagnostics.length;
    if (command === undefined || (typeof command === "string" && command.trim() === "")) {
      result.diagnostics.push({
        code: "missingCommand",
        severity: "error",
        message: `Entry ${index} has no "command"`,
        index,
        field: "command",
        ...(keyText === undefined ? {} : { key: keyText })
      });
    } else if (typeof command !== "string") {
      result.diagnostics.push({
        code: "invalidCommandType",
        severity: "error",
        message: `Entry ${index}: "command" must be a string`,
        index,
        field: "command"
      });
    }
    if (key === undefined || (typeof key === "string" && key.trim() === "")) {
      result.diagnostics.push({
        code: "missingKey",
        severity: "error",
        message: `Entry ${index} has no "key"`,
        index,
        field: "key",
        ...(commandText === undefined ? {} : { command: commandText })
      });
    } else if (typeof key !== "string") {
      result.diagnostics.push({
        code: "invalidKeyType",
        severity: "error",
        message: `Entry ${index}: "key" must be a string`,
        index,
        field: "key",
        ...(commandText === undefined ? {} : { command: commandText })
      });
    }
    if (when !== undefined && typeof when !== "string") {
      result.diagnostics.push({
        code: "invalidWhenType",
        severity: "error",
        message: `Entry ${index}: "when" must be a string`,
        index,
        field: "when",
        ...(commandText === undefined ? {} : { command: commandText }),
        ...(keyText === undefined ? {} : { key: keyText })
      });
    }
    if (
      result.diagnostics.length > before ||
      typeof command !== "string" ||
      typeof key !== "string" ||
      (when !== undefined && typeof when !== "string")
    ) {
      return;
    }

    result.entries.push({
      key: normalizeUserKeyNotation(key),
      command,
      ...(when === undefined ? {} : { when })
    });
    result.sourceIndices.push(index);
  });

  return result;
}

/** Pretty JSON (2 spaces), canonical key notation, trailing newline. */
export function serializeUserKeybindingsJson(
  entries: readonly UserKeybindingEntry[]
): string {
  const plain = entries.map((entry) => ({
    key: normalizeUserKeyNotation(entry.key),
    command: entry.command,
    ...(entry.when === undefined ? {} : { when: entry.when })
  }));
  return `${JSON.stringify(plain, null, 2)}\n`;
}

interface Row {
  binding: ResolvedKeybinding;
  origin: "default" | "user";
}

/** `-command` marks an unbind entry. */
function isUnbind(entry: UserKeybindingEntry): boolean {
  return entry.command.startsWith("-");
}

function physicalKey(key: string, platform: PergamumPlatform): string {
  return toCodeMirrorKey(key, platform);
}

function templateFor(
  command: KeybindingCommand,
  rows: readonly Row[]
): ResolvedKeybinding {
  const existing = rows.find((row) => row.binding.command === command.id);
  const base: ResolvedKeybinding =
    existing !== undefined
      ? existing.binding
      : {
          command: command.id,
          key: null,
          title: command.title,
          category: command.category,
          scope: command.scope,
          executionHost: command.executionHost,
          source: command.source,
          readonly: command.readonly,
          readonlyReason: command.readonlyReason,
          when: command.when,
          description: command.description,
          handlerStatus: command.handlerStatus
        };
  const { origin: _origin, defaultKey: _defaultKey, ...plain } = base;
  void _origin;
  void _defaultKey;
  return plain;
}

export function resolveEffectiveKeybindings(options: {
  readonly platform: PergamumPlatform;
  readonly userEntries: readonly UserKeybindingEntry[];
  /** Each entry's index in the file (defaults to its position). */
  readonly entryIndices?: readonly number[];
  /** Overrides the default rows (defaults: the catalog's for `platform`). */
  readonly defaults?: readonly ResolvedKeybinding[];
  readonly catalog?: KeybindingCatalog;
}): EffectiveKeybindingResult {
  const { platform } = options;
  const catalog = options.catalog ?? defaultKeybindingCatalog;
  const commands = new Map(catalog.commands.map((c) => [c.id, c]));
  const diagnostics: KeybindingDiagnostic[] = [];

  const rows: Row[] = (
    options.defaults ?? resolveDefaultKeybindings(platform, catalog)
  ).map((binding) => ({ binding, origin: "default" as const }));

  const indexed = options.userEntries.map((entry, position) => ({
    entry,
    index: options.entryIndices?.[position] ?? position
  }));

  /**
   * #651: `when` is metadata, never evaluated. It is known only when it
   * equals (as a string) a `when` the catalog / defaults already give this
   * command; anything else makes the entry invalid (never unconditional).
   */
  function checkWhen(
    entry: UserKeybindingEntry,
    command: KeybindingCommand,
    index: number
  ): boolean {
    if (entry.when === undefined) {
      return true;
    }
    const allowedWhen = new Set<string>(
      rows
        .filter((row) => row.binding.command === command.id)
        .map((row) => row.binding.when)
        .filter((when): when is string => when !== null)
    );
    if (command.when !== null) {
      allowedWhen.add(command.when);
    }
    if (allowedWhen.has(entry.when)) {
      return true;
    }
    diagnostics.push({
      code: "unsupportedWhen",
      severity: "error",
      message: `Entry ${index}: "when" is not supported for ${command.id}`,
      index,
      field: "when",
      command: command.id,
      key: entry.key,
      when: entry.when
    });
    return false;
  }

  /** Shared per-entry checks. Returns the command, or null when rejected. */
  function checkTarget(
    entry: UserKeybindingEntry,
    commandId: string,
    index: number
  ): KeybindingCommand | null {
    const command = commands.get(commandId);
    if (command === undefined) {
      diagnostics.push({
        code: "unknownCommand",
        severity: "error",
        message: `Entry ${index}: unknown command ${commandId}`,
        index,
        field: "command",
        command: commandId
      });
      return null;
    }
    if (command.readonly || command.source !== "pergamum") {
      diagnostics.push({
        code: "readonlyCommand",
        severity: "error",
        message: `Entry ${index}: ${commandId} is a ${command.source} command and cannot be rebound`,
        index,
        field: "command",
        command: commandId
      });
      return null;
    }
    if (!isValidKeybindingKey(entry.key)) {
      diagnostics.push({
        code: "invalidKeyNotation",
        severity: "error",
        message: `Entry ${index}: invalid key notation "${entry.key}"`,
        index,
        field: "key",
        command: commandId,
        key: entry.key
      });
      return null;
    }
    return command;
  }

  // Pass 1: unbinds, in file order. The unbound default stays as an
  // unassigned row that remembers the key it would restore.
  for (const { entry, index } of indexed) {
    if (!isUnbind(entry)) {
      continue;
    }
    const commandId = entry.command.slice(1);
    const command = checkTarget(entry, commandId, index);
    if (command === null || !checkWhen(entry, command, index)) {
      continue;
    }
    const wanted = physicalKey(entry.key, platform);
    const candidates = rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(
        ({ row }) =>
          row.binding.command === commandId &&
          row.binding.key !== null &&
          physicalKey(row.binding.key, platform) === wanted
      );
    const chosen =
      (entry.when === undefined
        ? undefined
        : candidates.find(({ row }) => row.binding.when === entry.when)) ??
      candidates[0];
    if (chosen === undefined) {
      diagnostics.push({
        code: "unbindTargetNotFound",
        severity: "warning",
        message: `Entry ${index}: ${commandId} has no binding ${entry.key} to unbind`,
        index,
        command: commandId,
        key: entry.key
      });
      continue;
    }
    rows[chosen.rowIndex] = {
      binding: {
        ...chosen.row.binding,
        key: null,
        defaultKey: chosen.row.binding.key as string
      },
      origin: "default"
    };
  }

  // Pass 2: positive entries, in file order. Each one ADDS a binding.
  for (const { entry, index } of indexed) {
    if (isUnbind(entry)) {
      continue;
    }
    const command = checkTarget(entry, entry.command, index);
    if (command === null) {
      continue;
    }
    const template = templateFor(command, rows);

    if (!checkWhen(entry, command, index)) {
      continue;
    }

    const wanted = physicalKey(entry.key, platform);
    const sameCommand = rows.some(
      (row) =>
        row.binding.command === command.id &&
        row.binding.key !== null &&
        physicalKey(row.binding.key, platform) === wanted
    );
    if (sameCommand) {
      diagnostics.push({
        code: "duplicateUserEntry",
        severity: "warning",
        message: `Entry ${index}: ${command.id} is already bound to ${entry.key}`,
        index,
        command: command.id,
        key: entry.key
      });
      continue;
    }

    const conflict = rows.find(
      (row) =>
        row.binding.command !== command.id &&
        row.binding.key !== null &&
        row.binding.scope === command.scope &&
        physicalKey(row.binding.key, platform) === wanted
    );
    if (conflict !== undefined) {
      diagnostics.push({
        code: "conflictingKey",
        severity: "error",
        message: `Entry ${index}: ${entry.key} is already bound to ${conflict.binding.command} in the ${command.scope} scope`,
        index,
        command: command.id,
        key: entry.key,
        relatedCommand: conflict.binding.command,
        scope: command.scope
      });
      continue;
    }

    const candidate: ResolvedKeybinding = {
      ...template,
      key: entry.key,
      when: entry.when ?? template.when,
      origin: "user"
    };
    const reserved = reservedUseDiagnostics(candidate, catalog, platform).map(
      (diagnostic) => ({ ...diagnostic, index })
    );
    diagnostics.push(...reserved);
    if (reserved.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // Add after the command's last row. A bare placeholder (a command with no
    // default at all, or none on this platform) is filled instead, so the
    // command is not listed twice. A placeholder that remembers an unbound
    // default is NOT filled: it stays restorable.
    const placeholder = rows.findIndex(
      (row) =>
        row.binding.command === command.id &&
        row.binding.key === null &&
        row.binding.defaultKey === undefined
    );
    if (placeholder >= 0) {
      rows[placeholder] = { binding: candidate, origin: "user" };
    } else {
      let lastOfCommand = -1;
      rows.forEach((row, rowIndex) => {
        if (row.binding.command === command.id) {
          lastOfCommand = rowIndex;
        }
      });
      rows.splice(lastOfCommand + 1, 0, { binding: candidate, origin: "user" });
    }
  }

  return { keybindings: rows.map((row) => row.binding), diagnostics };
}
