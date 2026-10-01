import { useRef } from "react";
import hourglassIconUrl from "../../assets/icons/ionicons/dialog/hourglass-outline.svg?url";
import type { Translate } from "../shared/i18n";
import { dialogIconSvgByKind } from "./dialog/dialogIcons";
import { InfoDialog } from "./dialog/InfoDialog";
import { useArmDelay } from "./dialog/useArmDelay";
import { MaskedIcon } from "./MaskedIcon";

/**
 * #652: confirmation for "Reset All Keybindings". Destructive and not
 * undoable, so the confirm button is disabled (with an hourglass) for the
 * shared safety delay after the dialog opens. A disabled button cannot be
 * activated by mouse, Enter or Space; focus starts on Cancel.
 */
export interface KeyboardShortcutsResetAllDialogProps {
  readonly translate: Translate;
  readonly opener: Element | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function KeyboardShortcutsResetAllDialog({
  translate,
  opener,
  onConfirm,
  onCancel
}: KeyboardShortcutsResetAllDialogProps): JSX.Element {
  const armed = useArmDelay();
  const confirmedRef = useRef(false);

  return (
    <InfoDialog
      title={translate("keyboardShortcuts.resetAll.title")}
      opener={opener}
      role="alertdialog"
      className="appDialog-destructive keyboardShortcutsResetAllDialog"
      onClose={onCancel}
      headerIcon={
        <span
          className="appDialogIcon appDialogIcon-warning"
          role="img"
          aria-label={translate("dialog.icon.warning")}
          dangerouslySetInnerHTML={{ __html: dialogIconSvgByKind.warning }}
        />
      }
      footer={
        <div className="appDialogActions">
          <button
            type="button"
            className="appDialogButton appDialogButton-choice-destructive keyboardShortcutsResetAllConfirm"
            disabled={!armed}
            aria-disabled={!armed}
            onClick={() => {
              if (!armed || confirmedRef.current) {
                return;
              }
              confirmedRef.current = true;
              onConfirm();
            }}
          >
            {armed ? null : (
              <MaskedIcon
                url={hourglassIconUrl}
                className="keyboardShortcutsResetAllHourglass"
              />
            )}
            <span>{translate("keyboardShortcuts.resetAll.confirm")}</span>
          </button>
          <button
            type="button"
            className="appDialogButton"
            autoFocus
            onClick={onCancel}
          >
            {translate("common.cancel")}
          </button>
        </div>
      }
    >
      <p className="appDialogMessageText">
        {translate("keyboardShortcuts.resetAll.message")}
      </p>
    </InfoDialog>
  );
}
