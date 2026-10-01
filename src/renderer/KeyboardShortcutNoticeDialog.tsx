import type { ApplyKeybindingChangeFailureReason } from "../shared/api";
import type { Translate } from "../shared/i18n";
import type { KeybindingEditConflict } from "../shared/keybindings";
import { KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS } from "./keyboardShortcutSearch";
import { InfoDialog } from "./dialog/InfoDialog";

/**
 * #647: why a shortcut change was NOT saved (conflict, reserved key, save
 * failure, unsupported key, ...). Nothing was written when this is shown.
 */

export interface KeyboardShortcutNotice {
  readonly reason:
    | ApplyKeybindingChangeFailureReason
    | "unsupported"
    | "resetFailed";
  readonly conflict?: KeybindingEditConflict;
  /** The label of the key the user pressed, when known. */
  readonly keyLabel?: string;
}

export interface KeyboardShortcutNoticeDialogProps {
  readonly translate: Translate;
  readonly notice: KeyboardShortcutNotice;
  readonly opener: Element | null;
  readonly onClose: () => void;
}

export function KeyboardShortcutNoticeDialog({
  translate,
  notice,
  opener,
  onClose
}: KeyboardShortcutNoticeDialogProps): JSX.Element {
  const { conflict } = notice;

  let message: string;
  switch (notice.reason) {
    case "conflict":
      message = translate("keybindings.diagnostic.conflictingKey");
      break;
    case "reserved":
      message = translate("keybindings.diagnostic.reservedKey");
      break;
    case "saveFailed":
      message = translate("keybindings.diagnostic.fileWriteError");
      break;
    case "fileInvalid":
      message = translate("keyboardShortcuts.notice.fileInvalid");
      break;
    case "resetFailed":
      message = translate("keyboardShortcuts.notice.resetFailed");
      break;
    case "unsupported":
      message = translate("keyboardShortcuts.unsupportedKey");
      break;
    case "duplicate":
      message = translate("keybindings.diagnostic.duplicateUserEntry");
      break;
    case "stale":
      message = translate("keyboardShortcuts.notice.stale");
      break;
    default:
      message = translate("keyboardShortcuts.notice.generic");
  }

  const keyLabel = conflict?.keyLabel ?? notice.keyLabel;
  const categoryText = (category: string): string => {
    const labelKey = KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS[category];
    return labelKey === undefined ? category : translate(labelKey);
  };

  return (
    <InfoDialog
      title={translate("keyboardShortcuts.notice.title")}
      opener={opener}
      role="alertdialog"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="appDialogButton appDialogButton-confirm"
          autoFocus
          onClick={onClose}
        >
          {translate("keyboardShortcuts.notice.ok")}
        </button>
      }
    >
      <p className="appDialogMessageText">{message}</p>
      {conflict !== undefined || (keyLabel !== undefined && notice.reason === "reserved") ? (
        <ul className="keyboardShortcutNoticeDetails">
          {keyLabel !== undefined ? (
            <li>{translate("keyboardShortcuts.notice.conflict.key", { key: keyLabel })}</li>
          ) : null}
          {conflict !== undefined ? (
            <>
              <li>
                {translate("keyboardShortcuts.notice.conflict.command", {
                  title: conflict.title,
                  commandId: conflict.commandId
                })}
              </li>
              <li>
                {translate("keyboardShortcuts.notice.conflict.category", {
                  category: categoryText(conflict.category)
                })}
              </li>
              <li>
                {translate("keyboardShortcuts.notice.conflict.scope", {
                  scope: translate(`keyboardShortcuts.scope.${conflict.scope}`)
                })}
              </li>
            </>
          ) : null}
        </ul>
      ) : null}
    </InfoDialog>
  );
}
