/**
 * #307: pure helpers for the File Explorer pane's "New File" / "New Folder"
 * toolbar actions.
 *
 * Nothing here touches the filesystem or resolves the project root — that
 * stays in the main process. These functions:
 *   - validate a user-entered name before any filesystem call,
 *   - apply the Markdown extension rules for "New Markdown File",
 *   - map raw Node error codes to a small set of stable, localizable
 *     reasons so the UI never renders a raw exception message.
 *
 * Aligned with #305: browse/create only, never a destructive operation.
 */

/**
 * Names Pergamum reserves for its own data, plus common OS / SCM noise
 * files. Compared case-insensitively against the NFC-normalized, trimmed
 * input. `.pergamum.lock.stale-*` archived lock directories are matched by
 * prefix (see {@link isReservedFileExplorerName}).
 */
export const RESERVED_FILE_EXPLORER_NAMES: readonly string[] = [
  ".pergamum",
  ".pergamum.lock",
  ".pergamum_recovery",
  "pergamum.json",
  ".git",
  ".ds_store",
  "thumbs.db",
  "desktop.ini"
];

const STALE_LOCK_NAME_PREFIX = ".pergamum.lock.stale-";

export function isReservedFileExplorerName(rawName: string): boolean {
  const lower = rawName.normalize("NFC").trim().toLowerCase();

  if (lower.length === 0) {
    return false;
  }

  if (RESERVED_FILE_EXPLORER_NAMES.includes(lower)) {
    return true;
  }

  return lower.startsWith(STALE_LOCK_NAME_PREFIX);
}

/**
 * #311: true when any segment of a project-relative path is a reserved /
 * hidden name (see {@link isReservedFileExplorerName}). Direct
 * `projects:listFileExplorerChildren` requests are rejected — without a
 * filesystem scan — when this returns true, e.g. `.git`,
 * `foo/.pergamum_recovery`, `foo/.pergamum.lock.stale-20260830`. Accepts
 * `/` or `\` separators; the project root (`null` / empty) is never reserved.
 */
export function pathHasReservedFileExplorerSegment(
  relativePath: string | null
): boolean {
  if (relativePath === null || relativePath.length === 0) {
    return false;
  }

  return relativePath
    .split(/[/\\]/)
    .some((segment) => isReservedFileExplorerName(segment));
}

export type FileExplorerNameValidationError =
  | "empty"
  | "dot"
  | "dotDot"
  | "separator"
  | "controlCharacter"
  | "reserved";

export type FileExplorerNameValidationResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: FileExplorerNameValidationError };


/**
 * True when the string contains NUL or any other C0 control / DEL — none
 * of which may reach a filesystem call.
 */
function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Reject obviously invalid names before any filesystem operation. Returns
 * the NFC-normalized, trimmed name on success.
 */
export function validateFileExplorerName(
  rawName: string
): FileExplorerNameValidationResult {
  const name = rawName.normalize("NFC").trim();

  if (name.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (name === ".") {
    return { ok: false, error: "dot" };
  }

  if (name === "..") {
    return { ok: false, error: "dotDot" };
  }

  if (name.includes("/") || name.includes("\\")) {
    return { ok: false, error: "separator" };
  }

  if (containsControlCharacter(name)) {
    return { ok: false, error: "controlCharacter" };
  }

  if (isReservedFileExplorerName(name)) {
    return { ok: false, error: "reserved" };
  }

  return { ok: true, name };
}

export const SUPPORTED_MARKDOWN_FILE_EXTENSIONS: readonly string[] = [
  ".md",
  ".markdown"
];

export type MarkdownFileNameResult =
  | { readonly ok: true; readonly fileName: string }
  | { readonly ok: false; readonly error: "unsupportedExtension" };

/**
 * "New Markdown File" extension rule: keep a supported extension
 * (`.md` / `.markdown`, case-insensitive), append `.md` when no extension
 * was entered, and reject any other extension. Expects an already-validated
 * name (no separators, not `.` / `..`).
 */
export function applyMarkdownFileExtension(
  name: string
): MarkdownFileNameResult {
  const lastDotIndex = name.lastIndexOf(".");

  // No dot, or a leading-dot-only name (e.g. ".keep") → treat as "no
  // extension entered" and append the default.
  if (lastDotIndex <= 0) {
    return { ok: true, fileName: `${name}.md` };
  }

  const extension = name.slice(lastDotIndex).toLowerCase();

  if (SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(extension)) {
    return { ok: true, fileName: name };
  }

  return { ok: false, error: "unsupportedExtension" };
}

/**
 * Every stable reason a File Explorer create can fail with. The renderer
 * maps each to a localized message; the raw Node error / exception text is
 * never surfaced.
 */
export type FileExplorerCreateFailureReason =
  | "invalidName"
  | "reservedName"
  | "unsupportedExtension"
  | "noProject"
  | "readOnlyProject"
  | "outsideProjectRoot"
  | "notDirectory"
  | "alreadyExists"
  | "permissionDenied"
  | "targetDirectoryMissing"
  | "nameTooLong"
  | "noSpace"
  | "readOnlyFilesystem"
  | "unknown";

/** Reasons that come from user input, not from a filesystem/IPC failure. */
export const FILE_EXPLORER_CREATE_VALIDATION_REASONS: ReadonlySet<FileExplorerCreateFailureReason> =
  new Set(["invalidName", "reservedName", "unsupportedExtension"]);

export function isFileExplorerCreateValidationReason(
  reason: FileExplorerCreateFailureReason
): boolean {
  return FILE_EXPLORER_CREATE_VALIDATION_REASONS.has(reason);
}

export function fileExplorerCreateFailureReasonFromValidationError(
  error: FileExplorerNameValidationError
): FileExplorerCreateFailureReason {
  return error === "reserved" ? "reservedName" : "invalidName";
}

/**
 * Map a raw Node `error.code` from a create call to a stable reason. The
 * caller must never pass the raw `Error` on to the UI.
 */
export function fileExplorerCreateFailureReasonFromErrorCode(
  code: string | undefined
): FileExplorerCreateFailureReason {
  switch (code) {
    case "EEXIST":
      return "alreadyExists";
    case "EACCES":
    case "EPERM":
      return "permissionDenied";
    case "ENOENT":
      return "targetDirectoryMissing";
    case "ENOTDIR":
      return "notDirectory";
    case "ENAMETOOLONG":
      return "nameTooLong";
    case "ENOSPC":
      return "noSpace";
    case "EROFS":
      return "readOnlyFilesystem";
    default:
      return "unknown";
  }
}
