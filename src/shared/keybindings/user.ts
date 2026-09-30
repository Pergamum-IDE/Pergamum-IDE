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
 * Overlay (deterministic): defaults for the platform -> all unbinds (file
 * order) -> positive entries (file order). The first positive entry of a
 * command replaces its primary default binding; later positive entries of the
 * same command are added as aliases. An entry that is invalid, targets a
 * readonly / nativeRole / standard command, uses a reserved key (reusing the
 * #644 validation), or collides with another binding in the same scope is
 * ignored with a diagnostic; the defaults stay in effect. Diagnostics carry
 * the entry's index in the file, and never include file contents or paths.
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
  } catch {
    // The parser's own message can quote file content; keep it out.
    result.diagnostics.push({
      code: "jsonParseError",
      severity: "error",
      message: "keybindings.json is not valid JSON; no user keybindings applied"
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
          index
        });
      }
    }

    const command = record.command;
    const key = record.key;
    if (typeof command !== "string" || command.trim() === "") {
      result.diagnostics.push({
        code: "missingCommand",
        severity: "error",
        message: `Entry ${index} has no "command"`,
        index
      });
      return;
    }
    if (typeof key !== "string" || key.trim() === "") {
      result.diagnostics.push({
        code: "missingKey",
        severity: "error",
        message: `Entry ${index} (${command}) has no "key"`,
        index,
        command
      });
      return;
    }
    const when = record.when;
    if (when !== undefined && typeof when !== "string") {
      result.diagnostics.push({
        code: "unsupportedWhen",
        severity: "error",
        message: `Entry ${index} (${command}): "when" must be a string`,
        index,
        command
      });
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

/**
 * The primary default binding of a command: its first remaining default-origin
 * row that has a key. The one place that decides primary vs alias.
 */
function findPrimaryRowIndex(rows: readonly Row[], commandId: string): number {
  return rows.findIndex(
    (row) =>
      row.binding.command === commandId &&
      row.origin === "default" &&
      row.binding.key !== null
  );
}

function physicalKey(key: string, platform: PergamumPlatform): string {
  return toCodeMirrorKey(key, platform);
}

function templateFor(
  command: KeybindingCommand,
  rows: readonly Row[]
): ResolvedKeybinding {
  const existing = rows.find((row) => row.binding.command === command.id);
  if (existing !== undefined) {
    return existing.binding;
  }
  return {
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
        command: commandId,
        key: entry.key
      });
      return null;
    }
    return command;
  }

  // Pass 1: unbinds, in file order.
  const primaryUnbound = new Set<string>();
  for (const { entry, index } of indexed) {
    if (!isUnbind(entry)) {
      continue;
    }
    const commandId = entry.command.slice(1);
    const command = checkTarget(entry, commandId, index);
    if (command === null) {
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
    if (findPrimaryRowIndex(rows, commandId) === chosen.rowIndex) {
      // The primary was unbound: a positive entry then ADDS a binding instead
      // of replacing whichever alias is left.
      primaryUnbound.add(commandId);
    }
    rows.splice(chosen.rowIndex, 1);
    if (!rows.some((row) => row.binding.command === commandId)) {
      // Keep one (unassigned) row so the command stays listed.
      rows.push({
        binding: { ...chosen.row.binding, key: null },
        origin: "default"
      });
    }
  }

  // Pass 2: positive entries, in file order.
  const replacedPrimary = new Set<string>(primaryUnbound);
  for (const { entry, index } of indexed) {
    if (isUnbind(entry)) {
      continue;
    }
    const command = checkTarget(entry, entry.command, index);
    if (command === null) {
      continue;
    }
    const template = templateFor(command, rows);

    if (entry.when !== undefined) {
      const allowedWhen = new Set<string>(
        rows
          .filter((row) => row.binding.command === command.id)
          .map((row) => row.binding.when)
          .filter((when): when is string => when !== null)
      );
      if (command.when !== null) {
        allowedWhen.add(command.when);
      }
      if (!allowedWhen.has(entry.when)) {
        diagnostics.push({
          code: "unsupportedWhen",
          severity: "error",
          message: `Entry ${index}: "when" is not supported for ${command.id}`,
          index,
          command: command.id
        });
        continue;
      }
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
        scope: command.scope
      });
      continue;
    }

    const candidate: ResolvedKeybinding = {
      ...template,
      key: entry.key,
      when: entry.when ?? template.when
    };
    const reserved = reservedUseDiagnostics(candidate, catalog, platform).map(
      (diagnostic) => ({ ...diagnostic, index })
    );
    diagnostics.push(...reserved);
    if (reserved.some((diagnostic) => diagnostic.severity === "error")) {
      continue;
    }

    // Apply: the first positive entry replaces the primary default binding;
    // later ones for the same command become aliases.
    const primary = findPrimaryRowIndex(rows, command.id);
    if (!replacedPrimary.has(command.id) && primary >= 0) {
      rows[primary] = { binding: candidate, origin: "user" };
    } else {
      const unassigned = rows.findIndex(
        (row) => row.binding.command === command.id && row.binding.key === null
      );
      if (unassigned >= 0) {
        rows[unassigned] = { binding: candidate, origin: "user" };
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
    replacedPrimary.add(command.id);
  }

  return { keybindings: rows.map((row) => row.binding), diagnostics };
}
