import {
  SUPPORTED_MARKDOWN_FILE_EXTENSIONS,
  validateFileExplorerName,
  type FileExplorerNameValidationError
} from "./fileExplorerCreate";

/**
 * #414: supported project image extensions the File Explorer may rename
 * (path-only — no format conversion). Mirrors the initial `#407` /
 * `imageAttachmentFormat` set: PNG, JPEG, GIF, WebP.
 */
export const RENAMABLE_IMAGE_FILE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp"
];

export type FileExplorerRenameFailureReason =
  | "invalidName"
  | "invalidCharacter"
  | "reservedName"
  | "unsupportedExtension"
  | "noProject"
  | "readOnlyProject"
  | "noSelection"
  | "cannotRenameProjectRoot"
  | "outsideProjectRoot"
  | "sourceMissing"
  | "alreadyExists"
  | "permissionDenied"
  | "notDirectory"
  | "notFile"
  | "folderNotEmpty"
  | "nameTooLong"
  | "noSpace"
  | "readOnlyFilesystem"
  | "openDocumentDirty"
  | "samePath"
  | "unknown";

export type FileExplorerRenameKind = "file" | "folder";

export type FileExplorerRenameValidationFailureReason =
  | "invalidName"
  | "invalidCharacter"
  | "reservedName"
  | "unsupportedExtension"
  | "samePath";

/**
 * Characters that are invalid in a file / folder name on Windows and best
 * rejected everywhere for a project that syncs across OSes. `/` and `\` are
 * already caught as `separator`, and control characters as `controlCharacter`,
 * by {@link validateFileExplorerName}; this covers the rest of the classic
 * reserved set.
 */
const RENAME_INVALID_NAME_CHARACTER_PATTERN = /[<>:"|?*]/;

export type FileExplorerRenameNameResult =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly reason: FileExplorerRenameValidationFailureReason;
    };

export const FILE_EXPLORER_RENAME_VALIDATION_REASONS: ReadonlySet<FileExplorerRenameFailureReason> =
  new Set([
    "invalidName",
    "invalidCharacter",
    "reservedName",
    "unsupportedExtension",
    "samePath"
  ]);

export function isFileExplorerRenameValidationReason(
  reason: FileExplorerRenameFailureReason
): boolean {
  return FILE_EXPLORER_RENAME_VALIDATION_REASONS.has(reason);
}

export function fileExplorerRenameFailureReasonFromValidationError(
  error: FileExplorerNameValidationError
): "invalidName" | "reservedName" {
  return error === "reserved" ? "reservedName" : "invalidName";
}

function extensionOfName(name: string): string | null {
  const lastDotIndex = name.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return null;
  }

  return name.slice(lastDotIndex).toLowerCase();
}

export function isSupportedMarkdownFileName(name: string): boolean {
  const extension = extensionOfName(name);

  return (
    extension !== null &&
    SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(extension)
  );
}

export function applyMarkdownFileRenameExtension(
  originalName: string,
  newName: string
): FileExplorerRenameNameResult {
  const originalExtension = extensionOfName(originalName);

  if (
    originalExtension === null ||
    !SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(originalExtension)
  ) {
    return { ok: false, reason: "unsupportedExtension" };
  }

  const newExtension = extensionOfName(newName);
  const finalName =
    newExtension === null ? `${newName}${originalExtension}` : newName;

  if (
    newExtension !== null &&
    !SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(newExtension)
  ) {
    return { ok: false, reason: "unsupportedExtension" };
  }

  if (
    finalName.normalize("NFC").toLowerCase() ===
    originalName.normalize("NFC").toLowerCase()
  ) {
    return { ok: false, reason: "samePath" };
  }

  return { ok: true, name: finalName };
}

/**
 * #414: keep a file rename's extension consistent for BOTH project Markdown
 * documents and supported project image files (`.png` / `.jpg` / `.jpeg` /
 * `.gif` / `.webp`). A Markdown original routes to
 * {@link applyMarkdownFileRenameExtension} unchanged. An image original: a new
 * name without an extension keeps the original one; a new name with an
 * extension must ALSO be a supported image extension (a `.png` → `.jpg`
 * rename is allowed as a PATH change only — no format conversion happens).
 * Any other original → `unsupportedExtension` (unchanged behaviour).
 */
export function applyRenamableFileRenameExtension(
  originalName: string,
  newName: string
): FileExplorerRenameNameResult {
  const originalExtension = extensionOfName(originalName);

  if (
    originalExtension !== null &&
    SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(originalExtension)
  ) {
    return applyMarkdownFileRenameExtension(originalName, newName);
  }

  if (
    originalExtension === null ||
    !RENAMABLE_IMAGE_FILE_EXTENSIONS.includes(originalExtension)
  ) {
    return { ok: false, reason: "unsupportedExtension" };
  }

  const newExtension = extensionOfName(newName);
  const finalName =
    newExtension === null ? `${newName}${originalExtension}` : newName;

  if (
    newExtension !== null &&
    !RENAMABLE_IMAGE_FILE_EXTENSIONS.includes(newExtension)
  ) {
    return { ok: false, reason: "unsupportedExtension" };
  }

  if (
    finalName.normalize("NFC").toLowerCase() ===
    originalName.normalize("NFC").toLowerCase()
  ) {
    return { ok: false, reason: "samePath" };
  }

  return { ok: true, name: finalName };
}

export function validateFileExplorerRenameName(input: {
  readonly kind: FileExplorerRenameKind;
  readonly originalName: string;
  readonly newName: string;
}): FileExplorerRenameNameResult {
  const validation = validateFileExplorerName(input.newName);

  if (!validation.ok) {
    return {
      ok: false,
      reason: fileExplorerRenameFailureReasonFromValidationError(
        validation.error
      )
    };
  }

  // #414: reject Windows-invalid characters BEFORE the extension / same-name
  // checks, so `100<>.png` reports "invalid character" — never a misleading
  // `samePath` / filesystem `sourceMissing`.
  if (RENAME_INVALID_NAME_CHARACTER_PATTERN.test(validation.name)) {
    return { ok: false, reason: "invalidCharacter" };
  }

  if (input.kind === "file") {
    return applyRenamableFileRenameExtension(
      input.originalName,
      validation.name
    );
  }

  if (
    validation.name.normalize("NFC").toLowerCase() ===
    input.originalName.normalize("NFC").toLowerCase()
  ) {
    return { ok: false, reason: "samePath" };
  }

  return { ok: true, name: validation.name };
}

export function fileExplorerRenameFailureReasonFromErrorCode(
  code: string | undefined
): FileExplorerRenameFailureReason {
  switch (code) {
    case "ENOENT":
      return "sourceMissing";
    case "EEXIST":
    case "ENOTEMPTY":
      return "alreadyExists";
    case "EACCES":
    case "EPERM":
      return "permissionDenied";
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
