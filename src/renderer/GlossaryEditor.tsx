import { useState } from "react";
import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { pergamumContextSurfaceAttribute } from "../shared/editContextMenu";
import { GlossaryAtomMatchFlagsEditor } from "./GlossaryAtomMatchFlagsEditor";
import {
  glossaryEntryDraftValidity,
  representativeGlossaryAtomDraft,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { representativeGlossarySurface } from "./glossaryPresentation";
import { GlossaryTagChip } from "./GlossaryTagChip";
import { MarkdownEditor } from "./MarkdownEditor";
import { markdownPreviewRenderer } from "./preview/markdownPreviewRenderer";

/** Private DataTransfer type — keeps atom reorder drags from mixing with
 *  File Explorer / tab reorder drags. */
const ATOM_REORDER_MIME = "application/x-pergamum-glossary-atom-reorder";

/** The grab-to-reorder glyph shown at the head of every atom row. */
const ATOM_DRAG_HANDLE_GLYPH = "⣿"; // ⣿

interface GlossaryEditorProps {
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  onChangeDescription: (description: string) => void;
  onAddAtom: () => void;
  onChangeAtomValue: (atomId: string, value: string) => void;
  onChangeAtomMatchFlags: (atomId: string, matchFlags: number) => void;
  onDeleteAtom: (atomId: string) => void;
  /**
   * #375: move `atomId` to array index `toIndex` (array order = `sortOrder`,
   * index 0 = representative). Driven by the per-row drag handle (D&D) and
   * its Arrow Up / Down keyboard fallback.
   */
  onReorderAtom: (atomId: string, toIndex: number) => void;
  onToggleTag: (tagId: string) => void;
  /**
   * #375: open the dedicated Glossary Tag Manager tab — the "I need a tag
   * that doesn't exist yet" escape hatch from the tag picker.
   */
  onOpenTagManager: () => void;
  onDeleteEntry: () => void;
  onNavigateToPreviousOccurrence: () => void;
  onNavigateToNextOccurrence: () => void;
  readOnly?: boolean;
}

export function GlossaryEditor({
  draft,
  availableTags,
  translate,
  onChangeDescription,
  onAddAtom,
  onChangeAtomValue,
  onChangeAtomMatchFlags,
  onDeleteAtom,
  onReorderAtom,
  onToggleTag,
  onOpenTagManager,
  onDeleteEntry,
  onNavigateToPreviousOccurrence,
  onNavigateToNextOccurrence,
  readOnly = false
}: GlossaryEditorProps): JSX.Element {
  // #375: transient drag state for atom reorder (D&D). `dropGap` is a slot
  // index in `[0, atoms.length]` — the position the dragged atom would land.
  const [draggedAtomId, setDraggedAtomId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  function clearAtomDrag(): void {
    setDraggedAtomId(null);
    setDropGap(null);
  }

  function atomDropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  const title =
    representativeGlossaryAtomDraft(draft)?.value.trim() ||
    representativeGlossarySurface(draft.entry);
  const descriptionHtml = markdownPreviewRenderer.render(draft.description);
  const validity = glossaryEntryDraftValidity(draft);
  const attachedTagIds = new Set(draft.tagIds);

  return (
    <section
      className="glossaryEditor"
      aria-label={translate("glossaryEditor.label")}
    >
      <header className="glossaryEditorHeader">
        <h1>{title}</h1>
        <button
          type="button"
          className="glossaryEditorOccurrenceButton"
          aria-label={translate("glossaryEditor.previousOccurrence")}
          title={translate("glossaryEditor.previousOccurrence")}
          onClick={onNavigateToPreviousOccurrence}
        >
          {translate("glossaryEditor.previousOccurrenceLabel")}
        </button>
        <button
          type="button"
          className="glossaryEditorOccurrenceButton"
          aria-label={translate("glossaryEditor.nextOccurrence")}
          title={translate("glossaryEditor.nextOccurrence")}
          onClick={onNavigateToNextOccurrence}
        >
          {translate("glossaryEditor.nextOccurrenceLabel")}
        </button>
        <button
          type="button"
          className="glossaryEditorDeleteButton"
          aria-label={translate("glossaryEditor.deleteEntry")}
          title={translate("glossaryEditor.deleteEntry")}
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) {
              onDeleteEntry();
            }
          }}
        >
          <span
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: deleteIcon }}
          />
        </button>
      </header>

      <section className="glossaryEditorSection">
        <h2>{translate("glossaryEditor.atoms.heading")}</h2>
        <ol className="glossaryEditorAtoms">
          {draft.atoms.map((atom, index) => {
            const reorderable = !readOnly && draft.atoms.length > 1;

            return (
              <li
                className="glossaryEditorAtomRow"
                key={atom.id}
                data-dragging={draggedAtomId === atom.id || undefined}
                data-drop-before={dropGap === index || undefined}
                data-drop-after={
                  dropGap === index + 1 && index === draft.atoms.length - 1
                    ? true
                    : undefined
                }
                onDragOver={(event) => {
                  if (
                    !reorderable ||
                    draggedAtomId === null ||
                    !Array.from(event.dataTransfer.types).includes(
                      ATOM_REORDER_MIME
                    )
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const gap = atomDropGapFor(event, index);
                  if (gap !== dropGap) {
                    setDropGap(gap);
                  }
                }}
                onDrop={(event) => {
                  if (!reorderable || draggedAtomId === null) {
                    return;
                  }
                  event.preventDefault();
                  const gap = atomDropGapFor(event, index);
                  const from = draft.atoms.findIndex(
                    (candidate) => candidate.id === draggedAtomId
                  );
                  const movedAtomId = draggedAtomId;
                  clearAtomDrag();
                  if (from !== -1) {
                    onReorderAtom(
                      movedAtomId,
                      gap > from ? gap - 1 : gap
                    );
                  }
                }}
              >
                <div className="glossaryEditorAtomRowMain">
                  <button
                    type="button"
                    className="glossaryEditorAtomDragHandle"
                    aria-label={translate("glossaryEditor.atoms.dragHandle")}
                    title={translate("glossaryEditor.atoms.dragHandle")}
                    draggable={reorderable}
                    disabled={!reorderable}
                    onDragStart={(event) => {
                      if (!reorderable) {
                        event.preventDefault();
                        return;
                      }
                      setDraggedAtomId(atom.id);
                      setDropGap(null);
                      event.dataTransfer.setData(ATOM_REORDER_MIME, atom.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={clearAtomDrag}
                    onKeyDown={(event) => {
                      if (!reorderable) {
                        return;
                      }
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        onReorderAtom(atom.id, index - 1);
                      } else if (
                        event.key === "ArrowDown" &&
                        index < draft.atoms.length - 1
                      ) {
                        event.preventDefault();
                        onReorderAtom(atom.id, index + 1);
                      }
                    }}
                  >
                    <span aria-hidden="true">{ATOM_DRAG_HANDLE_GLYPH}</span>
                  </button>
                  {index === 0 ? (
                    <span className="glossaryEditorAtomRepresentativeBadge">
                      {translate("glossaryEditor.atoms.representative")}
                    </span>
                  ) : null}
                  <input
                    type="text"
                    className="glossaryEditorAtomValue"
                    value={atom.value}
                    aria-label={translate("glossaryEditor.atoms.value")}
                    readOnly={readOnly}
                    {...{
                      [pergamumContextSurfaceAttribute]: "glossaryAtomValue"
                    }}
                    onChange={(event) => {
                      if (!readOnly) {
                        onChangeAtomValue(atom.id, event.target.value);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="glossaryEditorAtomRemoveButton"
                    aria-label={translate("glossaryEditor.atoms.remove")}
                    title={translate("glossaryEditor.atoms.remove")}
                    disabled={readOnly || draft.atoms.length === 1}
                    onClick={() => {
                      if (!readOnly) {
                        onDeleteAtom(atom.id);
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: deleteIcon }}
                    />
                  </button>
                </div>
                <GlossaryAtomMatchFlagsEditor
                  matchFlags={atom.matchFlags}
                  translate={translate}
                  readOnly={readOnly}
                  onChange={(matchFlags) =>
                    onChangeAtomMatchFlags(atom.id, matchFlags)
                  }
                />
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="glossaryEditorAddAtom"
          disabled={readOnly}
          onClick={() => {
            if (!readOnly) {
              onAddAtom();
            }
          }}
        >
          {translate("glossaryEditor.atoms.add")}
        </button>
        {!validity.ok ? (
          <p className="glossaryEditorValidityMessage" role="alert">
            {translate(
              validity.reason === "noAtoms"
                ? "glossaryEditor.validity.noAtoms"
                : "glossaryEditor.validity.duplicateAtomValue"
            )}
          </p>
        ) : null}
      </section>

      <section className="glossaryEditorSection glossaryEditorTags">
        <div className="glossaryEditorTagsHeader">
          <h2>{translate("glossaryEditor.tags.heading")}</h2>
          <button
            type="button"
            className="glossaryEditorTagsManageLink"
            onClick={onOpenTagManager}
          >
            {translate("glossaryEditor.tags.openManager")}
          </button>
        </div>
        {availableTags.length === 0 ? (
          <p className="glossaryEditorTagsEmpty">
            {translate("glossaryEditor.tags.noProjectTags")}
          </p>
        ) : (
          <ul className="glossaryEditorTagList">
            {availableTags.map((tag) => {
              const attached = attachedTagIds.has(tag.id);

              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    className="glossaryEditorTagToggle"
                    aria-pressed={attached}
                    aria-label={translate("glossaryEditor.tags.toggle")}
                    disabled={readOnly}
                    onClick={() => {
                      if (!readOnly) {
                        onToggleTag(tag.id);
                      }
                    }}
                  >
                    <GlossaryTagChip tag={tag} muted={!attached} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {availableTags.length > 0 && draft.tagIds.length === 0 ? (
          <p className="glossaryEditorTagsEmpty">
            {translate("glossaryEditor.tags.empty")}
          </p>
        ) : null}
      </section>

      <section className="glossaryEditorSection glossaryEditorDescription">
        <h2>{translate("glossaryEditor.description")}</h2>
        <div className="workspace glossaryEditorDescriptionWorkspace">
          <section
            className="pane"
            aria-label={translate("workspace.markdownEditor")}
          >
            <MarkdownEditor
              value={draft.description}
              onChange={readOnly ? () => undefined : onChangeDescription}
              contextSurface="glossaryDescription"
              readOnly={readOnly}
            />
          </section>

          <section
            className="pane"
            aria-label={translate("workspace.markdownPreview")}
          >
            {draft.description.trim().length > 0 ? (
              <article
                className="preview glossaryDescriptionPreview"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : (
              <p className="glossaryEditorEmptyDescription">
                {translate("glossaryEditor.emptyDescription")}
              </p>
            )}
          </section>
        </div>
      </section>
    </section>
  );
}
