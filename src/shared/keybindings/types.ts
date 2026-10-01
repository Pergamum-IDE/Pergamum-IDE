/**
 * #639: shared keybinding catalog — type model.
 *
 * Definition only. Nothing in this module is wired into Electron menu
 * accelerators, CodeMirror keymaps, or renderer listeners yet (#635 parent).
 *
 * Canonical key notation is CodeMirror style: "Mod-s", "Mod-Shift-p",
 * "Ctrl-Space", "Alt-ArrowLeft", "F2", "Mod-,". Modifiers are Mod / Ctrl /
 * Shift / Alt joined with "-"; letter keys are lowercase.
 */

export type PergamumPlatform = "darwin" | "win32" | "linux";

export const pergamumPlatforms: readonly PergamumPlatform[] = [
  "darwin",
  "win32",
  "linux"
];

/** Where a keybinding is meant to be active. */
export type KeybindingScope = "app" | "editor" | "pane" | "native";

/** Which layer ultimately handles the keystroke. */
export type KeybindingExecutionHost =
  | "main"
  | "renderer"
  | "nativeRole"
  | "standard";

/** Who owns the behavior of the binding. */
export type KeybindingSource = "pergamum" | "nativeRole" | "standard";

/** Why a command's key cannot be customized. */
export type KeybindingReadonlyReason = "nativeRole" | "standardBehavior";

/**
 * #640: how a command is handled at runtime today (not where it should be).
 *
 * registered       - a Pergamum command id in `src/shared/commandIds.ts` (the
 *                    shared command registry vocabulary).
 * callbackDirect   - executed by local callback / keymap / listener wiring;
 *                    no registry command exists yet.
 * nativeRole       - Electron native menu role (source "nativeRole").
 * standard         - CodeMirror / OS / browser behavior (source "standard").
 * notYetRegistered - metadata only; no runtime handler is wired.
 */
export type CommandHandlerStatus =
  | "registered"
  | "callbackDirect"
  | "nativeRole"
  | "standard"
  | "notYetRegistered";

/**
 * Keybinding-facing command metadata. Extends (does not replace) the shared
 * command registry's vocabulary: ids come from `commandIds.ts` where one
 * exists.
 */
export interface KeybindingCommand {
  readonly id: string;
  readonly title: string;
  /** Free-form display group (not the registry's `CommandCategory`). */
  readonly category: string;
  /** Short human-readable explanation, including notable delegation. */
  readonly description: string;
  readonly scope: KeybindingScope;
  /**
   * Where the command handler lives today. For Pergamum commands this is
   * `renderer` even when the keystroke is a main-process menu accelerator
   * (IPC then runs the renderer registry) or the renderer handler calls
   * main over IPC; such delegation is noted in `description`.
   */
  readonly executionHost: KeybindingExecutionHost;
  readonly source: KeybindingSource;
  readonly readonly: boolean;
  readonly readonlyReason: KeybindingReadonlyReason | null;
  /**
   * Descriptive, display-only context (e.g. "editorFocus && markdownDocument
   * && !readOnly"). NOT evaluated; the registry's own
   * `CommandEnablementExpression` `when` is unrelated and unchanged.
   */
  readonly when: string | null;
  readonly handlerStatus: CommandHandlerStatus;
}

export type CommandMetadata = KeybindingCommand;

/**
 * One default key for one command. A command with several default keys has
 * several entries; a command with no entry has no default key.
 *
 * Platform fields: `undefined` = use `key`; `null` = explicitly unassigned
 * on that platform; a string = override for that platform.
 */
export interface DefaultKeybinding {
  readonly command: string;
  readonly key: string | null;
  readonly mac?: string | null;
  readonly win?: string | null;
  readonly linux?: string | null;
  readonly when?: string;
}

export interface ResolvedKeybinding {
  readonly command: string;
  /** null = no key on this platform. */
  readonly key: string | null;
  readonly title: string;
  readonly category: string;
  readonly scope: KeybindingScope;
  readonly executionHost: KeybindingExecutionHost;
  readonly source: KeybindingSource;
  readonly readonly: boolean;
  readonly readonlyReason: KeybindingReadonlyReason | null;
  readonly when: string | null;
  readonly description: string;
  readonly handlerStatus: CommandHandlerStatus;
  /**
   * #647: where an EFFECTIVE row comes from. Absent = an untouched default
   * (so `resolveDefaultKeybindings` and an empty overlay stay identical).
   */
  readonly origin?: "default" | "user";
  /**
   * #647: on an unassigned row that stands for a default binding the user
   * unbound, the default key it would restore (canonical notation).
   */
  readonly defaultKey?: string;
}

