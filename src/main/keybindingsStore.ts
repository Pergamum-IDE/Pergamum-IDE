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
import { createHash } from "node:crypto";
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

/**
 * #650: identifies the content of keybindings.json that the main process has
 * recognised, without keeping the content. A missing file and an unreadable
 * file have fixed values; otherwise it is the SHA-256 of the text.
 */
export const MISSING_SOURCE_FINGERPRINT = "missing";
export const UNREADABLE_SOURCE_FINGERPRINT = "unreadable";

export function fingerprintKeybindingsSource(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface ReadKeybindingsResult {
  readonly parsed: ParsedUserKeybindings;
  readonly sourceFingerprint: string;
}

export async function readUserKeybindingsWithFingerprint(
  directory?: string
): Promise<ReadKeybindingsResult> {
  let source: string;
  try {
    source = await fs.readFile(getKeybindingsFilePath(directory), "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return {
        parsed: { entries: [], sourceIndices: [], diagnostics: [] },
        sourceFingerprint: MISSING_SOURCE_FINGERPRINT
      };
    }
    const diagnostic: KeybindingDiagnostic = {
      code: "fileReadError",
      severity: "error",
      message: "keybindings.json could not be read; defaults are used"
    };
    return {
      parsed: { entries: [], sourceIndices: [], diagnostics: [diagnostic] },
      sourceFingerprint: UNREADABLE_SOURCE_FINGERPRINT
    };
  }
  return {
    parsed: parseUserKeybindingsJson(source),
    sourceFingerprint: fingerprintKeybindingsSource(source)
  };
}

export async function readUserKeybindings(
  directory?: string
): Promise<ParsedUserKeybindings> {
  return (await readUserKeybindingsWithFingerprint(directory)).parsed;
}

/** The diagnostics that mean the file as a whole could not be used. */
export function fileLevelDiagnostics(
  diagnostics: readonly KeybindingDiagnostic[]
): KeybindingDiagnostic[] {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.code === "jsonParseError" ||
      diagnostic.code === "rootMustBeArray" ||
      diagnostic.code === "fileReadError"
  );
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
  /**
   * #650: the fingerprint of the keybindings.json content main currently
   * recognises. THE source of truth for "has the file changed?": startup,
   * Keyboard Shortcuts saves and external reloads all set it here.
   */
  readonly sourceFingerprint: string;
}

/** Reads the file and overlays it on the defaults for `platform`. */
export async function loadKeybindings(
  platform: PergamumPlatform,
  directory?: string
): Promise<LoadedKeybindings> {
  const { parsed, sourceFingerprint } =
    await readUserKeybindingsWithFingerprint(directory);
  const effective = resolveEffectiveKeybindings({
    platform,
    userEntries: parsed.entries,
    entryIndices: parsed.sourceIndices
  });
  return {
    userEntries: parsed.entries,
    effective,
    diagnostics: [...parsed.diagnostics, ...effective.diagnostics],
    sourceFingerprint
  };
}

let startupKeybindings: LoadedKeybindings | null = null;

/**
 * The keybindings CURRENTLY APPLIED (#646, #650): set at startup, replaced by
 * a Keyboard Shortcuts save and by an external reload of keybindings.json.
 * The Keyboard Shortcuts screen and `getEffectiveKeybindings` read THIS, never
 * the file, so a half-edited (malformed) file cannot leak into the app. Its
 * `sourceFingerprint` is the one record of which file content is recognised.
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

/**
 * #650: Keyboard Shortcuts saves and external reloads read, write and replace
 * the applied state one at a time.
 */
let keybindingsLock: Promise<unknown> = Promise.resolve();

