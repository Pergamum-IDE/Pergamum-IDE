/**
 * #313: renderer-side glue for File Explorer Rename v1.
 *
 * The dialog validates names locally for fast feedback, but the main process
 * remains the source of truth for filesystem safety. Technical details are
 * project-relative only and never include document contents or raw exception
 * text.
 */
import {
  validateFileExplorerName,
  type FileExplorerNameValidationError
} from "../shared/fileExplorerCreate";
import {
  validateFileExplorerRenameName,
  type FileExplorerRenameFailureReason,
  type FileExplorerRenameKind
} from "../shared/fileExplorerRename";
import type { Translate, TranslationKey } from "../shared/i18n";
import type { NameInputDialogValidation } from "./dialog/NameInputDialog";
import { fileExplorerNameValidationMessageKey } from "./fileExplorerCreateMessages";

const RENAME_FAILURE_MESSAGE_KEY: Record<
  FileExplorerRenameFailureReason,
  TranslationKey
> = {
  invalidName: "explorer.rename.error.invalidName",
  reservedName: "explorer.rename.error.reservedName",
  unsupportedExtension: "explorer.rename.error.unsupportedExtension",
  noProject: "explorer.rename.error.noProject",
  readOnlyProject: "explorer.rename.error.readOnlyProject",
  noSelection: "explorer.rename.error.noSelection",
  cannotRenameProjectRoot: "explorer.rename.error.cannotRenameProjectRoot",
  outsideProjectRoot: "explorer.rename.error.outsideProjectRoot",
  sourceMissing: "explorer.rename.error.sourceMissing",
  alreadyExists: "explorer.rename.error.alreadyExists",
  permissionDenied: "explorer.rename.error.permissionDenied",
  notDirectory: "explorer.rename.error.notDirectory",
  notFile: "explorer.rename.error.notFile",
  folderNotEmpty: "explorer.rename.error.folderNotEmpty",
  nameTooLong: "explorer.rename.error.nameTooLong",
  noSpace: "explorer.rename.error.noSpace",
  readOnlyFilesystem: "explorer.rename.error.readOnlyFilesystem",
  openDocumentDirty: "explorer.rename.error.openDocumentDirty",
  samePath: "explorer.rename.error.samePath",
  unknown: "explorer.rename.error.unknown"
};

export function fileExplorerRenameFailureMessageKey(
  reason: FileExplorerRenameFailureReason
): TranslationKey {
  return RENAME_FAILURE_MESSAGE_KEY[reason];
}

function renameValidationMessageKey(
  error: FileExplorerNameValidationError
): TranslationKey {
  return fileExplorerNameValidationMessageKey(error);
}

export function createFileExplorerRenameNameValidator(
  input: {
    kind: FileExplorerRenameKind;
    originalName: string;
  },
  translate: Translate
): (rawValue: string) => NameInputDialogValidation {
  return (rawValue: string): NameInputDialogValidation => {
    const baseValidation = validateFileExplorerName(rawValue);

    if (!baseValidation.ok) {
      return {
        state: "invalid",
        message: translate(renameValidationMessageKey(baseValidation.error))
      };
    }

    const renameValidation = validateFileExplorerRenameName({
      kind: input.kind,
      originalName: input.originalName,
      newName: rawValue
    });

    if (!renameValidation.ok) {
      return {
        state: "invalid",
        message: translate(
          fileExplorerRenameFailureMessageKey(renameValidation.reason)
        )
      };
    }

    return { state: "valid" };
  };
}

export function fileExplorerRenameTechnicalDetails(input: {
  kind: FileExplorerRenameKind;
  reason: FileExplorerRenameFailureReason;
  sourceRelativePath: string;
  requestedName: string;
  generatedAt?: string;
}): string {
  return [
    "Pergamum File Explorer rename failed",
    `operation: ${input.kind === "file" ? "renameFile" : "renameFolder"}`,
    `reason: ${input.reason}`,
    `source: ${input.sourceRelativePath}`,
    `requestedName: ${input.requestedName}`,
    `generatedAt: ${input.generatedAt ?? new Date().toISOString()}`
  ].join("\n");
}
