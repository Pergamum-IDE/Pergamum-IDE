import {
  SUPPORTED_MARKDOWN_FILE_EXTENSIONS,
  validateFileExplorerName,
  type FileExplorerNameValidationError
} from "./fileExplorerCreate";

export type FileExplorerRenameFailureReason =
  | "invalidName"
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
  | "reservedName"
  | "unsupportedExtension"
  | "samePath";

export type FileExplorerRenameNameResult =
  | { readonly ok: true; readonly name: string }
  | {
      readonly ok: false;
      readonly reason: FileExplorerRenameValidationFailureReason;
    };

export const FILE_EXPLORER_RENAME_VALIDATION_REASONS: ReadonlySet<FileExplorerRenameFailureReason> =
  new Set([
    "invalidName",
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

  if (input.kind === "file") {
    return applyMarkdownFileRenameExtension(
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
