import { useState, type DragEvent } from "react";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { partitionGlossaryTagsForEntry } from "./glossaryEntryDraft";
import { GlossaryTagChip } from "./GlossaryTagChip";

/** Private DataTransfer type — keeps tag-assignment drags from mixing with
 *  atom / File Explorer / tab reorder drags. */
const TAG_ASSIGNMENT_MIME =
  "application/x-pergamum-glossary-entry-tag-assignment";

/** The grab-to-move glyph shown at the head of every tag row. */
const TAG_DRAG_HANDLE_GLYPH = "⣿";

type DragSource = "assigned" | "available";

interface GlossaryEntryTagAssignmentEditorProps {
  /** `draft.tagIds` — the entry's assigned tag ids, in ASSIGNMENT order. */
  assignedTagIds: readonly string[];
  /** Every project tag, in project-wide `sortOrder` order. */
  projectTags: readonly GlossaryTag[];
  translate: Translate;
  /** Assign `tagId` at array index `toIndex` (right → left, or reorder). */
  onAssignTag: (tagId: string, toIndex: number) => void;
  /** Unassign `tagId` (left → right). The Tag itself is untouched. */
  onUnassignTag: (tagId: string) => void;
  /** Move an already-assigned `tagId` to array index `toIndex`. */
  onReorderAssignedTag: (tagId: string, toIndex: number) => void;
  /** Open the dedicated Glossary Tag Manager tab. */
  onOpenTagManager: () => void;
  readOnly?: boolean;
}

/**
 * #375: the Glossary Entry editor's ORDERED tag assignment editor — two lists.
 * Left = assigned tags in entry assignment order (`⣿` D&D reorder; `tags[0]`
 * gets the #400 primary flag/shadow treatment via `GlossaryTagChip`). Right
 * = the remaining project tags in
 * project-wide `sortOrder`. Right → left assigns (at the drop slot), left →
 * right unassigns, left-list D&D reorders. The right list is NOT reorderable
 * here — project-wide order is the Tag Manager's job. Nothing is persisted
 * until the entry is saved (this only edits the draft).
 */