/**
 * forbidden   - OS/system level; no Pergamum command may use it.
 * nativeOnly  - only native-scope / nativeRole commands may use it.
 * discouraged - usable but conflicts with OS text-editing conventions.
 * reload      - Electron reload key that is allowed only for the commands
 *               in `allowedCommands` (Mod-r is Ruby). Runtime suppression
 *               is a future issue.
 */
export type ReservedKeyLevel =
  | "forbidden"
  | "nativeOnly"
  | "discouraged"
  | "reload";

/** The Chromium behavior a runtime guard suppresses for a reserved key. */
export type ReservedRuntimeSuppression = "reload" | "forceReload";

export interface ReservedKeybinding {
  readonly key: string;
  readonly platforms: readonly PergamumPlatform[];
  readonly level: ReservedKeyLevel;
  readonly reason: string;
  /**
   * The commands explicitly allowed to use the key despite its level (the
   * `reload` level's single Ruby exception, #635). An explicit, reviewable
   * exception; never proof that the key is generally safe.
   */
  readonly allowedCommands?: readonly string[];
  /**
   * #644: a separate axis from `level`. When set, the runtime guard
   * (`src/main/reloadGuard.ts`, renderer fallback) suppresses this key's
   * Chromium reload / forceReload behavior. Keys with `allowedCommands` are
   * still delivered to the renderer so the allowed command can run.
   */
  readonly runtimeSuppression?: ReservedRuntimeSuppression;
}

export type KeybindingDiagnosticCode =
  | "duplicateCommandId"
  | "emptyCommandTitle"
  | "emptyCommandCategory"
  | "unknownCommand"
  | "invalidPlatform"
  | "invalidKeyNotation"
  | "duplicateKey"
  | "duplicateReadonlyKey"
  | "reservedForbiddenKey"
  | "reservedReloadKey"
  | "reservedRuntimeSuppressionInvalid"
  | "reservedNativeOnlyKey"
  | "reservedDiscouragedKey"
  | "nativeRoleNotReadonly"
  | "standardNotReadonly"
  | "nativeRoleHostMismatch"
  | "standardHostMismatch"
  | "pergamumHostInvalid"
  | "handlerStatusMismatch"
  // #645: user keybindings.json
  | "jsonParseError"
  | "rootMustBeArray"
  | "entryMustBeObject"
  | "missingKey"
  | "missingCommand"
  | "unknownField"
  | "invalidKeyType"
  | "invalidCommandType"
  | "invalidWhenType"
  | "readonlyCommand"
  | "conflictingKey"
  | "duplicateUserEntry"
  | "unsupportedWhen"
  | "unbindTargetNotFound"
  | "fileReadError"
  | "fileWriteError"
  | "fileInvalid";

export interface KeybindingDiagnostic {
  readonly code: KeybindingDiagnosticCode;
  readonly severity: "error" | "warning";
  /**
   * An English, developer-oriented detail (logs, tests, debugging). The UI
   * must not show it: it builds a localized message from `code` and the
   * fields below instead (#651).
   */
  readonly message: string;
  /** #645: the 0-based index of the offending entry in keybindings.json. */
  readonly index?: number;
  /** #651: the offending field; for `unknownField`, the unknown field's name. */
  readonly field?: string;
  readonly command?: string;
  readonly key?: string;
  /** #651: the entry's `when` string as written (metadata, never evaluated). */
  readonly when?: string;
  /** #651: the other command in a conflict. */
  readonly relatedCommand?: string;
  readonly platform?: string;
  readonly scope?: KeybindingScope;
  /** #651: best-effort position of a JSON syntax error (1-based). */
  readonly line?: number;
  readonly column?: number;
}

/** The data validated and resolved together. */
export interface KeybindingCatalog {
  readonly commands: readonly KeybindingCommand[];
  readonly defaults: readonly DefaultKeybinding[];
  readonly reserved: readonly ReservedKeybinding[];
}
