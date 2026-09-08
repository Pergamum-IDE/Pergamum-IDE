import { useEffect, useRef } from "react";
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

/**
 * #413: shown BEFORE a File Explorer Move, once, when the explicitly-selected
 * Markdown documents changing parent folder contain — in total — at least one
 * project-local image link whose relative destination would need updating to
 * keep pointing at the same image.
 *
 *   - update  (`更新する` / batch: `一括更新する`) — run the Move, then
 *     rewrite the image links in every affected document.
 *   - skip    (`更新しない` / batch: `どれも更新しない`) — run the Move only;
 *     leave every body untouched (#411 diagnostics will flag anything that
 *     ends up broken).
 *   - cancel  (`キャンセル`) — abort the Move entirely.
 *
 * The button wording (and the body text) switches to the batch phrasing when
 * `documentCount > 1`; the three RESULTS (update / skip / cancel) and their
 * meanings are identical either way. The total count of affected links is
 * always shown; the affected-document count is shown too for a batch. Initial
 * focus is the primary update button — the user has already asked for the
 * Move; Enter accepts the reference-preserving rewrite.
 */
export interface MarkdownImageLinkMoveUpdateDialogProps {
  readonly linkCount: number;
  readonly documentCount: number;
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onUpdate: () => void;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
}

export function MarkdownImageLinkMoveUpdateDialog({
  linkCount,
  documentCount,
  translate,
  opener,
  onUpdate,
  onKeep,
  onCancel
}: MarkdownImageLinkMoveUpdateDialogProps): JSX.Element {
  const updateButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    updateButtonRef.current?.focus();
  }, []);

  const isBatch = documentCount > 1;

  return (
    <InfoDialog
      title={translate("explorer.move.imageLinkUpdate.title")}
      opener={opener}
      onClose={onCancel}
      className="markdownImageLinkMoveUpdateDialog"
      footer={
        <div className="appDialogActions">
          <button
            ref={updateButtonRef}
            type="button"
            className="appDialogButton appDialogButton-confirm markdownImageLinkMoveUpdateApply"
            onClick={onUpdate}
          >
            {translate(
              isBatch
                ? "explorer.move.imageLinkUpdate.update.batch"
                : "explorer.move.imageLinkUpdate.update"
            )}
          </button>
          <button
            type="button"
            className="appDialogButton markdownImageLinkMoveUpdateKeep"
            onClick={onKeep}
          >
            {translate(
              isBatch
                ? "explorer.move.imageLinkUpdate.keep.batch"
                : "explorer.move.imageLinkUpdate.keep"
            )}
          </button>
          <button
            type="button"
            className="appDialogButton markdownImageLinkMoveUpdateCancel"
            onClick={onCancel}
          >
            {translate("common.cancel")}
          </button>
        </div>
      }
    >
      <p className="markdownImageLinkMoveUpdateDescription">
        {translate(
          isBatch
            ? "explorer.move.imageLinkUpdate.description.batch"
            : "explorer.move.imageLinkUpdate.description"
        )}
      </p>
      {documentCount > 1 ? (
        <p
          className="markdownImageLinkMoveUpdateDocumentCount"
          data-testid="markdownImageLinkMoveUpdateDocumentCount"
        >
          {translate("explorer.move.imageLinkUpdate.documentCount", {
            count: documentCount
          })}
        </p>
      ) : null}
      <p
        className="markdownImageLinkMoveUpdateCount"
        data-testid="markdownImageLinkMoveUpdateCount"
      >
        {translate("explorer.move.imageLinkUpdate.count", { count: linkCount })}
      </p>
    </InfoDialog>
  );
}
