import type {
  ImageAttachmentPastePreparationResult,
  PendingImageAttachment
} from "./clipboardImageAttachment";
import type { SaveImageAttachmentFailureReason } from "../shared/api";
import type { SaveImageAttachmentPayload } from "../shared/imageAttachmentSaveResult";
import type { SaveImageAttachmentResult } from "../shared/api";
import type { Translate } from "../shared/i18n";
import type { EffectiveImageAttachmentSettings } from "../shared/settings";
import { markdownImageLinkForAttachment } from "../shared/markdownImageLink";

export interface ImageAttachmentPasteTarget {
  readonly documentId: string;
  readonly markdownRelativePath: string;
  readonly documentName: string;
  readonly isActive: boolean;
  readonly position: number;
}

export type ImageAttachmentPasteTargetInvalidReason =
  | "projectNotOpen"
  | "targetDocumentUnavailable"
  | "targetDocumentNotMarkdown"
  | "targetDocumentReadOnly"
  | "positionUnavailable"
  | "positionDeleted";

export type ImageAttachmentPasteTargetResolution =
  | { readonly ok: true; readonly target: ImageAttachmentPasteTarget }
  | {
      readonly ok: false;
      readonly reason: ImageAttachmentPasteTargetInvalidReason;
    };

export type ImageAttachmentPastePromptResult =
  | {
      readonly kind: "saved";
      readonly settings: EffectiveImageAttachmentSettings;
    }
  | { readonly kind: "cancelled" };

export interface ImageAttachmentPastePromptRequest {
  readonly pending: PendingImageAttachment;
  readonly currentSettings: EffectiveImageAttachmentSettings;
}

export interface InsertMarkdownImageLinkRequest {
  readonly pending: PendingImageAttachment;
  readonly target: ImageAttachmentPasteTarget;
  readonly markdownLink: string;
}

export type SaveProjectSettingsFromPromptResult =
  | "saved"
  | "targetStale"
  | "settingsSaveFailed";

export type ImageAttachmentPasteOrchestrationStatus =
  | "preparationFailed"
  | "targetInvalidBeforeSave"
  | "promptCancelled"
  | "settingsSaveFailed"
  | "targetInvalidAfterSettingsSaved"
  | "saveFailed"
  | "targetInvalidAfterSave"
  | "insertFailed"
  | "linkInserted"
  | "savedOnly"
  | "unexpectedError";

export interface ImageAttachmentPasteOrchestrationDeps {
  readonly translate: Translate;
  readonly getSettings: () => EffectiveImageAttachmentSettings;
  readonly resolveTarget: (
    pending: PendingImageAttachment
  ) => ImageAttachmentPasteTargetResolution;
  readonly clearPosition: (
    result: ImageAttachmentPastePreparationResult
  ) => void;
  readonly promptForSettings: (
    request: ImageAttachmentPastePromptRequest
  ) => Promise<ImageAttachmentPastePromptResult>;
  readonly saveProjectSettingsFromPrompt: (
    settings: EffectiveImageAttachmentSettings,
    pending: PendingImageAttachment
  ) => Promise<SaveProjectSettingsFromPromptResult>;
  readonly saveImageAttachment: (
    payload: SaveImageAttachmentPayload
  ) => Promise<SaveImageAttachmentResult>;
  readonly insertMarkdownLink: (
    request: InsertMarkdownImageLinkRequest
  ) => boolean;
  readonly showWarningDialog: (
    reason: SaveImageAttachmentFailureReason,
    actualBytes?: number
  ) => void | Promise<void>;
  readonly showSettingsSaveFailedDialog: () => void | Promise<void>;
  readonly showSuccessToast: (message: string) => void;
  readonly showInfoToast: (message: string) => void;
  readonly logUnexpectedError?: (error: unknown) => void;
}

function appendMultipleImageNotice(
  message: string,
  pending: PendingImageAttachment,
  translate: Translate
): string {
  if (!pending.hadMultipleImages || pending.ignoredAdditionalImageCount <= 0) {
    return message;
  }

  return `${message}\n${translate("notification.imageAttachment.multipleImages")}`;
}

function successToastForInsertedLink(
  target: ImageAttachmentPasteTarget,
  pending: PendingImageAttachment,
  translate: Translate
): string {
  const message = target.isActive
    ? translate("notification.imageAttachment.linkInserted")
    : translate("notification.imageAttachment.linkInsertedInDocument", {
        name: target.documentName
      });

  return appendMultipleImageNotice(message, pending, translate);
}

function successToastForSaveOnly(
  relativePath: string,
  pending: PendingImageAttachment,
  translate: Translate
): string {
  return appendMultipleImageNotice(
    translate("notification.imageAttachment.savedOnly", {
      path: relativePath
    }),
    pending,
    translate
  );
}

