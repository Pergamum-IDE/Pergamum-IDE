/**
 * #645: `keybindings.json` storage (main process only).
 *
 * The file lives next to Application Settings JSON (`settings.json`), in
 * `app.getPath("userData")`. There is no project-level keybindings file.
 * Reads never throw: a missing file is an empty list, and an unreadable or
 * malformed file yields diagnostics while the defaults stay usable. Writes go
 * through `writeFileAtomic`, so a failed write leaves the previous file
 * intact. Nothing here logs or returns file paths or file contents.
 */

import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applyKeybindingEdit,
  normalizeUserKeyNotation,
  parseUserKeybindingsJson,
  resolveEffectiveKeybindings,
  serializeUserKeybindingsJson,
  type EffectiveKeybindingResult,
  type KeybindingDiagnostic,
  type KeybindingEditConflict,
  type KeybindingEditFailureReason,
  type KeybindingEditRequest,
  type ParsedUserKeybindings,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../shared/keybindings";
import { writeFileAtomic } from "./atomicFileWrite";

export const keybindingsFileName = "keybindings.json";

/** `directory` defaults to the Application Settings directory (userData). */
export function getKeybindingsFilePath(
  directory: string = app.getPath("userData")
): string {
  return path.join(directory, keybindingsFileName);
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

export async function readUserKeybindings(
  directory?: string
): Promise<ParsedUserKeybindings> {
  let source: string;
  try {
    source = await fs.readFile(getKeybindingsFilePath(directory), "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return { entries: [], sourceIndices: [], diagnostics: [] };
    }
    const diagnostic: KeybindingDiagnostic = {
      code: "fileReadError",
      severity: "error",
      message: "keybindings.json could not be read; defaults are used"
    };
    return { entries: [], sourceIndices: [], diagnostics: [diagnostic] };
  }
  return parseUserKeybindingsJson(source);
}

/** Atomically writes the entries (creates the directory if missing). */
export async function writeUserKeybindings(
  entries: readonly UserKeybindingEntry[],
  directory?: string
): Promise<void> {
  await writeFileAtomic(
    getKeybindingsFilePath(directory),
    serializeUserKeybindingsJson(entries)
  );
}

export interface LoadedKeybindings {
  readonly userEntries: UserKeybindingEntry[];
  readonly effective: EffectiveKeybindingResult;
  /** Parse diagnostics followed by overlay diagnostics. */
  readonly diagnostics: KeybindingDiagnostic[];
}

/** Reads the file and overlays it on the defaults for `platform`. */
export async function loadKeybindings(
  platform: PergamumPlatform,
  directory?: string
): Promise<LoadedKeybindings> {
  const parsed = await readUserKeybindings(directory);
  const effective = resolveEffectiveKeybindings({
    platform,
    userEntries: parsed.entries,
    entryIndices: parsed.sourceIndices
  });
  return {
    userEntries: parsed.entries,
    effective,
    diagnostics: [...parsed.diagnostics, ...effective.diagnostics]
  };
}

let startupKeybindings: LoadedKeybindings | null = null;

/**
 * The keybindings applied at startup (#646): the Keyboard Shortcuts screen
 * shows THESE, not a fresh read of the file, so it reflects what is really in
 * effect. Edits to keybindings.json apply after a restart.
 */
export function setStartupKeybindings(loaded: LoadedKeybindings | null): void {
  startupKeybindings = loaded;
}

export function getStartupKeybindings(): LoadedKeybindings | null {
  return startupKeybindings;
}

/** Creates the keybindings.json directory if needed; returns it. */
export async function ensureKeybindingsDirectory(
  directory: string = app.getPath("userData")
): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export type SaveUserKeybindingsOutcome =
  | { readonly ok: true; readonly diagnostics: KeybindingDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: KeybindingDiagnostic[] };

/**
 * Validates `entries` against the overlay rules and writes them only when
 * there is no error diagnostic (warnings are fine). An invalid save leaves the
 * file untouched and returns the diagnostics.
 */
export async function saveUserKeybindings(
  entries: readonly UserKeybindingEntry[],
  platform: PergamumPlatform,
  directory?: string
): Promise<SaveUserKeybindingsOutcome> {
  // Same key spelling rule as reading the file (a single uppercase letter is
  // lowercased), so a save and a later read agree.
  const normalized = entries.map((entry) => ({
    ...entry,
    key: normalizeUserKeyNotation(entry.key)
  }));
  const { diagnostics } = resolveEffectiveKeybindings({
    platform,
    userEntries: normalized
  });
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics };
  }
  await writeUserKeybindings(normalized, directory);
  return { ok: true, diagnostics };
}

export type ApplyKeybindingChangeOutcome =
  | {
      readonly ok: true;
      /** The keybindings now in effect (re-resolved from the saved file). */
      readonly loaded: LoadedKeybindings;
    }
  | {
      readonly ok: false;
      readonly reason: KeybindingEditFailureReason | "fileInvalid" | "saveFailed";
      readonly diagnostics: KeybindingDiagnostic[];
      readonly conflict?: KeybindingEditConflict;
    };

/**
 * #647: one Keyboard Shortcuts edit (change / unbind / reset).
 *
 * 1. Reads the user entries from keybindings.json. A malformed / unreadable
 *    file is NEVER overwritten: the edit is refused (`fileInvalid`).
 * 2. Applies the edit with the shared helpers (conflict + reserved checks).
 * 3. Only then writes atomically, re-resolves the effective keybindings and
 *    makes them the applied set. Any failure leaves the file and the applied
 *    set untouched.
 */
export async function applyKeybindingChange(
  request: KeybindingEditRequest,
  platform: PergamumPlatform,
  directory?: string
): Promise<ApplyKeybindingChangeOutcome> {
  const parsed = await readUserKeybindings(directory);
  const fileProblems = parsed.diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === "jsonParseError" ||
      diagnostic.code === "rootMustBeArray" ||
      diagnostic.code === "fileReadError"
  );
  if (fileProblems.length > 0) {
    return { ok: false, reason: "fileInvalid", diagnostics: fileProblems };
  }

  const edit = applyKeybindingEdit({
    platform,
    entries: parsed.entries,
    request
  });
  if (!edit.ok) {
    return {
      ok: false,
      reason: edit.reason,
      diagnostics: edit.diagnostics,
      ...(edit.conflict === undefined ? {} : { conflict: edit.conflict })
    };
  }

  try {
    await writeUserKeybindings(edit.entries, directory);
  } catch {
    return {
      ok: false,
      reason: "saveFailed",
      diagnostics: [
        {
          code: "fileWriteError",
          severity: "error",
          message: "keybindings.json could not be saved"
        }
      ]
    };
  }

  const loaded = await loadKeybindings(platform, directory);
  setStartupKeybindings(loaded);
  return { ok: true, loaded };
}
