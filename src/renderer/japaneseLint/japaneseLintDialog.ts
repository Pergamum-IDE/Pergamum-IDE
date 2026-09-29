import type { Translate } from "../../shared/i18n";
import type { AppConfirmDialogOptions } from "../dialog/appDialogTypes";

/**
 * #625: the dialog shown when the instant Japanese expression check cannot run
 * because the document is too long. An Information dialog with a single OK
 * button (no cancel) - never a toast.
 */
export function createJapaneseLintTooLargeDialogOptions(
  translate: Translate
): AppConfirmDialogOptions {
  return {
    title: translate("japaneseLint.dialog.tooLarge.title"),
    message: {
      kind: "plainText",
      text: translate("japaneseLint.dialog.tooLarge.message")
    },
    icon: { kind: "info", tooltip: translate("dialog.icon.info") },
    clipboardText: null,
    dismissOnBackdropClick: false,
    confirmLabel: translate("common.ok"),
    cancelLabel: null
  };
}
