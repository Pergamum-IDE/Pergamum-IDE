/**
 * #650: live reload of an externally edited `keybindings.json` (main process).
 *
 * The watcher watches the DIRECTORY (not the file) and keeps only events for
 * `keybindings.json`: a single-file watch is lost when an editor saves through
 * a temp file + rename, and a directory watch also sees the file being created
 * or deleted. Events are debounced (trailing), then one reload runs at a time.
 *
 * The watcher owns NO record of the file content. Whether anything changed is
 * decided by `reloadKeybindingsFromDisk`, which compares the disk fingerprint
 * with the applied state's `sourceFingerprint` (the single source of truth,
 * also updated by startup and by Keyboard Shortcuts saves). So the event of
 * our own save, repeated events and a repeated malformed file are all no-ops.
 *
 * Nothing here logs or sends the file path or content.
 */

import { watch as nodeWatch } from "node:fs";
import {
  getKeybindingsFilePath,
  keybindingsFileName,
  reloadKeybindingsFromDisk,
  type LoadedKeybindings,
  type ReloadKeybindingsOutcome
} from "./keybindingsStore";
import type { PergamumPlatform } from "../shared/keybindings";
import type { KeybindingsChangedPayload } from "../shared/api";

export const KEYBINDINGS_WATCH_DEBOUNCE_MS = 300;
export const KEYBINDINGS_READ_RETRY_DELAY_MS = 100;
export const KEYBINDINGS_WATCH_REARM_DELAY_MS = 1000;

/** The subset of `fs.FSWatcher` the watcher uses (a fake in tests). */
export interface DirectoryWatcherHandle {
  close(): void;
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export type WatchDirectory = (
  directory: string,
  listener: (eventType: string, filename: string | Buffer | null) => void
) => DirectoryWatcherHandle;

export interface KeybindingsWatcherOptions {
  /** The directory that contains keybindings.json. */
  readonly directory: string;
  /** Runs after the debounce; failures are swallowed (the watcher keeps going). */
  readonly onChange: () => Promise<void> | void;
  readonly watchDirectory?: WatchDirectory;
  readonly debounceMs?: number;
  readonly rearmDelayMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface KeybindingsWatcher {
  start(): void;
  stop(): void;
}

function filenameMatches(filename: string | Buffer | null): boolean {
  // Some platforms report no file name: treat that as a possible change.
  if (filename === null) {
    return true;
  }
  return String(filename) === keybindingsFileName;
}

export function createKeybindingsWatcher(
  options: KeybindingsWatcherOptions
): KeybindingsWatcher {
  const debounceMs = options.debounceMs ?? KEYBINDINGS_WATCH_DEBOUNCE_MS;
  const rearmDelayMs = options.rearmDelayMs ?? KEYBINDINGS_WATCH_REARM_DELAY_MS;
  const setTimer =
    options.setTimer ??
    ((callback: () => void, ms: number): unknown => {
      const handle = setTimeout(callback, ms);
      handle.unref?.();
      return handle;
    });
  const clearTimer =
    options.clearTimer ??
    ((handle: unknown): void => clearTimeout(handle as NodeJS.Timeout));
  const watchDirectory: WatchDirectory =
    options.watchDirectory ??
    ((directory, listener) =>
      nodeWatch(directory, { persistent: false }, listener) as DirectoryWatcherHandle);

  let handle: DirectoryWatcherHandle | null = null;
  let debounceTimer: unknown = null;
  let rearmTimer: unknown = null;
  let stopped = true;
  let running = false;
  let rerunRequested = false;
  let rearmed = false;

  function schedule(): void {
    if (stopped) {
      return;
    }
    if (debounceTimer !== null) {
      clearTimer(debounceTimer);
    }
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      void run();
    }, debounceMs);
  }

  async function run(): Promise<void> {
    if (stopped) {
      return;
    }
    if (running) {
      rerunRequested = true;
      return;
    }
    running = true;
    try {
      await options.onChange();
    } catch {
      // A failed reload must never take the watcher (or the app) down.
    } finally {
      running = false;
    }
    if (rerunRequested && !stopped) {
      rerunRequested = false;
      schedule();
    }
  }