function withKeybindingsLock<T>(task: () => Promise<T>): Promise<T> {
  const run = keybindingsLock.then(task, task);
  keybindingsLock = run.catch(() => undefined);
  return run;
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
export function applyKeybindingChange(
  request: KeybindingEditRequest,
  platform: PergamumPlatform,
  directory?: string
): Promise<ApplyKeybindingChangeOutcome> {
  return withKeybindingsLock(() =>
    applyKeybindingChangeLocked(request, platform, directory)
  );
}

async function applyKeybindingChangeLocked(
  request: KeybindingEditRequest,
  platform: PergamumPlatform,
  directory?: string
): Promise<ApplyKeybindingChangeOutcome> {
  const parsed = await readUserKeybindings(directory);
  const fileProblems = fileLevelDiagnostics(parsed.diagnostics);
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

  return writeAndApplyEntries(edit.entries, platform, directory);
}

/**
 * Writes the entries atomically and, only after the write succeeded, re-reads
 * and re-resolves the file and makes it the applied state (its fingerprint is
 * recorded here, so the watcher event of this very write is a no-op). A failed
 * write changes neither the file nor the applied state. Caller holds the lock.
 */
async function writeAndApplyEntries(
  entries: readonly UserKeybindingEntry[],
  platform: PergamumPlatform,
  directory?: string
): Promise<ApplyKeybindingChangeOutcome> {
  try {
    await writeUserKeybindings(entries, directory);
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

/**
 * #652: Reset All - replaces keybindings.json with an empty array (the file is
 * kept, never deleted). Unlike a single edit this is also a RECOVERY
 * operation: a malformed / invalid file is deliberately overwritten, so the
 * file-level protection of `applyKeybindingChange` does not apply. The lock,
 * the atomic write, the fingerprint ownership and the applied-state update are
 * the ones every other save uses.
 */
export function resetAllUserKeybindings(
  platform: PergamumPlatform,
  directory?: string
): Promise<ApplyKeybindingChangeOutcome> {
  return withKeybindingsLock(() => writeAndApplyEntries([], platform, directory));
}

export type ReloadKeybindingsOutcome =
  /** Nothing to do: same file content, or the same effective result. */
  | { readonly kind: "unchanged" }
  /** The file is malformed: the applied keybindings stay, only diagnostics changed. */
  | { readonly kind: "diagnosticsOnly"; readonly loaded: LoadedKeybindings }
  /** New effective keybindings were applied. */
  | { readonly kind: "applied"; readonly loaded: LoadedKeybindings };

export interface ReloadKeybindingsOptions {
  readonly directory?: string;
  /** One retry after a failed read (a half-written / locked file). */
  readonly readRetryDelayMs?: number;
  readonly delay?: (ms: number) => Promise<void>;
}

/**
 * #650: re-reads keybindings.json after an external change.
 *
 * - The disk fingerprint is compared with the applied state: the same content
 *   is a no-op (this also absorbs the watcher event of our own save).
 * - A malformed / unreadable file keeps the applied effective keybindings,
 *   replaces only the diagnostics and records the file fingerprint (so the
 *   same broken content is not reported again).
 * - A valid file (or a deleted one: no user entries) is resolved with the
 *   existing resolver and becomes the applied state.
 */
export function reloadKeybindingsFromDisk(
  platform: PergamumPlatform,
  options: ReloadKeybindingsOptions = {}
): Promise<ReloadKeybindingsOutcome> {
  return withKeybindingsLock(() => reloadLocked(platform, options));
}

async function reloadLocked(
  platform: PergamumPlatform,
  options: ReloadKeybindingsOptions
): Promise<ReloadKeybindingsOutcome> {
  const { directory } = options;
  let loaded = await loadKeybindings(platform, directory);
  if (loaded.sourceFingerprint === UNREADABLE_SOURCE_FINGERPRINT) {
    const delay =
      options.delay ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    await delay(options.readRetryDelayMs ?? 100);
    loaded = await loadKeybindings(platform, directory);
  }

  const current = getStartupKeybindings();
  if (current !== null && current.sourceFingerprint === loaded.sourceFingerprint) {
    return { kind: "unchanged" };
  }

  const fileProblems = fileLevelDiagnostics(loaded.diagnostics);
  if (fileProblems.length > 0 && current !== null) {
    const kept: LoadedKeybindings = {
      userEntries: current.userEntries,
      effective: current.effective,
      diagnostics: fileProblems,
      sourceFingerprint: loaded.sourceFingerprint
    };
    setStartupKeybindings(kept);
    return { kind: "diagnosticsOnly", loaded: kept };
  }

  setStartupKeybindings(loaded);
  if (
    current !== null &&
    sameJson(current.effective.keybindings, loaded.effective.keybindings) &&
    sameJson(current.diagnostics, loaded.diagnostics)
  ) {
    // A formatting-only edit: nothing to re-apply or announce.
    return { kind: "unchanged" };
  }
  return { kind: "applied", loaded };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
