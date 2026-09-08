import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

export interface BulkTextImportDialogProps {
  readonly isOpen: boolean;
  readonly translate: Translate;
  readonly opener?: Element | null;
  readonly onClose: () => void;
}

export function BulkTextImportDialog({
  isOpen,
  translate,
  opener = null,
  onClose
}: BulkTextImportDialogProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <InfoDialog
      title={translate("textImport.dialog.title")}
      opener={opener}
      className="bulkTextImportDialog"
      dismissOnBackdropClick
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel bulkTextImportDialogCancelButton"
            autoFocus
            onClick={onClose}
          >
            {translate("textImport.dialog.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm bulkTextImportDialogImportButton"
            disabled
          >
            {translate("textImport.dialog.import")}
          </button>
        </div>
      }
    >
      <div className="bulkTextImportDialogContent">
        <p className="bulkTextImportDialogDescription">
          {translate("textImport.dialog.description")}
        </p>

        <section className="bulkTextImportDialogSection">
          <h3>{translate("textImport.dialog.destinationHeading")}</h3>
          <p className="bulkTextImportDialogPlaceholder">
            {translate("textImport.dialog.destinationPlaceholder")}
          </p>
        </section>

        <section className="bulkTextImportDialogDropArea">
          <p>{translate("textImport.dialog.dropPlaceholder")}</p>
        </section>

        <section className="bulkTextImportDialogSection">
          <h3>{translate("textImport.dialog.targetsHeading")}</h3>
          <p className="bulkTextImportDialogEmptyTargets">
            {translate("textImport.dialog.emptyTargets")}
          </p>
        </section>
      </div>
    </InfoDialog>
  );
}
