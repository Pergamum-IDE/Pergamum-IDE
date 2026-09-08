import { useEffect, useRef } from "react";
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

/**
 * #414 (C2): shown BEFORE a File Explorer move / rename of supported image
 * files, once, when the project's Markdown documents contain — in total — at
 * least one project-local image link that resolves to a moved image's OLD
 * path and would therefore point at nothing after the move.
 *
 *   - update  (`更新する` / batch: `一括更新する`) — run the move, then
 *     rewrite every affected reference to the images' new paths.
 *   - skip    (`更新しない` / batch: `どれも更新しない`) — run the move only;
 *     leave every Markdown body untouched (#411 diagnostics will flag anything
 *     that ends up broken).
 *   - cancel  (`キャンセル`) — abort the move entirely.
 *
 * The batch wording is used when more than one image OR more than one
 * document is involved. The total reference count is always shown; the
 * affected-image and affected-document counts are shown when > 1. The Glossary
 * exclusion note is ALWAYS shown — #414 does not touch Glossary image links.
 * The three RESULTS (update / skip / cancel) and their meanings are identical
 * regardless of wording.
 */
export interface MarkdownImageReferenceMoveUpdateDialogProps {
  readonly referenceCount: number;
  readonly documentCount: number;
  readonly imageCount: number;
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onUpdate: () => void;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
}

export function MarkdownImageReferenceMoveUpdateDialog({
  referenceCount,
  documentCount,
  imageCount,
  translate,
  opener,
  onUpdate,
  onKeep,
  onCancel
}: MarkdownImageReferenceMoveUpdateDialogProps): JSX.Element {
  const updateButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    updateButtonRef.current?.focus();
  }, []);

  const isBatch = imageCount > 1 || documentCount > 1;

  return (
    <InfoDialog
      title={translate("explorer.move.imageReferenceUpdate.title")}
      opener={opener}
      onClose={onCancel}
      className="markdownImageReferenceMoveUpdateDialog"
      footer={
        <div className="appDialogActions">
          <button
            ref={updateButtonRef}
            type="button"
            className="appDialogButton appDialogButton-confirm markdownImageReferenceMoveUpdateApply"
            onClick={onUpdate}
          >
            {translate(
              isBatch
                ? "explorer.move.imageReferenceUpdate.update.batch"
                : "explorer.move.imageReferenceUpdate.update"
            )}
          </button>
          <button
            type="button"
            className="appDialogButton markdownImageReferenceMoveUpdateKeep"
            onClick={onKeep}
          >
            {translate(
              isBatch
                ? "explorer.move.imageReferenceUpdate.keep.batch"
                : "explorer.move.imageReferenceUpdate.keep"
            )}
          </button>
          <button
            type="button"
            className="appDialogButton markdownImageReferenceMoveUpdateCancel"
            onClick={onCancel}
          >
            {translate("common.cancel")}
          </button>
        </div>
      }
    >
      <p className="markdownImageReferenceMoveUpdateDescription">
        {translate("explorer.move.imageReferenceUpdate.description")}
      </p>
      {imageCount > 1 ? (
        <p
          className="markdownImageReferenceMoveUpdateImageCount"
          data-testid="markdownImageReferenceMoveUpdateImageCount"
        >
          {translate("explorer.move.imageReferenceUpdate.imageCount", {
            count: imageCount
          })}
        </p>
      ) : null}
      {documentCount > 1 ? (
        <p
          className="markdownImageReferenceMoveUpdateDocumentCount"
          data-testid="markdownImageReferenceMoveUpdateDocumentCount"
        >
          {translate("explorer.move.imageReferenceUpdate.documentCount", {
            count: documentCount
          })}
        </p>
      ) : null}
      <p
        className="markdownImageReferenceMoveUpdateCount"
        data-testid="markdownImageReferenceMoveUpdateCount"
      >
        {translate("explorer.move.imageReferenceUpdate.count", {
          count: referenceCount
        })}
      </p>
      <p
        className="markdownImageReferenceMoveUpdateGlossaryNote"
        data-testid="markdownImageReferenceMoveUpdateGlossaryNote"
      >
        {translate("explorer.move.imageReferenceUpdate.glossaryNote")}
      </p>
    </InfoDialog>
  );
}