function targetChangedMessage(translate: Translate): string {
  return translate("notification.imageAttachment.targetChanged");
}

function targetFailureMessage(
  reason: ImageAttachmentPasteTargetInvalidReason,
  translate: Translate
): string {
  if (reason === "positionDeleted") {
    return translate("notification.imageAttachment.positionDeleted");
  }
  return translate("notification.imageAttachment.targetChanged");
}

function settingsSavedTargetChangedMessage(translate: Translate): string {
  return translate("notification.imageAttachment.settingsSavedTargetChanged");
}

function preparationFailureActualBytes(
  result: ImageAttachmentPastePreparationResult
): number | undefined {
  return result.ok ? undefined : result.actualBytes;
}

async function showWarning(
  deps: ImageAttachmentPasteOrchestrationDeps,
  reason: SaveImageAttachmentFailureReason,
  actualBytes?: number
): Promise<void> {
  await deps.showWarningDialog(reason, actualBytes);
}

export async function runImageAttachmentPasteOrchestration(
  result: ImageAttachmentPastePreparationResult,
  deps: ImageAttachmentPasteOrchestrationDeps
): Promise<ImageAttachmentPasteOrchestrationStatus> {
  let positionCleared = false;
  const clearPosition = (): void => {
    if (positionCleared) {
      return;
    }
    positionCleared = true;
    deps.clearPosition(result);
  };

  if (!result.ok) {
    clearPosition();
    await showWarning(
      deps,
      result.reason,
      preparationFailureActualBytes(result)
    );
    return "preparationFailed";
  }

  const { pending } = result;

  try {
    const initialTarget = deps.resolveTarget(pending);
    if (!initialTarget.ok) {
      clearPosition();
      deps.showInfoToast(
        targetFailureMessage(initialTarget.reason, deps.translate)
      );
      return "targetInvalidBeforeSave";
    }

    let settings = deps.getSettings();
    if (settings.saveDirectory.trim().length === 0) {
      const promptResult = await deps.promptForSettings({
        pending,
        currentSettings: settings
      });

      if (promptResult.kind === "cancelled") {
        clearPosition();
        return "promptCancelled";
      }

      const saveSettingsResult = await deps.saveProjectSettingsFromPrompt(
        promptResult.settings,
        pending
      );
      if (saveSettingsResult === "targetStale") {
        clearPosition();
        deps.showInfoToast(targetChangedMessage(deps.translate));
        return "targetInvalidBeforeSave";
      }
      if (saveSettingsResult === "settingsSaveFailed") {
        clearPosition();
        await deps.showSettingsSaveFailedDialog();
        return "settingsSaveFailed";
      }
      settings = promptResult.settings;

      const targetAfterSettingsSave = deps.resolveTarget(pending);
      if (!targetAfterSettingsSave.ok) {
        clearPosition();
        deps.showInfoToast(settingsSavedTargetChangedMessage(deps.translate));
        return "targetInvalidAfterSettingsSaved";
      }
    }

    const saveResult = await deps.saveImageAttachment({
      saveDirectory: settings.saveDirectory,
      bytes: pending.bytes,
      reportedMimeType: pending.reportedMimeType
    });

    if (!saveResult.ok) {
      clearPosition();
      await showWarning(
        deps,
        saveResult.reason,
        saveResult.actualBytes ?? pending.actualBytes
      );
      return "saveFailed";
    }

    if (!settings.insertMarkdownLink) {
      clearPosition();
      deps.showSuccessToast(
        successToastForSaveOnly(saveResult.relativePath, pending, deps.translate)
      );
      return "savedOnly";
    }

    const targetBeforeInsert = deps.resolveTarget(pending);
    if (!targetBeforeInsert.ok) {
      clearPosition();
      deps.showInfoToast(
        targetFailureMessage(targetBeforeInsert.reason, deps.translate)
      );
      return "targetInvalidAfterSave";
    }

    const markdownLink = markdownImageLinkForAttachment({
      markdownRelativePath: targetBeforeInsert.target.markdownRelativePath,
      imageRelativePath: saveResult.relativePath
    });

    const inserted = deps.insertMarkdownLink({
      pending,
      target: targetBeforeInsert.target,
      markdownLink
    });

    clearPosition();

    if (!inserted) {
      deps.showInfoToast(targetChangedMessage(deps.translate));
      return "insertFailed";
    }

    deps.showSuccessToast(
      successToastForInsertedLink(
        targetBeforeInsert.target,
        pending,
        deps.translate
      )
    );
    return "linkInserted";
  } catch (error) {
    deps.logUnexpectedError?.(error);
    clearPosition();
    await showWarning(deps, "ioError", pending.actualBytes);
    return "unexpectedError";
  }
}
