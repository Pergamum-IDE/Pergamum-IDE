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

export interface KeybindingCommand {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly scope: KeybindingScope;
  readonly executionHost: KeybindingExecutionHost;
  readonly source: KeybindingSource;
  readonly readonly: boolean;
  readonly readonlyReason: KeybindingReadonlyReason | null;
  /** Reserved for the future `when` context (not evaluated in #639). */
  readonly when: string | null;
  /**
   * true when the id is not (yet) a registered runtime command in
   * `src/shared/commandIds.ts`; the entry is catalog metadata for future
   * wiring only.
   */
  readonly metadataOnly: boolean;
}

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

export interface ReservedKeybinding {
  readonly key: string;
  readonly platforms: readonly PergamumPlatform[];
  readonly level: ReservedKeyLevel;
  readonly reason: string;
  /** reload level only: the commands explicitly allowed to use the key. */
  readonly allowedCommands?: readonly string[];
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
  | "reservedNativeOnlyKey"
  | "reservedDiscouragedKey"
  | "nativeRoleNotReadonly"
  | "standardNotReadonly";

export interface KeybindingDiagnostic {
  readonly code: KeybindingDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly command?: string;
  readonly key?: string;
  readonly platform?: string;
  readonly scope?: KeybindingScope;
}

/** The data validated and resolved together. */
export interface KeybindingCatalog {
  readonly commands: readonly KeybindingCommand[];
  readonly defaults: readonly DefaultKeybinding[];
  readonly reserved: readonly ReservedKeybinding[];
}