export function GlossaryEntryTagAssignmentEditor({
  assignedTagIds,
  projectTags,
  translate,
  onAssignTag,
  onUnassignTag,
  onReorderAssignedTag,
  onOpenTagManager,
  readOnly = false
}: GlossaryEntryTagAssignmentEditorProps): JSX.Element {
  const { assigned, available } = partitionGlossaryTagsForEntry(
    assignedTagIds,
    projectTags
  );

  const [drag, setDrag] = useState<
    { tagId: string; from: DragSource } | null
  >(null);
  // Slot index in `[0, assigned.length]` the dragged tag would land at.
  const [assignedDropGap, setAssignedDropGap] = useState<number | null>(null);
  const [availableDropActive, setAvailableDropActive] = useState(false);

  const interactive = !readOnly && projectTags.length > 0;

  function clearDrag(): void {
    setDrag(null);
    setAssignedDropGap(null);
    setAvailableDropActive(false);
  }

  function dropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  function carriesTagAssignment(dataTransfer: DataTransfer): boolean {
    return Array.from(dataTransfer.types).includes(TAG_ASSIGNMENT_MIME);
  }

  function beginDrag(
    event: DragEvent<HTMLElement>,
    tagId: string,
    from: DragSource
  ): void {
    if (!interactive) {
      event.preventDefault();
      return;
    }
    setDrag({ tagId, from });
    setAssignedDropGap(null);
    setAvailableDropActive(false);
    event.dataTransfer.setData(TAG_ASSIGNMENT_MIME, tagId);
    event.dataTransfer.effectAllowed = "move";
  }

  function commitAssignedDrop(gap: number): void {
    if (!drag) {
      return;
    }
    if (drag.from === "available") {
      onAssignTag(drag.tagId, gap);
    } else {
      const fromIndex = assigned.findIndex((tag) => tag.id === drag.tagId);
      if (fromIndex !== -1) {
        onReorderAssignedTag(drag.tagId, gap > fromIndex ? gap - 1 : gap);
      }
    }
    clearDrag();
  }

  const dragHandleLabel = translate("glossaryEditor.tags.dragHandle");
  const primaryLabel = translate("glossaryEditor.tags.primary");

  return (
    <div className="glossaryEntryTagAssignment">
      <div className="glossaryEntryTagAssignmentColumn">
        <h3 className="glossaryEntryTagAssignmentTitle">
          {translate("glossaryEditor.tags.assignedTitle")}
        </h3>
        <ul
          className="glossaryEntryTagAssignmentList glossaryEntryTagAssignmentList-assigned"
          aria-label={translate("glossaryEditor.tags.assignedTitle")}
          data-drop-active={
            drag && assignedDropGap !== null ? true : undefined
          }
          onDragOver={(event) => {
            if (!interactive || !drag || !carriesTagAssignment(event.dataTransfer)) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (assignedDropGap === null) {
              setAssignedDropGap(assigned.length);
            }
          }}
          onDrop={(event) => {
            if (!interactive || !drag) {
              return;
            }
            event.preventDefault();
            commitAssignedDrop(assignedDropGap ?? assigned.length);
          }}
        >
          {assigned.length === 0 ? (
            <li className="glossaryEntryTagAssignmentEmpty">
              {translate("glossaryEditor.tags.noAssigned")}
            </li>
          ) : (
            assigned.map((tag, index) => (
              <li
                key={tag.id}
                className="glossaryEntryTagAssignmentRow"
                data-dragging={drag?.tagId === tag.id || undefined}
                data-drop-before={assignedDropGap === index || undefined}
                onDragOver={(event) => {
                  if (
                    !interactive ||
                    !drag ||
                    !carriesTagAssignment(event.dataTransfer)
                  ) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const gap = dropGapFor(event, index);
                  if (gap !== assignedDropGap) {
                    setAssignedDropGap(gap);
                  }
                }}
                onDrop={(event) => {
                  if (!interactive || !drag) {
                    return;
                  }
                  event.preventDefault();
                  commitAssignedDrop(dropGapFor(event, index));
                }}
              >
                <button
                  type="button"
                  className="glossaryEntryTagAssignmentDragHandle"
                  aria-label={dragHandleLabel}
                  title={dragHandleLabel}
                  draggable={interactive}
                  disabled={!interactive}
                  onDragStart={(event) =>
                    beginDrag(event, tag.id, "assigned")
                  }
                  onDragEnd={clearDrag}
                  onKeyDown={(event) => {
                    if (!interactive) {
                      return;
                    }
                    if (event.key === "ArrowUp" && index > 0) {
                      event.preventDefault();
                      onReorderAssignedTag(tag.id, index - 1);
                    } else if (
                      event.key === "ArrowDown" &&
                      index < assigned.length - 1
                    ) {
                      event.preventDefault();
                      onReorderAssignedTag(tag.id, index + 1);
                    }
                  }}
                >
                  <span aria-hidden="true">{TAG_DRAG_HANDLE_GLYPH}</span>
                </button>
                <GlossaryTagChip
                  tag={tag}
                  isPrimary={index === 0}
                  primaryLabel={index === 0 ? primaryLabel : undefined}
                />
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="glossaryEntryTagAssignmentColumn">
        <h3 className="glossaryEntryTagAssignmentTitle">
          {translate("glossaryEditor.tags.availableTitle")}
        </h3>
        <ul
          className="glossaryEntryTagAssignmentList glossaryEntryTagAssignmentList-available"
          aria-label={translate("glossaryEditor.tags.availableTitle")}
          data-drop-active={availableDropActive || undefined}
          onDragOver={(event) => {
            if (
              !interactive ||
              drag?.from !== "assigned" ||
              !carriesTagAssignment(event.dataTransfer)
            ) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (!availableDropActive) {
              setAvailableDropActive(true);
            }
          }}
          onDrop={(event) => {
            if (!interactive || drag?.from !== "assigned") {
              return;
            }
            event.preventDefault();
            onUnassignTag(drag.tagId);
            clearDrag();
          }}
        >
          {projectTags.length === 0 ? (
            <li className="glossaryEntryTagAssignmentEmpty">
              {translate("glossaryEditor.tags.noProjectTags")}
            </li>
          ) : available.length === 0 ? (
            <li className="glossaryEntryTagAssignmentEmpty">
              {translate("glossaryEditor.tags.noAvailable")}
            </li>
          ) : (
            available.map((tag) => (
              <li
                key={tag.id}
                className="glossaryEntryTagAssignmentRow"
                data-dragging={drag?.tagId === tag.id || undefined}
              >
                <button
                  type="button"
                  className="glossaryEntryTagAssignmentDragHandle"
                  aria-label={dragHandleLabel}
                  title={dragHandleLabel}
                  draggable={interactive}
                  disabled={!interactive}
                  onDragStart={(event) =>
                    beginDrag(event, tag.id, "available")
                  }
                  onDragEnd={clearDrag}
                  onKeyDown={(event) => {
                    if (!interactive) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onAssignTag(tag.id, assigned.length);
                    }
                  }}
                >
                  <span aria-hidden="true">{TAG_DRAG_HANDLE_GLYPH}</span>
                </button>
                <GlossaryTagChip tag={tag} />
              </li>
            ))
          )}
        </ul>
        <button
          type="button"
          className="glossaryEntryTagAssignmentManageLink"
          onClick={onOpenTagManager}
        >
          {translate("glossaryEditor.tags.openManager")}
        </button>
      </div>
    </div>
  );
}
