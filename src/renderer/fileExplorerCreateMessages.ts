/**
 * #307: renderer-side glue between the pure {@link ./../shared/fileExplorerCreate}
 * helpers and the reusable {@link ./dialog/NameInputDialog}.
 *
 * It turns validation results and stable failure reasons into localized
 * messages, and builds the sanitized technical-copy payload shown after a
 * filesystem / IPC failure. It never resolves the project root and never
 * touches the filesystem.
 */
import {
  applyMarkdownFileExtension,
  validateFileExplorerName,
  type FileExplorerCreateFailureReason,
  type FileExplorerNameValidationError
} from "../shared/fileExplorerCreate";
import type { Translate, TranslationKey } from "../shared/i18n";
import type { NameInputDialogValidation } from "./dialog/NameInputDialog";

export type FileExplorerCreateKind = "file" | "folder";

const NAME_VALIDATION_MESSAGE_KEY: Record<
  FileExplorerNameValidationError,
  TranslationKey
> = {
  empty: "explorer.create.name.empty",
  dot: "explorer.create.name.dot",
  dotDot: "explorer.create.name.dotDot",
  separator: "explorer.create.name.separator",
  controlCharacter: "explorer.create.name.controlCharacter",
  reserved: "explorer.create.name.reserved"
};

const CREATE_FAILURE_MESSAGE_KEY: Record<
  FileExplorerCreateFailureReason,
  TranslationKey
> = {
  invalidName: "explorer.create.error.invalidName",
  reservedName: "explorer.create.error.reservedName",
  unsupportedExtension: "explorer.create.error.unsupportedExtension",
  noProject: "explorer.create.error.noProject",
  readOnlyProject: "explorer.create.error.readOnlyProject",
  outsideProjectRoot: "explorer.create.error.outsideProjectRoot",
  notDirectory: "explorer.create.error.notDirectory",
  alreadyExists: "explorer.create.error.alreadyExists",
  permissionDenied: "explorer.create.error.permissionDenied",
  targetDirectoryMissing: "explorer.create.error.targetDirectoryMissing",
  nameTooLong: "explorer.create.error.nameTooLong",
  noSpace: "explorer.create.error.noSpace",
  readOnlyFilesystem: "explorer.create.error.readOnlyFilesystem",
  unknown: "explorer.create.error.unknown"
};

export function fileExplorerNameValidationMessageKey(
  error: FileExplorerNameValidationError
): TranslationKey {
  return NAME_VALIDATION_MESSAGE_KEY[error];
}

export function fileExplorerCreateFailureMessageKey(
  reason: FileExplorerCreateFailureReason
): TranslationKey {
  return CREATE_FAILURE_MESSAGE_KEY[reason];
}

/**
 * Build the synchronous validator the dialog runs on every keystroke and on
 * submit. For `kind === "file"` it also applies the Markdown extension rule
 * so an unsupported extension is caught inline before any IPC call.
 */
export function createFileExplorerNameValidator(
  kind: FileExplorerCreateKind,
  translate: Translate
): (rawValue: string) => NameInputDialogValidation {
  return (rawValue: string): NameInputDialogValidation => {
    const validation = validateFileExplorerName(rawValue);

    if (!validation.ok) {
      return {
        state: "invalid",
        message: translate(
          fileExplorerNameValidationMessageKey(validation.error)
        )
      };
    }

    if (kind === "file") {
      const withExtension = applyMarkdownFileExtension(validation.name);

      if (!withExtension.ok) {
        return {
          state: "invalid",
          message: translate("explorer.create.error.unsupportedExtension")
        };
      }
    }

    return { state: "valid" };
  };
}

/**
 * The sanitized details offered by the dialog's technical-copy button after
 * a filesystem / IPC failure. Contains only: the operation, the stable
 * reason, the project-relative parent directory (never an absolute path),
 * the raw name the user typed, and a timestamp. No document contents, no
 * absolute paths, no raw exception text.
 */
export function fileExplorerCreateTechnicalDetails(input: {
  kind: FileExplorerCreateKind;
  reason: FileExplorerCreateFailureReason;
  parentRelativePath: string | null;
  requestedName: string;
  generatedAt?: string;
}): string {
  return [
    "Pergamum File Explorer create failed",
    `operation: ${input.kind === "file" ? "newMarkdownFile" : "newFolder"}`,
    `reason: ${input.reason}`,
    `parent: ${input.parentRelativePath ?? "(project root)"}`,
    `requestedName: ${input.requestedName}`,
    `generatedAt: ${input.generatedAt ?? new Date().toISOString()}`
  ].join("\n");
}
