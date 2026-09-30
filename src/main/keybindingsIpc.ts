/**
 * #645: IPC for user keybindings (responsibility-separated, like settingsIpc).
 *
 * The renderer gets plain serializable data only: never the file path and never
 * raw file text. `saveUserKeybindings` validates its payload shape strictly
 * and rejects (with diagnostics, writing nothing) a set that has any error.
 */

import { ipcMain } from "electron";
import {
  KEYBINDINGS_CHANNELS,
  type GetEffectiveKeybindingsResult,
  type GetUserKeybindingsResult,
  type SaveUserKeybindingsResult
} from "../shared/api";
import type {
  KeybindingDiagnostic,
  UserKeybindingEntry
} from "../shared/keybindings";
import {
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

const invalidRequestDiagnostic: KeybindingDiagnostic = {
  code: "entryMustBeObject",
  severity: "error",
  message:
    "The keybindings request must be an array of { key, command, when? } objects"
};

export function registerKeybindingsIpc(
  platformSource: NodeJS.Platform = process.platform
): void {
  const platform = nodePlatformToPergamumPlatform(platformSource);

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
}
