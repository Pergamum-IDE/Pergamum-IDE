import type { DebugLogReason } from "./debugLog";

/**
 * #501 slice 6 remediation: the ONE piece of a thrown `SanitizedFileIoError`
 * that Electron's `ipcMain.handle` reliably forwards to a rejected
 * `ipcRenderer.invoke()` promise in the renderer is the Error's `message` —
 * custom own properties such as `.reason` / `.code` are not a trusted
 * cross-IPC channel (this codebase's own convention elsewhere is to RETURN a
 * structured `{ reason, ... }` result instead of relying on that; see
 * `startupProjectOpenFailureResult` in `projectIpc.ts`). `sanitizedFileIoError`
 * already encodes `reason` into the message text for exactly this reason, so
 * this module is the single shared place that both writes that format (main)
 * and reads it back (renderer) — never duplicate the prefix elsewhere.
 */
const SANITIZED_FILE_IO_ERROR_MESSAGE_PREFIX = "File I/O failed: ";

export function sanitizedFileIoErrorMessage(reason: DebugLogReason): string {
  return `${SANITIZED_FILE_IO_ERROR_MESSAGE_PREFIX}${reason}`;
}

/**
 * Recovers the `reason` a `SanitizedFileIoError` was constructed with from
 * its `.message` alone — the only part of the error guaranteed to survive an
 * `ipcMain.handle` throw crossing back to the renderer. Returns `null` for
 * any message not in that exact format (including ordinary, non-sanitized
 * errors), so callers must treat a `null` result as "unknown / generic
 * failure", never assume a specific reason.
 */
export function sanitizedFileIoErrorReasonFromMessage(
  message: string
): DebugLogReason | null {
  return message.startsWith(SANITIZED_FILE_IO_ERROR_MESSAGE_PREFIX)
    ? (message.slice(
        SANITIZED_FILE_IO_ERROR_MESSAGE_PREFIX.length
      ) as DebugLogReason)
    : null;
}
