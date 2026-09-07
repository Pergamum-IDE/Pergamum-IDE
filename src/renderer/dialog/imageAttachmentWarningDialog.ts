/**
 * #407 B2: Warning dialog mapping for image attachment save failures.
 *
 * Converts `SaveImageAttachmentFailureReason` into `AppConfirmDialogOptions`
 * suitable for `dialogController.confirm(...)` or `confirmDialog(...)`.
 * Uses Pergamum's standard modal alert format (warning icon + single OK button).
 */

import type { AppConfirmDialogOptions } from "./appDialogTypes";
import type { Translate, TranslationKey } from "../../shared/i18n";
import type { SaveImageAttachmentFailureReason } from "../../shared/api";
import { formatImageByteSizeMiB } from "../../shared/imageAttachmentFormat";

export function buildImageAttachmentWarningDialogOptions(
  reason: SaveImageAttachmentFailureReason,
  translate: Translate,
  actualBytes?: number
): AppConfirmDialogOptions {
  let messageText: string;

  if (
    reason === "sizeOverflow" &&
    typeof actualBytes === "number" &&
    actualBytes > 0
  ) {
    const formattedActual = formatImageByteSizeMiB(actualBytes);
    messageText = `${translate("dialog.imageAttachment.failed.sizeOverflow")} (${formattedActual})`;
  } else {
    messageText = translate(
      `dialog.imageAttachment.failed.${reason}` as TranslationKey
    );
  }

  return {
    title: translate("dialog.imageAttachment.failed.title"),
    message: {
      kind: "plainText",
      text: messageText
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    clipboardText: null,
    dismissOnBackdropClick: false,
    confirmLabel: translate("common.ok"),
    cancelLabel: null
  };
}

export function buildImageAttachmentSettingsSaveFailedWarningDialogOptions(
  translate: Translate
): AppConfirmDialogOptions {
  return {
    title: translate("dialog.imageAttachment.settingsSaveFailed.title"),
    message: {
      kind: "plainText",
      text: translate("dialog.imageAttachment.settingsSaveFailed.message")
    },
    icon: {
      kind: "warning",
      tooltip: translate("dialog.icon.warning")
    },
    clipboardText: null,
    dismissOnBackdropClick: false,
    confirmLabel: translate("common.ok"),
    cancelLabel: null
  };
}