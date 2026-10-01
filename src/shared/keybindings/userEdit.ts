/**
 * #647: editing operations on the user's keybindings (change / unbind / reset)
 * as pure functions over the `keybindings.json` entry list. All keybinding
 * semantics live here (and in `user.ts`), never in React.
 *
 * Rows are edited one binding at a time, with the VS Code style overlay:
 *
 * - change a DEFAULT binding K -> N: append `-command K` and `command N`
 * - change a USER binding: rewrite that positive entry's key
 * - change an UNASSIGNED row: append `command N` (an unbound default stays
 *   unbound and restorable)
 * - unbind a DEFAULT binding: append `-command K`; a USER binding: remove its
 *   positive entry
 * - reset a USER binding: remove its positive entry; an unbound DEFAULT row:
 *   remove its `-command K` entry
 *
 * A change is refused (nothing is returned for saving) when the key is
 * unsupported, reserved (the #644 validation), or already taken: same scope,
 * or either side is an `app`-scope / nativeRole / standard binding, since
 * those fire regardless of focus (so `Mod-z` cannot be stolen from Undo).
 * Bindings in different pane / editor scopes may share a key.
 */

import {
  formatKeybindingLabel,
  isValidKeybindingKey,
  parseKeybindingKey,
  toCodeMirrorKey
} from "./format";
import { defaultKeybindingCatalog } from "./resolve";
import {
  normalizeUserKeyNotation,
  resolveEffectiveKeybindings,
  type UserKeybindingEntry
} from "./user";
import type {
  KeybindingCatalog,
  KeybindingDiagnostic,
  KeybindingScope,
  PergamumPlatform,
  ResolvedKeybinding
} from "./types";

export type KeybindingEditKind = "change" | "unbind" | "reset" | "add";

/** Identifies one effective row (binding) to edit. */
export interface KeybindingEditTarget {
  readonly commandId: string;
  /** The row's current key; `null` for an unassigned row. */
  readonly key: string | null;
  readonly origin: "default" | "user";
  /** On an unassigned row that stands for an unbound default: that key. */
  readonly defaultKey?: string | null;
}

/**
 * #648: an `add` names only the command (its scope / when / source / readonly
 * state follow from the command); the other kinds name one binding row.
 */
export interface KeybindingAddRequest {
  readonly kind: "add";
  readonly target: { readonly commandId: string };
  readonly newKey: string;
}

export interface KeybindingRowEditRequest {
  readonly kind: "change" | "unbind" | "reset";
  readonly target: KeybindingEditTarget;
  /** Required for `change` (canonical notation). */
  readonly newKey?: string;
}

export type KeybindingEditRequest = KeybindingAddRequest | KeybindingRowEditRequest;

export interface KeybindingEditConflict {
  readonly key: string;
  readonly keyLabel: string;
  readonly commandId: string;
  readonly title: string;
  readonly category: string;
  readonly scope: KeybindingScope;
}

export type KeybindingEditFailureReason =
  | "conflict"
  | "reserved"
  | "unsupported"
  | "readonly"
  | "stale"
  | "noop"
  | "duplicate"
  | "invalid";

export type KeybindingEditResult =
  | {
      readonly ok: true;
      readonly entries: UserKeybindingEntry[];
      readonly diagnostics: KeybindingDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly reason: KeybindingEditFailureReason;
      readonly diagnostics: KeybindingDiagnostic[];
      readonly conflict?: KeybindingEditConflict;
    };

function fail(
  reason: KeybindingEditFailureReason,
  diagnostics: KeybindingDiagnostic[] = [],
  conflict?: KeybindingEditConflict
): KeybindingEditResult {
  return {
    ok: false,
    reason,
    diagnostics,
    ...(conflict === undefined ? {} : { conflict })
  };
}

function sameKey(
  a: string | null | undefined,
  b: string | null | undefined,
  platform: PergamumPlatform
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return toCodeMirrorKey(a, platform) === toCodeMirrorKey(b, platform);
}

