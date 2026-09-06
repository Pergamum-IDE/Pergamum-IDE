import {
  useId,
  useState,
  type FormEvent
} from "react";
import {
  DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR,
  normalizeDocumentMapColor,
  type DocumentMapDialogueDelimiterPair
} from "../shared/documentMapSettings";
import type { Translate } from "../shared/i18n";
import { InfoDialog } from "./dialog/InfoDialog";

function colorPickerValue(raw: string): string {
  return normalizeDocumentMapColor(raw) ?? "#888888";
}

export interface DialogueDelimiterPairDialogProps {
  isOpen: boolean;
  mode: "create" | "edit";
  initialPair?: DocumentMapDialogueDelimiterPair;
  opener?: Element | null;
  translate: Translate;
  onSave: (pair: DocumentMapDialogueDelimiterPair) => void;
  onClose: () => void;
}

function DialogueDelimiterPairDialogContent({
  mode,
  initialPair,
  opener,
  translate,
  onSave,
  onClose
}: Omit<DialogueDelimiterPairDialogProps, "isOpen">): JSX.Element {
  const [open, setOpen] = useState(initialPair?.open ?? "");
  const [close, setClose] = useState(initialPair?.close ?? "");
  const [color, setColor] = useState(
    initialPair?.color ?? DOCUMENT_MAP_DEFAULT_DIALOGUE_COLOR
  );
  const [error, setError] = useState<string | null>(null);

  const dialogId = useId();
  const openInputId = `${dialogId}-open`;
  const closeInputId = `${dialogId}-close`;
  const colorInputId = `${dialogId}-color`;

  const handleSave = (event?: FormEvent): void => {
    if (event) {
      event.preventDefault();
    }

    if (open.length === 0 || close.length === 0) {
      setError(
        translate(
          "settings.documentMap.dialogueDelimiterPairs.errorEmptyDelimiter"
        )
      );
      return;
    }

    const normalizedColor = normalizeDocumentMapColor(color);
    if (normalizedColor === null) {
      setError(
        translate(
          "settings.documentMap.dialogueDelimiterPairs.errorInvalidColor"
        )
      );
      return;
    }

    onSave({
      open,
      close,
      color: normalizedColor
    });
    onClose();
  };

  const title =
    mode === "create"
      ? translate("settings.documentMap.dialogueDelimiterPairs.dialogTitleAdd")
      : translate(
          "settings.documentMap.dialogueDelimiterPairs.dialogTitleEdit"
        );

  return (
    <InfoDialog
      title={title}
      opener={opener ?? null}
      className="dialogueDelimiterPairDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("common.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            onClick={() => handleSave()}
          >
            {translate("common.save")}
          </button>
        </div>
      }
    >
      <form
        className="dialogueDelimiterPairDialogBody"
        onSubmit={handleSave}
      >
        <button
          type="submit"
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="dialogueDelimiterPairDialogField">
          <label htmlFor={openInputId}>
            {translate("settings.documentMap.dialogueDelimiterPairs.open")}
          </label>
          <input
            id={openInputId}
            type="text"
            className="dialogueDelimiterPairDialogInput"
            value={open}
            autoFocus
            onChange={(e) => {
              setOpen(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className="dialogueDelimiterPairDialogField">
          <label htmlFor={closeInputId}>
            {translate("settings.documentMap.dialogueDelimiterPairs.close")}
          </label>
          <input
            id={closeInputId}
            type="text"
            className="dialogueDelimiterPairDialogInput"
            value={close}
            onChange={(e) => {
              setClose(e.target.value);
              setError(null);
            }}
          />
        </div>

        <div className="dialogueDelimiterPairDialogField">
          <label htmlFor={colorInputId}>
            {translate("settings.documentMap.dialogueDelimiterPairs.color")}
          </label>
          <div className="dialogueDelimiterPairDialogColorInputs">
            <input
              type="color"
              className="dialogueDelimiterPairDialogColorSwatch"
              value={colorPickerValue(color)}
              aria-label={translate(
                "settings.documentMap.dialogueDelimiterPairs.color"
              )}
              onChange={(e) => {
                setColor(e.target.value);
                setError(null);
              }}
            />
            <input
              id={colorInputId}
              type="text"
              className="dialogueDelimiterPairDialogColorText"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>

        {error ? (
          <div className="settingsError" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </InfoDialog>
  );
}

export function DialogueDelimiterPairDialog({
  isOpen,
  mode,
  initialPair,
  opener,
  translate,
  onSave,
  onClose
}: DialogueDelimiterPairDialogProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <DialogueDelimiterPairDialogContent
      mode={mode}
      initialPair={initialPair}
      opener={opener}
      translate={translate}
      onSave={onSave}
      onClose={onClose}
    />
  );
}
