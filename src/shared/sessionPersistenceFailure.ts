/**
 * #272 (PO decision): the taxonomy for "Session persistence cannot proceed
 * safely" — the storage-class failures that move the renderer's Session
 * persistence coordinator from ACTIVE to SUSPENDED.
 *
 * These are failures of the Session STORE (`<userData>/sessions/`), never of
 * Markdown document saving or the Project document data. A SUSPENDED
 * coordinator stops ordinary continuous persistence for the rest of the
 * app run; document editing / saving is completely unaffected.
 *
 * A `projectId`-unresolved condition is deliberately NOT here: it is a
 * transient logical state that self-heals once the live Project identity
 * resolves, and it must keep its existing retryable semantics.
 */

export const SESSION_STORAGE_FAILURE_CODE =
  "PERGAMUM_SESSION_STORAGE_FAILURE" as const;

export type SessionStorageFailureReason =
  | "lockUnavailable" // manifest lock acquire timeout / unavailable
  | "diskFull" // ENOSPC
  | "ioError" // EIO and similar storage I/O errors
  | "permissionDenied" // EACCES / EPERM / EROFS — cannot write the store
  | "manifestNotMutable" // present manifest cannot be safely overwritten
  | "slowIo" // a write did not complete within the slow-I/O threshold
  | "writeFailed"; // any other failure to make the Session durable

const REASONS: readonly SessionStorageFailureReason[] = [
  "lockUnavailable",
  "diskFull",
  "ioError",
  "permissionDenied",
  "manifestNotMutable",
  "slowIo",
  "writeFailed"
];

/**
 * A storage-class Session persistence failure. Its `message` embeds
 * `SESSION_STORAGE_FAILURE_CODE` and the `reason` so it stays classifiable
 * after crossing the IPC boundary (where custom Error subclasses / props
 * are flattened to a plain string).
 */
export class SessionStorageFailureError extends Error {
  readonly code = SESSION_STORAGE_FAILURE_CODE;

  constructor(
    readonly reason: SessionStorageFailureReason,
    detail?: string
  ) {
    super(
      `${SESSION_STORAGE_FAILURE_CODE}:${reason}${detail ? `: ${detail}` : ""}`
    );
    this.name = "SessionStorageFailureError";
  }
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

/** Map a raw filesystem / lock error to a storage-failure reason. */
export function sessionStorageFailureReasonFromError(
  error: unknown
): SessionStorageFailureReason {
  if (error instanceof SessionStorageFailureError) {
    return error.reason;
  }

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  if (name === "SessionManifestLockUnavailableError") {
    return "lockUnavailable";
  }

  if (name === "SessionManifestNotMutableError") {
    return "manifestNotMutable";
  }

  switch (nodeErrorCode(error)) {
    case "ENOSPC":
      return "diskFull";
    case "EIO":
    case "EBUSY":
    case "EAGAIN":
      return "ioError";
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return "permissionDenied";
    default:
      return "writeFailed";
  }
}

export function toSessionStorageFailureError(
  error: unknown
): SessionStorageFailureError {
  if (error instanceof SessionStorageFailureError) {
    return error;
  }

  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown");

  return new SessionStorageFailureError(
    sessionStorageFailureReasonFromError(error),
    detail
  );
}

/**
 * Whether `error` (possibly a re-thrown / IPC-flattened error) is a
 * storage-class Session persistence failure — i.e. one that should SUSPEND
 * the coordinator, as opposed to a transient logical condition
 * (`UnresolvedProjectIdentityError`) that should just be retried.
 */
export function isSessionStorageFailure(error: unknown): boolean {
  if (error instanceof SessionStorageFailureError) {
    return true;
  }

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string"
        ? error
        : "";

  return message.includes(SESSION_STORAGE_FAILURE_CODE);
}

/** Best-effort recovery of the reason from a classified error / message. */
export function sessionStorageFailureReason(
  error: unknown
): SessionStorageFailureReason {
  if (error instanceof SessionStorageFailureError) {
    return error.reason;
  }

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string"
        ? error
        : "";

  const marker = `${SESSION_STORAGE_FAILURE_CODE}:`;
  const at = message.indexOf(marker);

  if (at >= 0) {
    const rest = message.slice(at + marker.length);
    for (const reason of REASONS) {
      if (rest.startsWith(reason)) {
        return reason;
      }
    }
  }

  return "writeFailed";
}
