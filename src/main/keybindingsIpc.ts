/**
 * #645: IPC for user keybindings (responsibility-separated, like settingsIpc).
 *
 * The renderer gets plain serializable data only: never the file path and never
 * raw file text. `saveUserKeybindings` validates its payload shape strictly
 * and rejects (with diagnostics, writing nothing) a set that has any error.
 */

import { ipcMain, shell } from "electron";
import {
  KEYBINDINGS_CHANNELS,
  type GetEffectiveKeybindingsResult,
  type GetKeyboardShortcutItemsResult,
  type ApplyKeybindingChangeResult,
  type GetUserKeybindingsResult,
  type OpenKeybindingsJsonLocationResult,
  type SaveUserKeybindingsResult,
  type SetKeybindingCaptureModeResult
} from "../shared/api";
import {
  listKeyboardShortcutRows,
  type KeybindingDiagnostic,
  type KeybindingEditRequest,
  type UserKeybindingEntry
} from "../shared/keybindings";
import { setKeybindingCaptureActive } from "./keybindingCapture";
import {
  applyKeybindingChange,
  type LoadedKeybindings,
  ensureKeybindingsDirectory,
  getStartupKeybindings,
  loadKeybindings,
  readUserKeybindings,
  saveUserKeybindings
} from "./keybindingsStore";
import { nodePlatformToPergamumPlatform } from "./menuAccelerators";

/** Strict shape check of a renderer-supplied entry list. */
export function parseSaveUserKeybindingsRequest(
  value: unknown
): UserKeybindingEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries: UserKeybindingEntry[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const { key, command, when } = record;
    if (typeof key !== "string" || typeof command !== "string") {
      return null;
    }
    if (when !== undefined && typeof when !== "string") {
      return null;
    }
    entries.push({ key, command, ...(when === undefined ? {} : { when }) });
  }
  return entries;
}

/**
 * Strict shape check of a renderer-supplied edit request (#647). Anything
 * unexpected is rejected; nothing is coerced.
 */
export function parseKeybindingEditRequest(
  value: unknown
): KeybindingEditRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const { kind, target, newKey } = record;
  if (kind !== "change" && kind !== "unbind" && kind !== "reset") {
    return null;
  }
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return null;
  }
  const t = target as Record<string, unknown>;
  if (typeof t.commandId !== "string" || t.commandId === "") {
    return null;
  }
  if (t.key !== null && typeof t.key !== "string") {
    return null;
  }
  if (t.origin !== "default" && t.origin !== "user") {
    return null;
  }
  if (
    t.defaultKey !== undefined &&
    t.defaultKey !== null &&
    typeof t.defaultKey !== "string"
  ) {
    return null;
  }
  if (kind === "change") {
    if (typeof newKey !== "string" || newKey === "") {
      return null;
    }
  } else if (newKey !== undefined) {
    return null;
  }
  return {
    kind,
    target: {
      commandId: t.commandId,
      key: t.key as string | null,
      origin: t.origin,
      ...(t.defaultKey === undefined ? {} : { defaultKey: t.defaultKey as string | null })
    },
    ...(kind === "change" ? { newKey: newKey as string } : {})
  };
}

const invalidRequestDiagnostic: KeybindingDiagnostic = {
  code: "entryMustBeObject",
  severity: "error",
  message:
    "The keybindings request must be an array of { key, command, when? } objects"
};

export interface KeybindingsIpcDependencies {
  /** Opens a directory in the OS file manager; resolves "" on success. */
  readonly openDirectory?: (directory: string) => Promise<string>;
  /**
   * Called after a change was saved, with the keybindings now in effect, so
   * the application menu can be rebuilt with the new accelerators (#647).
   */
  readonly onKeybindingsApplied?: (loaded: LoadedKeybindings) => Promise<void> | void;
}

export function registerKeybindingsIpc(
  platformSource: NodeJS.Platform = process.platform,
  dependencies: KeybindingsIpcDependencies = {}
): void {
  const platform = nodePlatformToPergamumPlatform(platformSource);
  const openDirectory =
    dependencies.openDirectory ?? ((directory: string) => shell.openPath(directory));

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.getUserKeybindings,
    async (): Promise<GetUserKeybindingsResult> => {
      const parsed = await readUserKeybindings();
      return { entries: parsed.entries, diagnostics: parsed.diagnostics };
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.getEffectiveKeybindings,
    async (): Promise<GetEffectiveKeybindingsResult> => {
      const loaded = await loadKeybindings(platform);
      return {
        platform,
        keybindings: loaded.effective.keybindings,
        diagnostics: loaded.diagnostics
      };
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.saveUserKeybindings,
    async (_event, request: unknown): Promise<SaveUserKeybindingsResult> => {
      const entries = parseSaveUserKeybindingsRequest(request);
      if (entries === null) {
        return { ok: false, diagnostics: [invalidRequestDiagnostic] };
      }
      return saveUserKeybindings(entries, platform);
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.getKeyboardShortcutItems,
    async (): Promise<GetKeyboardShortcutItemsResult> => {
      // What is in effect: the startup load (a fresh read only as a fallback).
      const loaded = getStartupKeybindings() ?? (await loadKeybindings(platform));
      return {
        platform,
        items: listKeyboardShortcutRows(loaded.effective.keybindings, platform),
        diagnostics: loaded.diagnostics
      };
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.openKeybindingsJsonLocation,
    async (): Promise<OpenKeybindingsJsonLocationResult> => {
      // The path stays in main; the renderer only learns whether it worked.
      try {
        const directory = await ensureKeybindingsDirectory();
        const failure = await openDirectory(directory);
        return { ok: failure === "" };
      } catch {
        return { ok: false };
      }
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.applyKeybindingChange,
    async (_event, request: unknown): Promise<ApplyKeybindingChangeResult> => {
      const parsed = parseKeybindingEditRequest(request);
      if (parsed === null) {
        return {
          ok: false,
          platform,
          diagnostics: [invalidRequestDiagnostic],
          failure: { reason: "invalid" }
        };
      }
      const outcome = await applyKeybindingChange(parsed, platform);
      if (!outcome.ok) {
        return {
          ok: false,
          platform,
          diagnostics: outcome.diagnostics,
          failure: {
            reason: outcome.reason,
            ...(outcome.conflict === undefined ? {} : { conflict: outcome.conflict })
          }
        };
      }
      try {
        await dependencies.onKeybindingsApplied?.(outcome.loaded);
      } catch {
        // The change is saved and applied; a failed menu rebuild only leaves
        // the menu accelerators stale until the next start.
      }
      return {
        ok: true,
        platform,
        items: listKeyboardShortcutRows(outcome.loaded.effective.keybindings, platform),
        keybindings: outcome.loaded.effective.keybindings,
        diagnostics: outcome.loaded.diagnostics
      };
    }
  );

  ipcMain.handle(
    KEYBINDINGS_CHANNELS.setCaptureMode,
    (event, enabled: unknown): SetKeybindingCaptureModeResult => {
      if (typeof enabled !== "boolean") {
        return { ok: false };
      }
      const senderId = (event as { sender?: { id?: number } } | undefined)?.sender?.id;
      return {
        ok: typeof senderId === "number" && setKeybindingCaptureActive(enabled, senderId)
      };
    }
  );
}
