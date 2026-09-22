/**
 * #407 B2 / #535: SaveDestinationDialog — configure image attachment save
 * destination.
 *
 * Used by SettingsPanel, ProjectSettingsPanel, and the unconfigured
 * paste/insertion flow.
 *
 * Normal mode:
 *   Title: "文書添付画像の保存先を指定してください"
 *   [ Path input ]
 *   [キャンセル] [決定]
 *
 * Paste prompt mode:
 *   Prepends advisory notice:
 *   "添付画像の保存先が未指定です。\n文書添付画像の保存先を指定してください。"
 *
 * Validation:
 *   - Uses `validateAttachedImageSaveDestination` for path shape.
 *   - Uses `destinationHasMarkdownRiskyCharacters` for advisory warnings.
 *   - This component only decides the destination path string; it never
 *     touches the filesystem itself. #535 moved "create the folder on
 *     confirm" to the caller's `onSave` handler (shared by all three call
 *     sites), since creating a directory is an IPC round trip the caller is
 *     already positioned to await and report errors for.
 *   - Cancel dismisses dialog with zero changes, no notifications.
 *   - #535 removed the "Markdownリンクを挿入する" checkbox — a successful
 *     image save/insertion now always inserts a Markdown link
 *     unconditionally, so this dialog's only remaining job is the
 *     destination path.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent
} from "react";
import type { Translate, TranslationKey } from "../../shared/i18n";
import type { AppPlatform } from "../../shared/platform";
import {
  validateAttachedImageSaveDestination,
  type SaveDestinationValidationResult
} from "../../shared/attachedImageSaveDestination";
import { destinationHasMarkdownRiskyCharacters } from "../../shared/markdownImageLink";
import { getDialogActionOrder } from "./appDialogTypes";
import { InfoDialog } from "./InfoDialog";

export interface SaveDestinationDialogResult {
  readonly saveDirectory: string;
}

export interface SaveDestinationDialogProps {
  readonly isOpen: boolean;
  readonly initialSaveDirectory?: string;
  readonly mode?: "settings" | "pastePrompt";
  readonly allowEmpty?: boolean;
  readonly translate: Translate;
  readonly platform?: AppPlatform;
  readonly opener?: Element | null;
  readonly onSave: (result: SaveDestinationDialogResult) => void;
  readonly onDismiss: () => void;
}

export function SaveDestinationDialog({
  isOpen,
  initialSaveDirectory = "",
  mode = "settings",
  allowEmpty,
  translate,
  platform,
  opener,
  onSave,
  onDismiss
}: SaveDestinationDialogProps): JSX.Element | null {
  const [saveDirectory, setSaveDirectory] = useState(initialSaveDirectory);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevIsOpenRef = useRef(false);

  const dialogId = useId();
  const inputId = `${dialogId}-path`;
  const errorId = `${dialogId}-error`;
  const riskyNoticeId = `${dialogId}-risky`;

  useEffect(() => {
    const wasClosed = !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (isOpen && wasClosed) {
      setSaveDirectory(initialSaveDirectory);
      setSubmitAttempted(false);
      // Autofocus and select path input when opening
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen, initialSaveDirectory]);

  const effectiveAllowEmpty = allowEmpty ?? (mode !== "pastePrompt");
  const isTrimmedEmpty = saveDirectory.trim().length === 0;

  const rawValidation: SaveDestinationValidationResult =
    validateAttachedImageSaveDestination(saveDirectory);

  const isValid = (effectiveAllowEmpty && isTrimmedEmpty) || rawValidation.ok;

  const normalizedSaveDirectory = isTrimmedEmpty
    ? ""
    : rawValidation.ok
      ? rawValidation.normalized
      : "";

  const validationReason = isValid
    ? null
    : rawValidation.ok
      ? null
      : rawValidation.reason;

  const hasRiskyCharacters =
    !isTrimmedEmpty && destinationHasMarkdownRiskyCharacters(saveDirectory);

  const showValidationError =
    (submitAttempted || (!isTrimmedEmpty && !rawValidation.ok)) && !isValid;

  const resolvedPlatform: AppPlatform =
    platform ??
    (typeof window !== "undefined" && window.pergamum?.platform
      ? window.pergamum.platform
      : "windows");

  const actionOrder = getDialogActionOrder(resolvedPlatform);

  const handleSave = useCallback(() => {
    setSubmitAttempted(true);
    if (!isValid) {
      return;
    }

    onSave({
      saveDirectory: normalizedSaveDirectory
    });
  }, [isValid, normalizedSaveDirectory, onSave]);

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    handleSave();
  };

  if (!isOpen) {
    return null;
  }

  const saveButton = (
    <button
      key="save"
      type="button"
      className="appDialogButton appDialogButton-confirm saveDestinationDialogSaveButton"
      disabled={!isValid}
      onClick={handleSave}
    >
      {translate("common.confirm")}
    </button>
  );

  const cancelButton = (
    <button
      key="cancel"
      type="button"
      className="appDialogButton appDialogButton-cancel saveDestinationDialogCancelButton"
      onClick={onDismiss}
    >
      {translate("common.cancel")}
    </button>
  );

  const actionButtons =
    actionOrder === "confirmCancel"
      ? [saveButton, cancelButton]
      : [cancelButton, saveButton];

  return (
    <InfoDialog
      title={translate("settings.imageAttachment.saveDirectory.dialogTitle")}
      opener={opener ?? null}
      className="saveDestinationDialog"
      onClose={onDismiss}
      footer={<div className="appDialogActions">{actionButtons}</div>}
    >
      <form className="saveDestinationDialogForm" onSubmit={handleFormSubmit}>
        {mode === "pastePrompt" ? (
          <p className="saveDestinationDialogNotice">
            {translate(
              "settings.imageAttachment.saveDirectory.pastePromptNotice"
            )}
          </p>
        ) : null}

        <label className="saveDestinationDialogLabel" htmlFor={inputId}>
          <span className="saveDestinationDialogLabelText">
            {translate("settings.imageAttachment.saveDirectory.label")}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className="saveDestinationDialogInput"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={saveDirectory}
            aria-describedby={
              showValidationError
                ? errorId
                : hasRiskyCharacters
                  ? riskyNoticeId
                  : undefined
            }
            aria-invalid={showValidationError ? "true" : undefined}
            onChange={(e) => {
              setSaveDirectory(e.target.value);
            }}
          />
        </label>

        {showValidationError && validationReason ? (
          <p id={errorId} className="saveDestinationDialogError" role="alert">
            {translate(
              `settings.imageAttachment.saveDirectory.validation.${validationReason}` as TranslationKey
            )}
          </p>
        ) : null}

        {hasRiskyCharacters ? (
          <p id={riskyNoticeId} className="saveDestinationDialogRiskyNotice">
            {translate(
              "settings.imageAttachment.saveDirectory.riskyCharactersNotice"
            )}
          </p>
        ) : null}
      </form>
    </InfoDialog>
  );
}

export interface SaveDestinationSettingControlProps {
  readonly id?: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly translate: Translate;
  readonly onOpenDialog?: (opener?: Element | null) => void;
}

export function SaveDestinationSettingControl({
  id,
  value,
  disabled,
  translate,
  onOpenDialog
}: SaveDestinationSettingControlProps): JSX.Element {
  return (
    <div className="settingsSaveDestinationRow">
      <span
        className={
          value
            ? "settingsSaveDestinationPath"
            : "settingsSaveDestinationPath settingsSaveDestinationPath-unconfigured"
        }
      >
        {value ||
          translate("settings.imageAttachment.saveDirectory.unconfigured")}
      </span>
      <button
        id={id}
        type="button"
        className="settingsSaveDestinationEditButton"
        disabled={disabled}
        onClick={(event) => onOpenDialog?.(event.currentTarget)}
      >
        {translate("common.edit")}
      </button>
    </div>
  );
}
