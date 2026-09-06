import { useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  reorderDocumentMapDialoguePairs,
  type DocumentMapDialogueDelimiterPair
} from "../shared/documentMapSettings";
import type { Translate } from "../shared/i18n";
import { DialogueDelimiterPairDialog } from "./DialogueDelimiterPairDialog";

/** Private DataTransfer type for the dialogue-pair reorder drag. */
const DIALOGUE_PAIR_MIME = "application/x-pergamum-document-map-dialogue-pair";
const DRAG_HANDLE_GLYPH = "⣿";

export interface DialogueDelimiterPairsEditorProps {
  pairs: readonly DocumentMapDialogueDelimiterPair[];
  disabled?: boolean;
  translate: Translate;
  onChange: (pairs: DocumentMapDialogueDelimiterPair[]) => void;
}

type DialogState =
  | { mode: "create"; opener: Element | null }
  | {
      mode: "edit";
      index: number;
      pair: DocumentMapDialogueDelimiterPair;
      opener: Element | null;
    }
  | null;

export function DialogueDelimiterPairsEditor({
  pairs,
  disabled = false,
  translate,
  onChange
}: DialogueDelimiterPairsEditorProps): JSX.Element {
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>(null);

  function handleOpenAdd(event: ReactMouseEvent<HTMLButtonElement>): void {
    if (disabled) {
      return;
    }
    setDialogState({ mode: "create", opener: event.currentTarget });
  }

  function handleOpenEdit(
    index: number,
    pair: DocumentMapDialogueDelimiterPair,
    event: ReactMouseEvent<HTMLButtonElement>
  ): void {
    if (disabled) {
      return;
    }
    setDialogState({ mode: "edit", index, pair, opener: event.currentTarget });
  }

  function handleDialogSave(savedPair: DocumentMapDialogueDelimiterPair): void {
    if (!dialogState) {
      return;
    }
    if (dialogState.mode === "create") {
      const next = [...pairs.map((p) => ({ ...p })), savedPair];
      onChange(next);
    } else {
      const next = pairs.map((p, i) =>
        i === dialogState.index ? savedPair : { ...p }
      );
      onChange(next);
    }
  }

  function handleDialogClose(): void {
    setDialogState(null);
  }

  function deletePair(index: number): void {
    if (disabled) {
      return;
    }
    const next = pairs
      .filter((_pair, i) => i !== index)
      .map((pair) => ({ ...pair }));
    onChange(next);
  }

  function movePair(fromIndex: number, toIndex: number): void {
    if (disabled) {
      return;
    }
    const next = reorderDocumentMapDialoguePairs(pairs, fromIndex, toIndex);
    if (
      next.some(
        (pair, i) =>
          pair.open !== pairs[i]?.open ||
          pair.close !== pairs[i]?.close ||
          pair.color !== pairs[i]?.color
      )
    ) {
      onChange(next);
    }
  }

  function dropGapFor(
    event: { clientY: number; currentTarget: HTMLElement },
    index: number
  ): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
  }

  const dragHandleLabel = translate(
    "settings.documentMap.dialogueDelimiterPairs.reorder"
  );
  const sampleText = translate(
    "settings.documentMap.dialogueDelimiterPairs.sampleText"
  );

  return (
    <div className="documentMapSettingsDialoguePairsEditor">
      <ul
        className="documentMapSettingsDialoguePairList"
        aria-label={translate(
          "settings.documentMap.dialogueDelimiterPairs.label"
        )}
      >
        {pairs.map((pair, index) => {
          const previewText = `${pair.open}${sampleText}${pair.close}`;
          const onDragOver = (event: DragEvent<HTMLElement>): void => {
            if (
              drag === null ||
              !Array.from(event.dataTransfer.types).includes(DIALOGUE_PAIR_MIME)
            ) {
              return;
            }
            event.preventDefault();
            const gap = dropGapFor(event, index);
            if (gap !== dropIndex) {
              setDropIndex(gap);
            }
          };
          const onDrop = (event: DragEvent<HTMLElement>): void => {
            if (drag === null) {
              return;
            }
            event.preventDefault();
            const gap = dropGapFor(event, index);
            movePair(drag, gap > drag ? gap - 1 : gap);
            setDrag(null);
            setDropIndex(null);
          };

          return (
            <li
              key={index}
              className="documentMapSettingsDialoguePairRow"
              data-dragging={drag === index || undefined}
              data-drop-before={dropIndex === index || undefined}
              onDragOver={onDragOver}
              onDrop={onDrop}
            >
              <button
                type="button"
                className="glossaryEntryTagAssignmentDragHandle"
                aria-label={dragHandleLabel}
                title={dragHandleLabel}
                draggable={!disabled}
                disabled={disabled}
                onDragStart={(event) => {
                  setDrag(index);
                  setDropIndex(null);
                  event.dataTransfer.setData(DIALOGUE_PAIR_MIME, String(index));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDropIndex(null);
                }}
                onKeyDown={(event) => {
                  if (disabled) {
                    return;
                  }
                  if (event.key === "ArrowUp" && index > 0) {
                    event.preventDefault();
                    movePair(index, index - 1);
                  } else if (
                    event.key === "ArrowDown" &&
                    index < pairs.length - 1
                  ) {
                    event.preventDefault();
                    movePair(index, index + 1);
                  }
                }}
              >
                <span aria-hidden="true">{DRAG_HANDLE_GLYPH}</span>
              </button>

              <span
                className="documentMapSettingsDialoguePairPreview"
                style={{ color: pair.color }}
              >
                {previewText}
              </span>

              <div className="documentMapSettingsDialoguePairActions">
                <button
                  type="button"
                  className="documentMapSettingsDialoguePairEdit"
                  aria-label={`${translate(
                    "settings.documentMap.dialogueDelimiterPairs.edit"
                  )} ${pair.open}${pair.close}`}
                  disabled={disabled}
                  onClick={(event) => handleOpenEdit(index, pair, event)}
                >
                  {translate("settings.documentMap.dialogueDelimiterPairs.edit")}
                </button>
                <button
                  type="button"
                  className="documentMapSettingsDialoguePairDelete"
                  aria-label={`${translate(
                    "settings.documentMap.dialogueDelimiterPairs.delete"
                  )} ${pair.open}${pair.close}`}
                  title={translate(
                    "settings.documentMap.dialogueDelimiterPairs.delete"
                  )}
                  disabled={disabled}
                  onClick={() => deletePair(index)}
                >
                  {translate(
                    "settings.documentMap.dialogueDelimiterPairs.delete"
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="documentMapSettingsAddPair"
        disabled={disabled}
        onClick={handleOpenAdd}
      >
        {translate("settings.documentMap.dialogueDelimiterPairs.add")}
      </button>

      <DialogueDelimiterPairDialog
        isOpen={dialogState !== null}
        mode={dialogState?.mode ?? "create"}
        initialPair={
          dialogState?.mode === "edit" ? dialogState.pair : undefined
        }
        opener={dialogState?.opener}
        translate={translate}
        onSave={handleDialogSave}
        onClose={handleDialogClose}
      />
    </div>
  );
}
