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
import {
  glossaryTagOrderChanged,
  reorderGlossaryTagIds
} from "./glossaryTagReorder";

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
   * #375: persist a new tag order (drag handle / Arrow keys). `tagIdsInOrder`
   * lists every project tag exactly once; the host re-packs `sort_order` and
   * refreshes every glossary consumer.
   */
  onReorderTags: (tagIdsInOrder: string[]) => Promise<unknown>;
  /** #375: entry count per tag id (how many glossary entries carry the tag). */
  entryCountByTagId?: Readonly<Record<string, number>>;
}

/** Private DataTransfer type — keeps tag reorder drags from mixing with File
 *  Explorer / tab / atom reorder drags. */
const TAG_REORDER_MIME = "application/x-pergamum-glossary-tag-reorder";

/** The grab-to-reorder glyph shown at the head of every tag row. */
const TAG_DRAG_HANDLE_GLYPH = "⣿";

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
  "glossary.tagManager.columns.entries",
  "glossary.tagManager.columns.createdAt",
  "glossary.tagManager.columns.updatedAt",
  "glossary.tagManager.columns.edit",
  "glossary.tagManager.columns.delete"
] as const;

/**
 * #375: the Glossary Tag Manager tab — a table-shaped management surface
 * (`[⣿ handle][chip][description][entries][created][updated][edit][delete]`),
 * an "Add tag" primary action (top-left, not a page heading), a modal
 * {@link GlossaryTagEditor} for create / edit, and drag-handle reorder of the
 * tag `sortOrder`. Delete goes back to the host for the shared destructive
 * confirm dialog. No bulk operations.
 *
 * Opening / mounting this tab NEVER opens the create modal — that is only the
 * "Add tag" button (`openEditor(createNewGlossaryTagDraft())`).
 */
export function GlossaryTagManager({
  tags,
  translate,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onReorderTags,
  entryCountByTagId = {}
}: GlossaryTagManagerProps): JSX.Element {
  // `null` = no modal. Only the "Add tag" button / an edit-icon click opens it.
  const [draft, setDraft] = useState<GlossaryTagDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const openerRef = useRef<Element | null>(null);

  // #375: transient drag state for tag reorder (D&D). `dropGap` is a slot
  // index in `[0, tags.length]` — the position the dragged tag would land.
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  const reorderable = tags.length > 1 && !busy;

  function clearDrag(): void {
    setDraggingTagId(null);
    setDropGap(null);
  }

  function dropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  function moveTag(fromIndex: number, toIndex: number): void {
    const currentIds = tags.map((tag) => tag.id);
    const nextOrder = reorderGlossaryTagIds(currentIds, fromIndex, toIndex);

    if (glossaryTagOrderChanged(currentIds, nextOrder)) {
      void onReorderTags(nextOrder);
    }
  }

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

          {tags.map((tag, index) => (
            <div
              className="glossaryTagManagerTableRow"
              role="row"
              key={tag.id}
              data-dragging={draggingTagId === tag.id || undefined}
              data-drop-before={dropGap === index || undefined}
              data-drop-after={
                dropGap === index + 1 && index === tags.length - 1
                  ? true
                  : undefined
              }
              onDragOver={(event) => {
                if (
                  !reorderable ||
                  draggingTagId === null ||
                  !Array.from(event.dataTransfer.types).includes(
                    TAG_REORDER_MIME
                  )
                ) {
                  return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const gap = dropGapFor(event, index);
                if (gap !== dropGap) {
                  setDropGap(gap);
                }
              }}
              onDrop={(event) => {
                if (!reorderable || draggingTagId === null) {
                  return;
                }
                event.preventDefault();
                const gap = dropGapFor(event, index);
                const fromIndex = tags.findIndex(
                  (candidate) => candidate.id === draggingTagId
                );
                clearDrag();
                if (fromIndex !== -1) {
                  moveTag(fromIndex, gap > fromIndex ? gap - 1 : gap);
                }
              }}
            >
              <span role="cell" className="glossaryTagManagerCell">
                <button
                  type="button"
                  className="glossaryTagManagerDragHandle"
                  aria-label={translate("glossary.tagManager.reorderHint")}
                  title={translate("glossary.tagManager.reorderHint")}
                  draggable={reorderable}
                  disabled={!reorderable}
                  onDragStart={(event) => {
                    if (!reorderable) {
                      event.preventDefault();
                      return;
                    }
                    setDraggingTagId(tag.id);
                    setDropGap(null);
                    event.dataTransfer.setData(TAG_REORDER_MIME, tag.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={clearDrag}
                  onKeyDown={(event) => {
                    if (!reorderable) {
                      return;
                    }
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      moveTag(index, index - 1);
                    } else if (
                      event.key === "ArrowDown" &&
                      index < tags.length - 1
                    ) {
                      event.preventDefault();
                      moveTag(index, index + 1);
                    }
                  }}
                >
                  <span aria-hidden="true">{TAG_DRAG_HANDLE_GLYPH}</span>
                </button>
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
                className="glossaryTagManagerCell glossaryTagManagerEntriesCell"
              >
                {entryCountByTagId[tag.id] ?? 0}
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
