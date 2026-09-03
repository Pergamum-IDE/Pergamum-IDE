import { useRef, useState } from "react";
import editIcon from "../../assets/icons/feather/global/edit-2.svg?raw";
import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import type {
  CreateGlossaryTagInput,
  GlossaryTag,
  UpdateGlossaryTagInput
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";
import {
  GlossaryTagEditor,
  GLOSSARY_TAG_EDITOR_FORM_ID
} from "./GlossaryTagEditor";
import { InfoDialog } from "./dialog/InfoDialog";
import {
  createGlossaryTagDraftFromTag,
  createNewGlossaryTagDraft,
  glossaryTagDraftCreateInput,
  glossaryTagDraftUpdateInput,
  type GlossaryTagDraft
} from "./glossaryTagDraft";

interface GlossaryTagManagerProps {
  tags: readonly GlossaryTag[];
  translate: Translate;
  onCreateTag: (input: CreateGlossaryTagInput) => Promise<unknown>;
  onUpdateTag: (input: UpdateGlossaryTagInput) => Promise<unknown>;
  /**
   * Hard delete. The host confirms first through the Pergamum destructive
   * confirm dialog (the tag label is passed so it can name the target).
   */
  onDeleteTag: (tagId: string, tagLabel: string) => Promise<unknown>;
  /**
   * #375: open the "add tag" modal immediately (used when the Tag Manager
   * tab is opened from the Glossary Entry editor's "Manage tags" link).
   */
  autoStartCreate?: boolean;
}

/** `2026-09-03T12:34:56.000Z` → `2026-09-03`. Display-only; save values are
 *  never touched. Falls back to the raw string for a non-ISO value. */
function formatTagTimestamp(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? iso
    : date.toISOString().slice(0, 10);
}

const TABLE_COLUMN_KEYS = [
  "glossary.tagManager.columns.reorder",
  "glossary.tagManager.columns.tag",
  "glossary.tagManager.columns.description",
  "glossary.tagManager.columns.createdAt",
  "glossary.tagManager.columns.updatedAt",
  "glossary.tagManager.columns.edit",
  "glossary.tagManager.columns.delete"
] as const;

/**
 * #375: the Glossary Tag Manager tab — a table-shaped management surface
 * (`[⣿ handle][chip][description][created][updated][edit][delete]`), an
 * "Add tag" primary action instead of a page heading, and a modal
 * {@link GlossaryTagEditor} for create / edit. Delete goes back to the host
 * so it can show the shared destructive confirm dialog. No bulk operations.
 */
export function GlossaryTagManager({
  tags,
  translate,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  autoStartCreate = false
}: GlossaryTagManagerProps): JSX.Element {
  const [draft, setDraft] = useState<GlossaryTagDraft | null>(() =>
    autoStartCreate ? createNewGlossaryTagDraft() : null
  );
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const openerRef = useRef<Element | null>(null);

  function openEditor(next: GlossaryTagDraft): void {
    if (typeof document !== "undefined") {
      openerRef.current = document.activeElement;
    }
    setOperationError(null);
    setDraft(next);
  }

  function closeEditor(): void {
    setDraft(null);
    setOperationError(null);
  }

  async function submitEditor(): Promise<void> {
    if (!draft || busy) {
      return;
    }

    setBusy(true);
    setOperationError(null);

    try {
      if (draft.tagId === null) {
        await onCreateTag(glossaryTagDraftCreateInput(draft));
      } else {
        await onUpdateTag(glossaryTagDraftUpdateInput(draft));
      }

      setDraft(null);
    } catch {
      setOperationError(translate("glossaryTagEditor.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const isCreate = draft?.tagId === null;

  return (
    <section
      className="glossaryTagManager"
      aria-label={translate("glossary.tagManager.title")}
    >
      <div className="glossaryTagManagerActions">
        <button
          type="button"
          className="glossaryTagManagerAddButton"
          disabled={busy}
          onClick={() => openEditor(createNewGlossaryTagDraft())}
        >
          {translate("glossary.tagManager.addTag")}
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="glossaryTagManagerEmpty">
          {translate("glossary.tagManager.empty")}
        </p>
      ) : (
        <div
          className="glossaryTagManagerTable"
          role="table"
          aria-label={translate("glossary.tagManager.title")}
        >
          <div className="glossaryTagManagerTableRow glossaryTagManagerTableHead" role="row">
            {TABLE_COLUMN_KEYS.map((key) => (
              <span
                key={key}
                role="columnheader"
                className="glossaryTagManagerColumnHeader"
              >
                {translate(key)}
              </span>
            ))}
          </div>

          {tags.map((tag) => (
            <div
              className="glossaryTagManagerTableRow"
              role="row"
              key={tag.id}
            >
              <span role="cell" className="glossaryTagManagerCell">
                <span
                  className="glossaryTagManagerDragHandle"
                  role="img"
                  aria-label={translate("glossary.tagManager.reorderHint")}
                  title={translate("glossary.tagManager.reorderHint")}
                >
                  ⣿
                </span>
              </span>
              <span role="cell" className="glossaryTagManagerCell">
                <GlossaryTagChip tag={tag} />
              </span>
              <span
                role="cell"
                className="glossaryTagManagerCell glossaryTagManagerDescriptionCell"
                title={tag.description ?? ""}
              >
                {tag.description ? (
                  tag.description
                ) : (
                  <span className="glossaryTagManagerMuted">
                    {translate("glossary.tagManager.noDescription")}
                  </span>
                )}
              </span>
              <span
                role="cell"
                className="glossaryTagManagerCell glossaryTagManagerTimestampCell"
              >
                {formatTagTimestamp(tag.createdAt)}
              </span>
              <span
                role="cell"
                className="glossaryTagManagerCell glossaryTagManagerTimestampCell"
              >
                {formatTagTimestamp(tag.updatedAt)}
              </span>
              <span role="cell" className="glossaryTagManagerCell">
                <button
                  type="button"
                  className="glossaryTagManagerIconButton glossaryTagManagerEditButton"
                  aria-label={translate("glossary.tagManager.editTag")}
                  title={translate("glossary.tagManager.editTag")}
                  disabled={busy}
                  onClick={() =>
                    openEditor(createGlossaryTagDraftFromTag(tag))
                  }
                >
                  <span
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: editIcon }}
                  />
                </button>
              </span>
              <span role="cell" className="glossaryTagManagerCell">
                <button
                  type="button"
                  className="glossaryTagManagerIconButton glossaryTagManagerDeleteButton"
                  aria-label={translate("glossary.tagManager.deleteTag")}
                  title={translate("glossary.tagManager.deleteTag")}
                  disabled={busy}
                  onClick={() => {
                    void onDeleteTag(tag.id, tag.label);
                  }}
                >
                  <span
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: deleteIcon }}
                  />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <InfoDialog
          title={translate(
            isCreate
              ? "glossaryTagEditor.titleNew"
              : "glossaryTagEditor.titleEdit"
          )}
          opener={openerRef.current}
          onClose={closeEditor}
          className="glossaryTagEditorDialog"
          footer={
            <div className="appDialogActions">
              <button
                type="button"
                className="appDialogButton"
                disabled={busy}
                onClick={closeEditor}
              >
                {translate("glossaryTagEditor.cancel")}
              </button>
              <button
                type="submit"
                form={GLOSSARY_TAG_EDITOR_FORM_ID}
                className="appDialogButton appDialogButton-confirm"
                disabled={busy}
              >
                {translate(
                  isCreate
                    ? "glossaryTagEditor.create"
                    : "glossaryTagEditor.save"
                )}
              </button>
            </div>
          }
        >
          <GlossaryTagEditor
            draft={draft}
            translate={translate}
            busy={busy}
            operationError={operationError}
            onChange={setDraft}
            onSubmit={() => {
              void submitEditor();
            }}
          />
        </InfoDialog>
      ) : null}
    </section>
  );
}