  function open(): void {
    try {
      const opened = watchDirectory(options.directory, (_eventType, filename) => {
        if (filenameMatches(filename)) {
          schedule();
        }
      });
      opened.on("error", () => {
        closeHandle();
        rearmOnce();
      });
      handle = opened;
    } catch {
      rearmOnce();
    }
  }

  function closeHandle(): void {
    if (handle !== null) {
      try {
        handle.close();
      } catch {
        // already closed
      }
      handle = null;
    }
  }

  /** The directory may have been removed / replaced: try once more later. */
  function rearmOnce(): void {
    if (stopped || rearmed) {
      return;
    }
    rearmed = true;
    rearmTimer = setTimer(() => {
      rearmTimer = null;
      if (!stopped) {
        open();
        // The file may have changed while nothing was watching.
        schedule();
      }
    }, rearmDelayMs);
  }

  return {
    start(): void {
      if (!stopped) {
        return;
      }
      stopped = false;
      rearmed = false;
      open();
    },
    stop(): void {
      stopped = true;
      rerunRequested = false;
      if (debounceTimer !== null) {
        clearTimer(debounceTimer);
        debounceTimer = null;
      }
      if (rearmTimer !== null) {
        clearTimer(rearmTimer);
        rearmTimer = null;
      }
      closeHandle();
    }
  };
}

export interface KeybindingsLiveReloadOptions {
  readonly platform: PergamumPlatform;
  readonly directory: string;
  /** Applies new effective keybindings (rebuilds the menu accelerators). */
  readonly applyToRuntime: (loaded: LoadedKeybindings) => Promise<void> | void;
  /** Tells the renderer something changed (payload carries no path / content). */
  readonly notify: (payload: KeybindingsChangedPayload) => void;
  readonly watchDirectory?: WatchDirectory;
  readonly debounceMs?: number;
  readonly readRetryDelayMs?: number;
  readonly rearmDelayMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly delay?: (ms: number) => Promise<void>;
}

/**
 * Starts watching and wires a reload to the existing runtime-apply path.
 * Returns the stop function.
 */
export function startKeybindingsLiveReload(
  options: KeybindingsLiveReloadOptions
): { stop: () => void; reloadNow: () => Promise<ReloadKeybindingsOutcome> } {
  let version = 0;

  const reloadNow = async (): Promise<ReloadKeybindingsOutcome> => {
    const outcome = await reloadKeybindingsFromDisk(options.platform, {
      directory: options.directory,
      ...(options.readRetryDelayMs === undefined
        ? {}
        : { readRetryDelayMs: options.readRetryDelayMs }),
      ...(options.delay === undefined ? {} : { delay: options.delay })
    });
    if (outcome.kind === "unchanged") {
      return outcome;
    }
    if (outcome.kind === "applied") {
      try {
        await options.applyToRuntime(outcome.loaded);
      } catch {
        // The applied state is already updated; only the menu may be stale.
      }
    }
    version += 1;
    options.notify({
      version,
      diagnosticsCount: outcome.loaded.diagnostics.length
    });
    return outcome;
  };

  const watcher = createKeybindingsWatcher({
    directory: options.directory,
    onChange: async () => {
      await reloadNow();
    },
    ...(options.watchDirectory === undefined
      ? {}
      : { watchDirectory: options.watchDirectory }),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
    ...(options.rearmDelayMs === undefined
      ? {}
      : { rearmDelayMs: options.rearmDelayMs }),
    ...(options.setTimer === undefined ? {} : { setTimer: options.setTimer }),
    ...(options.clearTimer === undefined ? {} : { clearTimer: options.clearTimer })
  });
  watcher.start();
  return { stop: () => watcher.stop(), reloadNow };
}

// Re-exported for tests that need the file location.
export { getKeybindingsFilePath };
