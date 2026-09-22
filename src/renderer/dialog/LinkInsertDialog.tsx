import { useId, useState, type FormEvent } from "react";
import type { Translate } from "../../shared/i18n";
import { InfoDialog } from "./InfoDialog";

export interface LinkInsertDialogProps {
  readonly isOpen: boolean;
  readonly initialText: string;
  readonly opener?: Element | null;
  readonly translate: Translate;
  readonly onInsert: (labelText: string, url: string) => void;
  readonly onClose: () => void;
}

function LinkInsertDialogContent({
  initialText,
  opener,
  translate,
  onInsert,
  onClose
}: Omit<LinkInsertDialogProps, "isOpen">): JSX.Element {
  const [labelText, setLabelText] = useState<string>(initialText);
  const [url, setUrl] = useState<string>("");

  const dialogId = useId();
  const textInputId = `${dialogId}-text`;
  const urlInputId = `${dialogId}-url`;

  const handleSubmit = (event?: FormEvent): void => {
    if (event) {
      event.preventDefault();
    }
    onInsert(labelText, url);
    onClose();
  };

  return (
    <InfoDialog
      title={translate("link.dialog.title")}
      opener={opener ?? null}
      className="linkInsertDialog"
      onClose={onClose}
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-cancel"
            onClick={onClose}
          >
            {translate("link.dialog.cancel")}
          </button>
          <button
            type="button"
            className="appDialogButton appDialogButton-confirm"
            onClick={() => handleSubmit()}
            autoFocus
          >
            {translate("link.dialog.insert")}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="linkInsertDialogForm">
        <div className="appFormField">
          <label htmlFor={textInputId} className="appFormLabel">
            {translate("link.dialog.textLabel")}
          </label>
          <input
            id={textInputId}
            type="text"
            className="appInput"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
          />
        </div>

        <div className="appFormField">
          <label htmlFor={urlInputId} className="appFormLabel">
            {translate("link.dialog.urlLabel")}
          </label>
          <input
            id={urlInputId}
            type="text"
            className="appInput"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      </form>
    </InfoDialog>
  );
}

export function LinkInsertDialog(
  props: LinkInsertDialogProps
): JSX.Element | null {
  if (!props.isOpen) {
    return null;
  }
  return <LinkInsertDialogContent {...props} />;
}
