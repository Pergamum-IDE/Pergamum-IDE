import { useState, type KeyboardEvent, type MouseEvent } from "react";
import editIcon from "../../assets/icons/feather/global/edit-2.svg?raw";
import deleteIcon from "../../assets/icons/feather/glossary/delete.svg?raw";
import {
  representativeGlossaryAtom,
  type GlossaryEntry,
  type GlossaryEntryId
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import { GlossaryTagChip } from "./GlossaryTagChip";
import {
  glossaryEntryOrderChanged,
  reorderGlossaryEntryIds
} from "./glossaryEntryReorder";

interface GlossaryEntryManagerProps {
  entries: readonly GlossaryEntry[];
  translate: Translate;
  /** #375: open the new-Glossary-Entry creation flow (top-left "Add entry"). */
  onAddEntry: () => void;
  /** Open the entry's editor tab (row click / edit icon). */
  onOpenEntry: (entryId: GlossaryEntryId) => void;
  /**
   * Hard delete. The host confirms first through the shared Pergamum
   * destructive confirm dialog (the entry's representative surface is passed
   * so it can name the target).
   */
  onDeleteEntry: (
    entryId: GlossaryEntryId,
    entryLabel: string
  ) => Promise<unknown> | void;
  /**
   * #375: persist a new project-wide entry order (drag handle / Arrow keys).
   * `entryIdsInOrder` lists every glossary entry exactly once; the host
   * re-packs `glossary_entries.sort_order` and refreshes every glossary
   * consumer (sidebar / Document Map / this table).
   */
  onReorderEntries: (entryIdsInOrder: string[]) => Promise<unknown> | void;
}

/** Private DataTransfer type — keeps entry reorder drags from mixing with the
 *  File Explorer / tab / atom / tag reorder drags. */
const ENTRY_REORDER_MIME = "application/x-pergamum-glossary-entry-reorder";

/** The grab-to-reorder glyph shown at the head of every entry row. Shared with
 *  the Tag Manager. */
const ENTRY_DRAG_HANDLE_GLYPH = "⣿";

/** `2026-09-03T12:34:56.000Z` → `2026-09-03`. Display-only; save values are
 *  never touched. Falls back to the raw string for a non-ISO value. */
function formatEntryTimestamp(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

function representativeSurface(entry: GlossaryEntry): string {
  return representativeGlossaryAtom(entry)?.value ?? entry.id;
}

const TABLE_COLUMN_KEYS = [
  "glossary.entryManager.columns.reorder",
  "glossary.entryManager.columns.entry",
  "glossary.entryManager.columns.tags",
  "glossary.entryManager.columns.tagCount",
  "glossary.entryManager.columns.atomCount",
  "glossary.entryManager.columns.createdAt",
  "glossary.entryManager.columns.updatedAt",
  "glossary.entryManager.columns.edit",
  "glossary.entryManager.columns.delete"
] as const;

/**
 * #375: the Glossary Management tab — a table-shaped surface for the glossary
 * ENTRIES themselves
 * (`[⣿ handle][entry][tags][tag count][atoms][created][updated][edit][delete]`),
 * with drag-handle reorder of the project-wide `glossary_entries.sort_order`.
 * An "Add entry" primary action sits top-left (not a page heading). Clicking a
 * row opens that entry's editor tab; the drag handle / edit / delete controls
 * stop the click from bubbling so they never also open the editor. Edit /
 * delete / create go back to the host. No bulk operations, no column sort /
 * resize.
 */
export function GlossaryEntryManager({
  entries,
  translate,
  onAddEntry,
  onOpenEntry,
  onDeleteEntry,
  onReorderEntries
}: GlossaryEntryManagerProps): JSX.Element {
  // #375: transient drag state for entry reorder (D&D). `dropGap` is a slot
  // index in `[0, entries.length]` — the position the dragged entry would land.
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);

  const reorderable = entries.length > 1;

  function clearDrag(): void {
    setDraggingEntryId(null);
    setDropGap(null);
  }

  function dropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  function moveEntry(fromIndex: number, toIndex: number): void {
    const currentIds = entries.map((entry) => entry.id);
    const nextOrder = reorderGlossaryEntryIds(currentIds, fromIndex, toIndex);

    if (glossaryEntryOrderChanged(currentIds, nextOrder)) {
      void onReorderEntries(nextOrder);
    }
  }

  /** Keep a control's own click from also triggering the row's "open editor". */
  function stopRowActivation(
    event: MouseEvent | KeyboardEvent
  ): void {
    event.stopPropagation();
  }

  const primaryTagLabel = translate("glossary.entryManager.primaryTag");

  return (
    <section
      className="glossaryEntryManager"
      aria-label={translate("glossary.entryManager.title")}
    >
      {/* No page heading — the "Add entry" button is the primary action,
          top-left, mirroring the Tag Manager. */}
      <div className="glossaryEntryManagerActions">
        <button
          type="button"
          className="glossaryEntryManagerAddButton"
          onClick={onAddEntry}
        >
          {translate("glossary.entryManager.addEntry")}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="glossaryEntryManagerEmpty">
          {translate("glossary.entryManager.empty")}
        </p>
      ) : (
        <div
          className="glossaryEntryManagerTable"
          role="table"
          aria-label={translate("glossary.entryManager.title")}
        >
          <div
            className="glossaryEntryManagerTableRow glossaryEntryManagerTableHead"
            role="row"
          >
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

          {entries.map((entry, index) => {
            const surface = representativeSurface(entry);
            const openEntry = (): void => onOpenEntry(entry.id);

            return (
              <div
                className="glossaryEntryManagerTableRow glossaryEntryManagerEntryRow"
                role="row"
                key={entry.id}
                tabIndex={0}
                aria-label={`${translate(
                  "glossary.entryManager.editEntry"
                )}: ${surface}`}
                title={translate("glossary.entryManager.editEntry")}
                data-dragging={draggingEntryId === entry.id || undefined}
                data-drop-before={dropGap === index || undefined}
                data-drop-after={
                  dropGap === index + 1 && index === entries.length - 1
                    ? true
                    : undefined
                }
                onClick={(event) => {
                  if (event.defaultPrevented) {
                    return;
                  }
                  openEntry();
                }}
                onKeyDown={(event) => {
                  // Only the row itself — never a bubbled key from a child
                  // control (drag handle Arrow keys, focused buttons).
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEntry();
                  }
                }}
                onDragOver={(event) => {
                  if (
                    !reorderable ||
                    draggingEntryId === null ||
                    !Array.from(event.dataTransfer.types).includes(
                      ENTRY_REORDER_MIME
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
                  if (!reorderable || draggingEntryId === null) {
                    return;
                  }
                  event.preventDefault();
                  const gap = dropGapFor(event, index);
                  const fromIndex = entries.findIndex(
                    (candidate) => candidate.id === draggingEntryId
                  );
                  clearDrag();
                  if (fromIndex !== -1) {
                    moveEntry(fromIndex, gap > fromIndex ? gap - 1 : gap);
                  }
                }}
              >
                <span role="cell" className="glossaryTagManagerCell">
                  <button
                    type="button"
                    className="glossaryTagManagerDragHandle"
                    aria-label={translate("glossary.entryManager.dragHandle")}
                    title={translate("glossary.entryManager.dragHandle")}
                    draggable={reorderable}
                    disabled={!reorderable}
                    onClick={stopRowActivation}
                    onDragStart={(event) => {
                      if (!reorderable) {
                        event.preventDefault();
                        return;
                      }
                      setDraggingEntryId(entry.id);
                      setDropGap(null);
                      event.dataTransfer.setData(ENTRY_REORDER_MIME, entry.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={clearDrag}
                    onKeyDown={(event) => {
                      if (!reorderable) {
                        return;
                      }
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveEntry(index, index - 1);
                      } else if (
                        event.key === "ArrowDown" &&
                        index < entries.length - 1
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        moveEntry(index, index + 1);
                      }
                    }}
                  >
                    <span aria-hidden="true">{ENTRY_DRAG_HANDLE_GLYPH}</span>
                  </button>
                </span>

                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryEntryManagerSurfaceCell"
                  title={surface}
                >
                  {surface}
                </span>

                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryEntryManagerTagsCell"
                >
                  {entry.tags.length === 0 ? (
                    <span className="glossaryTagManagerMuted">
                      {translate("glossary.entryManager.noTags")}
                    </span>
                  ) : (
                    entry.tags.map((tag, tagIndex) => (
                      <span
                        key={tag.id}
                        className="glossaryEntryManagerTagItem"
                      >
                        <GlossaryTagChip
                          tag={tag}
                          isPrimary={tagIndex === 0}
                          primaryLabel={
                            tagIndex === 0 ? primaryTagLabel : undefined
                          }
                        />
                      </span>
                    ))
                  )}
                </span>

                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryTagManagerEntriesCell"
                >
                  {entry.tags.length}
                </span>
                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryTagManagerEntriesCell"
                >
                  {entry.atoms.length}
                </span>

                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryTagManagerTimestampCell"
                >
                  {formatEntryTimestamp(entry.createdAt)}
                </span>
                <span
                  role="cell"
                  className="glossaryTagManagerCell glossaryTagManagerTimestampCell"
                >
                  {formatEntryTimestamp(entry.updatedAt)}
                </span>

                <span role="cell" className="glossaryTagManagerCell">
                  <button
                    type="button"
                    className="glossaryTagManagerIconButton glossaryEntryManagerEditButton"
                    aria-label={translate("glossary.entryManager.editEntry")}
                    title={translate("glossary.entryManager.editEntry")}
                    onClick={(event) => {
                      stopRowActivation(event);
                      openEntry();
                    }}
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
                    className="glossaryTagManagerIconButton glossaryTagManagerDeleteButton glossaryEntryManagerDeleteButton"
                    aria-label={translate("glossary.entryManager.deleteEntry")}
                    title={translate("glossary.entryManager.deleteEntry")}
                    onClick={(event) => {
                      stopRowActivation(event);
                      void onDeleteEntry(entry.id, surface);
                    }}
                  >
                    <span
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: deleteIcon }}
                    />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
