import type { Translate } from "../../shared/i18n";
import {
  buildFileOperationFailureText,
  fileOperationFailureItemKindKey,
  type FileOperationFailureItem
} from "../fileOperationFailure";
import { InfoDialog } from "./InfoDialog";

/**
 * #340 blocker: a reusable list-style dialog for File Explorer file-operation
 * failures (Move today; Copy / Import / Rename later). It never explains a
 * single reason at length — it lists every failed item as
 * `kind + name + short reason` in a read-only textarea.
 *
 * The textarea is `readOnly` (NOT `disabled`) so the text stays selectable,
 * copyable, and full-contrast; it has a bounded height and scrolls
 * internally, so a large batch never stretches the dialog without limit.
 */
export interface FileOperationFailureDialogProps {
  /** Already-localized dialog title, e.g. "Could not move items". */
  readonly title: string;
  /** Already-localized one-line intro above the list. */
  readonly intro: string;
  readonly items: readonly FileOperationFailureItem[];
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onClose: () => void;
}

const MIN_TEXTAREA_ROWS = 4;
const MAX_TEXTAREA_ROWS = 14;

export function FileOperationFailureDialog({
  title,
  intro,
  items,
  translate,
  opener,
  onClose
}: FileOperationFailureDialogProps): JSX.Element {
  const detailText = buildFileOperationFailureText({
    items,
    kindLabel: (kind) => translate(fileOperationFailureItemKindKey(kind)),
    reasonLabel: translate("fileOperation.failure.reasonLabel")
  });

  const rows = Math.min(
    MAX_TEXTAREA_ROWS,
    Math.max(MIN_TEXTAREA_ROWS, detailText.split("\n").length)
  );

  return (
    <InfoDialog
      title={title}
      opener={opener}
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm fileOperationFailureDialogPrimary"
            onClick={onClose}
          >
            {translate("common.ok")}
          </button>
        </div>
      }
    >
      <div
        className="fileOperationFailureDialogBody"
        data-file-operation-failure="true"
      >
        <p className="fileOperationFailureDialogIntro">{intro}</p>
        <textarea
          className="fileOperationFailureDialogDetails"
          data-file-operation-failure-details="true"
          readOnly
          spellCheck={false}
          wrap="soft"
          rows={rows}
          value={detailText}
        />
      </div>
    </InfoDialog>
  );
}
