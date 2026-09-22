/**
 * #535: warns before overwriting existing files in the image-attachment
 * folder during "Insert image". All-or-nothing — confirming overwrites every
 * conflicting file in this batch; canceling cancels the whole insertion
 * (no partial copy, no partial Markdown insertion).
 */

import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

export interface ImageOverwriteConfirmDialogProps {
  readonly isOpen: boolean;
  readonly fileNames: readonly string[];
  readonly opener?: Element | null;
  readonly translate: Translate;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function ImageOverwriteConfirmDialogContent({
  fileNames,
  opener,
  translate,
  onConfirm,
  onCancel
}: Omit<ImageOverwriteConfirmDialogProps, "isOpen">): JSX.Element {
  return (
    <InfoDialog
      title={translate("imageInsertion.overwriteDialog.title")}
      opener={opener ?? null}
      className="imageOverwriteConfirmDialog"
      role="alertdialog"
      onClose={onCancel}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onCancel}
          >
            {translate("common.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            onClick={onConfirm}
            autoFocus
          >
            {translate("imageInsertion.overwriteDialog.confirm")}
          </button>
        </div>
      }
    >
      <p className="imageOverwriteConfirmDialogMessage">
        {translate("imageInsertion.overwriteDialog.message")}
      </p>
      <ul className="imageOverwriteConfirmDialogFileList">
        {fileNames.map((fileName) => (
          <li key={fileName}>{fileName}</li>
        ))}
      </ul>
    </InfoDialog>
  );
}

export function ImageOverwriteConfirmDialog(
  props: ImageOverwriteConfirmDialogProps
): JSX.Element | null {
  if (!props.isOpen) {
    return null;
  }
  return <ImageOverwriteConfirmDialogContent {...props} />;
}
