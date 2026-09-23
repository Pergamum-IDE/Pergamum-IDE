import { useState } from "react";
import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { pergamumContextSurfaceAttribute } from "../shared/editContextMenu";
import { GlossaryAtomMatchFlagsEditor } from "./GlossaryAtomMatchFlagsEditor";
import { GlossaryEntryTagAssignmentEditor } from "./GlossaryEntryTagAssignmentEditor";
import {
  addGlossaryEntryDraftAtom,
  assignGlossaryEntryDraftTag,
  deleteGlossaryEntryDraftAtom,
  glossaryEntryDraftValidity,
  reorderAssignedGlossaryEntryDraftTags,
  reorderGlossaryEntryDraftAtom,
  unassignGlossaryEntryDraftTag,
  updateGlossaryEntryDraftAtomMatchFlags,
  updateGlossaryEntryDraftAtomValue,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";

/** Private DataTransfer type — keeps atom reorder drags from mixing with
 *  File Explorer / tab reorder drags. */
const ATOM_REORDER_MIME = "application/x-pergamum-glossary-atom-reorder";

/** The grab-to-reorder glyph shown at the head of every atom row. */
const ATOM_DRAG_HANDLE_GLYPH = "⣿"; // ⣿

/**
 * The atom / tag editing callbacks, one per draft mutation. Shared by the
 * Glossary Entry Editor Pane (`GlossaryEditor`) and the glossary Description
 * tab's metadata panel (#573 Slice 5).
 */
export interface GlossaryEntryMetadataHandlers {
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
  /**
   * #375: ORDERED tag assignment (two-list editor). `onAssignTag` inserts a
   * tag at array index `toIndex` (right → left, or reorder within assigned);
   * `onUnassignTag` removes it (left → right); `onReorderAssignedTag` moves an
   * already-assigned tag. Index 0 is the entry's PRIMARY tag. Draft-only until
   * the entry is saved.
   */
  onAssignTag: (tagId: string, toIndex: number) => void;
  onUnassignTag: (tagId: string) => void;
  onReorderAssignedTag: (tagId: string, toIndex: number) => void;
}

/**
 * #573 Slice 5: maps every metadata callback onto the existing
 * `glossaryEntryDraft` mutation helpers through ONE draft updater, so the
 * pane session and the glossary Description tab edit a draft identically.
 */
export function glossaryEntryMetadataDraftHandlers(
  updateDraft: (
    update: (draft: GlossaryEntryDraft) => GlossaryEntryDraft
  ) => void
): GlossaryEntryMetadataHandlers {
  return {
    onAddAtom: () => updateDraft(addGlossaryEntryDraftAtom),
    onChangeAtomValue: (atomId, value) =>
      updateDraft((current) =>
        updateGlossaryEntryDraftAtomValue(current, atomId, value)
      ),
    onChangeAtomMatchFlags: (atomId, matchFlags) =>
      updateDraft((current) =>
        updateGlossaryEntryDraftAtomMatchFlags(current, atomId, matchFlags)
      ),
    onDeleteAtom: (atomId) =>
      updateDraft((current) => deleteGlossaryEntryDraftAtom(current, atomId)),
    onReorderAtom: (atomId, toIndex) =>
      updateDraft((current) =>
        reorderGlossaryEntryDraftAtom(current, atomId, toIndex)
      ),
    onAssignTag: (tagId, toIndex) =>
      updateDraft((current) =>
        assignGlossaryEntryDraftTag(current, tagId, toIndex)
      ),
    onUnassignTag: (tagId) =>
      updateDraft((current) => unassignGlossaryEntryDraftTag(current, tagId)),
    onReorderAssignedTag: (tagId, toIndex) =>
      updateDraft((current) =>
        reorderAssignedGlossaryEntryDraftTags(current, tagId, toIndex)
      )
  };
}

interface GlossaryEntryMetadataFieldsProps extends GlossaryEntryMetadataHandlers {
  draft: GlossaryEntryDraft;
  /** Every tag defined in the project, for the attach/detach picker. */
  availableTags: readonly GlossaryTag[];
  translate: Translate;
  /**
   * #375: open the dedicated Glossary Tag Manager tab — the "I need a tag
   * that doesn't exist yet" escape hatch from the tag picker.
   */
  onOpenTagManager: () => void;
  readOnly?: boolean;
}

/**
 * #573 Slice 5: the atom (表記 + match flags) and tag sections of a glossary
 * entry, extracted verbatim from `GlossaryEditor` so the glossary Description
 * tab can edit the same metadata. Includes the draft validity message.
 */
export function GlossaryEntryMetadataFields({
  draft,
  availableTags,
  translate,
  onAddAtom,
  onChangeAtomValue,
  onChangeAtomMatchFlags,
  onDeleteAtom,
  onReorderAtom,
  onAssignTag,
  onUnassignTag,
  onReorderAssignedTag,
  onOpenTagManager,
  readOnly = false
}: GlossaryEntryMetadataFieldsProps): JSX.Element {
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

  const validity = glossaryEntryDraftValidity(draft);

  return (
    <>
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
        <h2>{translate("glossaryEditor.tags.heading")}</h2>
        <GlossaryEntryTagAssignmentEditor
          assignedTagIds={draft.tagIds}
          projectTags={availableTags}
          translate={translate}
          readOnly={readOnly}
          onAssignTag={onAssignTag}
          onUnassignTag={onUnassignTag}
          onReorderAssignedTag={onReorderAssignedTag}
          onOpenTagManager={onOpenTagManager}
        />
      </section>

    </>
  );
}
