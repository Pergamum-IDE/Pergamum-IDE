/**
 * #639: catalog validation. Pure; returns diagnostics instead of throwing.
 *
 * Duplicate handling: two rows with the same platform / scope / normalized
 * key are `duplicateKey` (error) when both are customizable, and
 * `duplicateReadonlyKey` (warning) when either is nativeRole / standard, so
 * readonly overlaps are reported separately rather than silently ignored.
 *
 * Reserved keys: `forbidden` applies to customizable (pergamum) commands;
 * `nativeOnly` applies to any command that is neither native-scope nor
 * nativeRole; `discouraged` warns for customizable commands; `reload` is an
 * error unless the command is in the entry's `allowedCommands`. Entries with
 * `runtimeSuppression` (reload / forceReload keys, #644) are checked for every
 * source, not only customizable commands.
 */

import {
  isValidKeybindingKey,
  normalizeKeybindingKey,
  toCodeMirrorKey
} from "./format";
import {
  defaultKeybindingCatalog,
  isPergamumPlatform,
  resolveDefaultKeybindings
} from "./resolve";
import {
  pergamumPlatforms,
  type KeybindingCatalog,
  type KeybindingCommand,
  type KeybindingDiagnostic,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "./types";

export function validateKeybindingCatalog(
  catalog: KeybindingCatalog = defaultKeybindingCatalog
): KeybindingDiagnostic[] {
  const diagnostics: KeybindingDiagnostic[] = [];

  validateCommands(catalog, diagnostics);
  validateEntries(catalog, diagnostics);
  validateReservedData(catalog, diagnostics);

  for (const platform of pergamumPlatforms) {
    const resolved = resolveDefaultKeybindings(platform, catalog);
    validateResolved(resolved, catalog, platform, diagnostics);
  }

  return diagnostics;
}

function validateCommands(
  catalog: KeybindingCatalog,
  diagnostics: KeybindingDiagnostic[]
): void {
  const seen = new Set<string>();
  for (const command of catalog.commands) {
    if (seen.has(command.id)) {
      diagnostics.push({
        code: "duplicateCommandId",
        severity: "error",
        message: `Duplicate command id: ${command.id}`,
        command: command.id
      });
    }
    seen.add(command.id);

    if (command.title.trim() === "") {
      diagnostics.push({
        code: "emptyCommandTitle",
        severity: "error",
        message: `Command has an empty title: ${command.id}`,
        command: command.id
      });
    }
    if (command.category.trim() === "") {
      diagnostics.push({
        code: "emptyCommandCategory",
        severity: "error",
        message: `Command has an empty category: ${command.id}`,
        command: command.id
      });
    }
    validateHostAndHandler(command, diagnostics);
    if (command.source === "nativeRole" && !command.readonly) {
      diagnostics.push({
        code: "nativeRoleNotReadonly",
        severity: "error",
        message: `nativeRole command must be readonly: ${command.id}`,
        command: command.id
      });
    }
    if (command.source === "standard" && !command.readonly) {
      diagnostics.push({
        code: "standardNotReadonly",
        severity: "error",
        message: `standard command must be readonly: ${command.id}`,
        command: command.id
      });
    }
  }
}

/**
 * #640 invariants between source / executionHost / handlerStatus.
 * - nativeRole: host nativeRole <=> source nativeRole, status nativeRole.
 * - standard: host standard <=> source standard, status standard.
 * - pergamum: host renderer | main, status registered | callbackDirect |
 *   notYetRegistered.
 */
function validateHostAndHandler(
  command: KeybindingCommand,
  diagnostics: KeybindingDiagnostic[]
): void {
  const base = { command: command.id };
  if ((command.executionHost === "nativeRole") !== (command.source === "nativeRole")) {
    diagnostics.push({
      ...base,
      code: "nativeRoleHostMismatch",
      severity: "error",
      message: `nativeRole executionHost and source must go together: ${command.id}`
    });
  }
  if ((command.executionHost === "standard") !== (command.source === "standard")) {
    diagnostics.push({
      ...base,
      code: "standardHostMismatch",
      severity: "error",
      message: `standard executionHost and source must go together: ${command.id}`
    });
  }
  if (
    command.source === "pergamum" &&
    command.executionHost !== "renderer" &&
    command.executionHost !== "main"
  ) {
    diagnostics.push({
      ...base,
      code: "pergamumHostInvalid",
      severity: "error",
      message: `pergamum command must run in renderer or main: ${command.id}`
    });
  }
  const statusOk =
    command.source === "nativeRole"
      ? command.handlerStatus === "nativeRole"
      : command.source === "standard"
        ? command.handlerStatus === "standard"
        : command.handlerStatus === "registered" ||
          command.handlerStatus === "callbackDirect" ||
          command.handlerStatus === "notYetRegistered";
  if (!statusOk) {
    diagnostics.push({
      ...base,
      code: "handlerStatusMismatch",
      severity: "error",
      message: `handlerStatus ${command.handlerStatus} does not fit source ${command.source}: ${command.id}`
    });
  }
}

function validateEntries(
  catalog: KeybindingCatalog,
  diagnostics: KeybindingDiagnostic[]
): void {
  const knownIds = new Set(catalog.commands.map((command) => command.id));

  for (const entry of catalog.defaults) {
    if (!knownIds.has(entry.command)) {
      diagnostics.push({
        code: "unknownCommand",
        severity: "error",
        message: `Default keybinding references unknown command: ${entry.command}`,
        command: entry.command
      });
    }
    for (const key of [entry.key, entry.mac, entry.win, entry.linux]) {
      if (typeof key === "string" && !isValidKeybindingKey(key)) {
        diagnostics.push({
          code: "invalidKeyNotation",
          severity: "error",
          message: `Invalid key notation "${key}" for ${entry.command}`,
          command: entry.command,
          key
        });
      }
    }
  }
}

function validateReservedData(
  catalog: KeybindingCatalog,
  diagnostics: KeybindingDiagnostic[]
): void {
  for (const reserved of catalog.reserved) {
    if (!isValidKeybindingKey(reserved.key)) {
      diagnostics.push({
        code: "invalidKeyNotation",
        severity: "error",
        message: `Invalid reserved key notation: ${reserved.key}`,
        key: reserved.key
      });
    }
    if (
      reserved.runtimeSuppression !== undefined &&
      reserved.level !== "forbidden" &&
      !(reserved.level === "reload" && (reserved.allowedCommands ?? []).length > 0)
    ) {
      // A suppressed key must be unusable by commands, or carry an explicit
      // exception list (the Ruby Mod-r case).
      diagnostics.push({
        code: "reservedRuntimeSuppressionInvalid",
        severity: "error",
        message: `Runtime-suppressed reserved key ${reserved.key} must be forbidden or a reload key with allowedCommands`,
        key: reserved.key
      });
    }
    for (const platform of reserved.platforms) {
      if (!isPergamumPlatform(platform)) {
        diagnostics.push({
          code: "invalidPlatform",
          severity: "error",
          message: `Invalid platform "${String(platform)}" in reserved key ${reserved.key}`,
          key: reserved.key,
          platform: String(platform)
        });
      }
    }
  }
}

function validateResolved(
  resolved: readonly ResolvedKeybinding[],
  catalog: KeybindingCatalog,
  platform: PergamumPlatform,
  diagnostics: KeybindingDiagnostic[]
): void {
  const byKey = new Map<string, ResolvedKeybinding[]>();

  for (const binding of resolved) {
    if (binding.key === null) {
      continue;
    }
    const normalized = normalizeKeybindingKey(binding.key);
    if (normalized === null) {
      continue; // reported by validateEntries
    }

    const groupKey = `${binding.scope}\u0000${normalized}`;
    const group = byKey.get(groupKey) ?? [];
    group.push(binding);
    byKey.set(groupKey, group);

    diagnostics.push(...reservedUseDiagnostics(binding, catalog, platform));
  }

  for (const group of byKey.values()) {
    if (group.length < 2) {
      continue;
    }
    const first = group[0]!;
    const involvesReadonly = group.some((binding) => binding.readonly);
    diagnostics.push({
      code: involvesReadonly ? "duplicateReadonlyKey" : "duplicateKey",
      severity: involvesReadonly ? "warning" : "error",
      message: `${first.key} (${platform}, ${first.scope}) is bound to: ${group
        .map((binding) => binding.command)
        .join(", ")}`,
      key: first.key ?? undefined,
      platform,
      scope: first.scope
    });
  }
}

/**
 * Reserved-key diagnostics for one binding on `platform` (shared by catalog
 * validation and the user keybindings overlay, #645). Keys are compared as
 * the physical key on `platform` (Mod = Ctrl off macOS, Cmd on macOS), so a
 * user's `Ctrl-F5` on Windows is caught as `Mod-F5`.
 */
export function reservedUseDiagnostics(
  binding: ResolvedKeybinding,
  catalog: KeybindingCatalog,
  platform: PergamumPlatform
): KeybindingDiagnostic[] {
  const diagnostics: KeybindingDiagnostic[] = [];
  if (binding.key === null || !isValidKeybindingKey(binding.key)) {
    return diagnostics;
  }
  const physicalKey = toCodeMirrorKey(binding.key, platform);
  for (const reserved of catalog.reserved) {
    if (
      !reserved.platforms.includes(platform) ||
      !isValidKeybindingKey(reserved.key) ||
      toCodeMirrorKey(reserved.key, platform) !== physicalKey
    ) {
      continue;
    }

    const base = {
      command: binding.command,
      key: binding.key ?? undefined,
      platform,
      scope: binding.scope
    };
    const label = `${binding.command} uses reserved key ${binding.key} on ${platform} (${reserved.reason})`;

    // #644: a runtime-suppressed reload key is checked for EVERY source (a
    // nativeRole / standard command using it would fight the guard too),
    // except for the commands the reserved entry explicitly allows.
    const suppressed = reserved.runtimeSuppression !== undefined;
    const explicitlyAllowed = (reserved.allowedCommands ?? []).includes(
      binding.command
    );

    if (
      reserved.level === "forbidden" &&
      !explicitlyAllowed &&
      (binding.source === "pergamum" || suppressed)
    ) {
      diagnostics.push({
        ...base,
        code: "reservedForbiddenKey",
        severity: "error",
        message: label
      });
    } else if (
      reserved.level === "reload" &&
      (binding.source === "pergamum" || suppressed) &&
      !explicitlyAllowed
    ) {
      diagnostics.push({
        ...base,
        code: "reservedReloadKey",
        severity: "error",
        message: label
      });
    } else if (
      reserved.level === "nativeOnly" &&
      binding.scope !== "native" &&
      binding.source !== "nativeRole"
    ) {
      diagnostics.push({
        ...base,
        code: "reservedNativeOnlyKey",
        severity: "error",
        message: label
      });
    } else if (
      reserved.level === "discouraged" &&
      binding.source === "pergamum"
    ) {
      diagnostics.push({
        ...base,
        code: "reservedDiscouragedKey",
        severity: "warning",
        message: label
      });
    }
  }
  return diagnostics;
}