function isUnbindEntry(entry: UserKeybindingEntry): boolean {
  return entry.command.startsWith("-");
}

/**
 * Two bindings block each other when they would both fire for one key press:
 * same scope, or one of them is app-wide (app scope / a native role / a
 * standard behavior).
 */
function blocks(
  candidate: { scope: KeybindingScope },
  other: ResolvedKeybinding
): boolean {
  return (
    candidate.scope === other.scope ||
    candidate.scope === "app" ||
    other.scope === "app" ||
    other.source !== "pergamum"
  );
}

function findTargetRow(
  rows: readonly ResolvedKeybinding[],
  target: KeybindingEditTarget,
  platform: PergamumPlatform
): ResolvedKeybinding | undefined {
  return rows.find((row) => {
    if (row.command !== target.commandId) {
      return false;
    }
    if ((row.origin ?? "default") !== target.origin) {
      return false;
    }
    if (target.key !== null) {
      return sameKey(row.key, target.key, platform);
    }
    return (
      row.key === null &&
      (row.defaultKey ?? null) === (target.defaultKey ?? null)
    );
  });
}

export function applyKeybindingEdit(input: {
  readonly platform: PergamumPlatform;
  readonly entries: readonly UserKeybindingEntry[];
  readonly request: KeybindingEditRequest;
  readonly catalog?: KeybindingCatalog;
}): KeybindingEditResult {
  const { platform, request } = input;
  const catalog = input.catalog ?? defaultKeybindingCatalog;
  const command = catalog.commands.find((c) => c.id === request.target.commandId);
  if (command === undefined) {
    return fail("invalid");
  }
  if (command.readonly || command.source !== "pergamum") {
    return fail("readonly");
  }

  const entries = input.entries.map((entry) => ({
    ...entry,
    key: normalizeUserKeyNotation(entry.key)
  }));

  const before = resolveEffectiveKeybindings({
    platform,
    userEntries: entries,
    catalog
  });
  // An add has no row to find: it appends a key to the command.
  if (request.kind !== "add") {
    const targetRow = findTargetRow(before.keybindings, request.target, platform);
    if (targetRow === undefined) {
      return fail("stale");
    }
  }

  const positiveIndex = (key: string | null): number =>
    key === null
      ? -1
      : entries.findIndex(
          (entry) =>
            !isUnbindEntry(entry) &&
            entry.command === command.id &&
            sameKey(entry.key, key, platform)
        );
  const unbindIndex = (key: string | null | undefined): number =>
    key === null || key === undefined
      ? -1
      : entries.findIndex(
          (entry) =>
            isUnbindEntry(entry) &&
            entry.command === `-${command.id}` &&
            sameKey(entry.key, key, platform)
        );

  // The entries with the target's old binding dealt with, but before any new
  // key is added: the base for the conflict check and for the final list.
  let base: UserKeybindingEntry[];
  let newKey: string | null = null;
  /** Where the new positive entry goes (a user row is rewritten in place). */
  let insertAt: number | null = null;

  if (request.kind === "add" || request.kind === "change") {
    if (request.newKey === undefined) {
      return fail("unsupported");
    }
    newKey = normalizeUserKeyNotation(request.newKey);
    if (!isValidKeybindingKey(newKey)) {
      return fail("unsupported");
    }
    if (request.kind === "change" && sameKey(newKey, request.target.key, platform)) {
      return fail("noop");
    }
    // An editor-scope shortcut needs a command modifier (or an F-key): a bare
    // key would hijack typing.
    if (command.scope === "editor") {
      const parsed = parseKeybindingKey(newKey);
      const hasCommandModifier =
        parsed !== null &&
        (parsed.modifiers.has("Mod") ||
          parsed.modifiers.has("Ctrl") ||
          parsed.modifiers.has("Alt"));
      if (parsed === null || (!hasCommandModifier && !/^F\d+$/.test(parsed.key))) {
        return fail("unsupported");
      }
    }
    if (request.kind === "add") {
      // Same command, same key, already effective: a duplicate (not a conflict
      // with another command). A key that is merely unbound stays re-addable.
      if (
        before.keybindings.some(
          (row) =>
            row.command === command.id &&
            row.key !== null &&
            sameKey(row.key, newKey, platform)
        )
      ) {
        return fail("duplicate");
      }
      // Re-adding a key whose default was unbound would collide with the
      // `-command` entry; the row's Reset restores it instead.
      if (unbindIndex(newKey) >= 0) {
        return fail("duplicate");
      }
      base = [...entries];
    } else if (request.target.origin === "user") {
      const at = positiveIndex(request.target.key);
      if (at < 0) {
        return fail("stale");
      }
      insertAt = at;
      base = entries.filter((_, index) => index !== at);
    } else if (request.target.key !== null) {
      base =
        unbindIndex(request.target.key) >= 0
          ? [...entries]
          : [...entries, { key: request.target.key, command: `-${command.id}` }];
    } else {
      base = [...entries];
    }
  } else if (request.kind === "unbind") {
    const target = request.target;
    if (target.key === null) {
      return fail("noop");
    }
    if (target.origin === "user") {
      const at = positiveIndex(target.key);
      if (at < 0) {
        return fail("stale");
      }
      base = entries.filter((_, index) => index !== at);
    } else {
      base =
        unbindIndex(target.key) >= 0
          ? [...entries]
          : [...entries, { key: target.key, command: `-${command.id}` }];
    }
  } else {
    // reset
    const target = request.target;
    if (target.origin === "user") {
      const at = positiveIndex(target.key);
      if (at < 0) {
        return fail("stale");
      }
      base = entries.filter((_, index) => index !== at);
    } else if (target.key === null && target.defaultKey) {
      const at = unbindIndex(target.defaultKey);
      if (at < 0) {
        return fail("stale");
      }
      base = entries.filter((_, index) => index !== at);
    } else {
      return fail("noop");
    }
  }

  if (newKey === null) {
    const after = resolveEffectiveKeybindings({ platform, userEntries: base, catalog });
    return { ok: true, entries: base, diagnostics: after.diagnostics };
  }

  // A change: is the new key free?
  const baseRows = resolveEffectiveKeybindings({
    platform,
    userEntries: base,
    catalog
  }).keybindings;
  const taken = baseRows.find(
    (row) =>
      row.key !== null &&
      sameKey(row.key, newKey, platform) &&
      (row.command === command.id || blocks(command, row))
  );
  if (taken !== undefined) {
    return fail("conflict", [], {
      key: newKey,
      keyLabel: formatKeybindingLabel(newKey, platform),
      commandId: taken.command,
      title: taken.title,
      category: taken.category,
      scope: taken.scope
    });
  }

  const position = insertAt ?? base.length;
  const nextEntries: UserKeybindingEntry[] = [
    ...base.slice(0, position),
    { key: newKey, command: command.id },
    ...base.slice(position)
  ];
  const newIndex = position;
  const after = resolveEffectiveKeybindings({
    platform,
    userEntries: nextEntries,
    catalog
  });
  const ownDiagnostics = after.diagnostics.filter(
    (diagnostic) => diagnostic.index === newIndex
  );
  const ownErrors = ownDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (ownErrors.length > 0) {
    const reserved = ownErrors.some((diagnostic) =>
      diagnostic.code.startsWith("reserved")
    );
    return fail(reserved ? "reserved" : "invalid", ownDiagnostics);
  }
  if (
    !after.keybindings.some(
      (row) =>
        row.command === command.id &&
        row.key !== null &&
        sameKey(row.key, newKey, platform)
    )
  ) {
    return fail("invalid", ownDiagnostics);
  }
  return { ok: true, entries: nextEntries, diagnostics: after.diagnostics };
}
