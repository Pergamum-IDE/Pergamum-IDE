import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  performClipboardCopy,
  type ClipboardAdapter
} from "./clipboardAdapter";
import { dialogCopyButtonIconSvg } from "./dialogIcons";
import { InfoDialog } from "./InfoDialog";

/**
 * #307: a reusable "enter a name" modal for File Explorer create and, later,
 * for DOCX / PDF / EPUB export naming. It is deliberately generic:
 *
 *   - it never resolves the project root and never touches the filesystem —
 *     the caller's `onSubmit` does the real work,
 *   - the display icon and the extension / validation behavior are injected
 *     from outside via `icon`, `validateName`, and `onSubmit`,
 *   - it shows two distinct error surfaces: inline validation errors (from
 *     `validateName`, no technical-copy affordance) and operation errors
 *     (from a failed `onSubmit`, which may carry a sanitized technical-copy
 *     payload).
 */

export interface NameInputDialogIcon {
  /** Bundled asset URL (e.g. an `?url` import). */
  readonly url: string;
  /** Accessible text; omit for a purely decorative icon. */
  readonly alt?: string;
}

export type NameInputDialogValidation =
  | { readonly state: "valid" }
  | { readonly state: "invalid"; readonly message: string };

export interface NameInputDialogOperationError {
  /** User-facing, localized, safe message. Never a raw exception string. */
  readonly message: string;
  /**
   * Sanitized details for the optional technical-copy button. When present,
   * a clipboard icon is shown next to the operation error. Must already be
   * free of document contents, unsafe absolute paths, and raw exception
   * text — this component copies it verbatim.
   */
  readonly technicalDetails?: string;
}

export type NameInputDialogSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: NameInputDialogOperationError };

export interface NameInputDialogProps {
  title: string;
  description: string;
  inputLabel: string;
  placeholder?: string;
  initialValue?: string;
  primaryLabel: string;
  /**
   * #311: optional read-only context shown above the input — e.g. where a
   * File Explorer item will be created. The dialog renders these verbatim
   * and never resolves paths or project rules itself; the caller supplies
   * already-localized, display-safe strings. Both are shown only when
   * `contextValue` is present; `contextLabel` is optional.
   */
  contextLabel?: string;
  contextValue?: string;
  icon: NameInputDialogIcon;
  translate: Translate;
  clipboardAdapter: ClipboardAdapter;
  opener: Element | null;
  trapFocus?: boolean;
  /** Pure, synchronous validation of the raw input — name rules plus any
   *  caller-specific extension behavior. Runs on every change and on submit. */
  validateName: (rawValue: string) => NameInputDialogValidation;
  /** Perform the create. The dialog stays open on `{ ok: false }` and shows
   *  the operation error; on `{ ok: true }` the caller is expected to close
   *  the dialog. */
  onSubmit: (rawValue: string) => Promise<NameInputDialogSubmitResult>;
  onClose: () => void;
}

export function NameInputDialog({
  title,
  description,
  inputLabel,
  placeholder,
  initialValue,
  primaryLabel,
  contextLabel,
  contextValue,
  icon,
  translate,
  clipboardAdapter,
  opener,
  trapFocus = true,
  validateName,
  onSubmit,
  onClose
}: NameInputDialogProps): JSX.Element {
  const [value, setValue] = useState(initialValue ?? "");
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] =
    useState<NameInputDialogOperationError | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogId = useId();
  const inputId = `${dialogId}-name`;
  const descriptionId = `${dialogId}-description`;
  const errorId = `${dialogId}-error`;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const validation = validateName(value);
  const showValidationError =
    submitAttempted && validation.state === "invalid";
  const activeError = showValidationError
    ? { message: validation.message }
    : operationError;
  // The technical-copy affordance is only ever offered for an operation
  // error carrying sanitized details — never for a plain validation error.
  const showTechnicalCopy =
    !showValidationError && Boolean(operationError?.technicalDetails);
  // The primary button stays clickable for an invalid name so the user
  // gets the inline validation reason on submit; only an in-flight create
  // disables it.
  const primaryDisabled = busy;

  function updateValue(nextValue: string): void {
    setValue(nextValue);
    setOperationError(null);
    setCopyFailed(false);
  }

  const submit = useCallback(async (): Promise<void> => {
    setSubmitAttempted(true);

    if (busy || validateName(value).state === "invalid") {
      return;
    }

    setBusy(true);
    setOperationError(null);
    setCopyFailed(false);

    try {
      const result = await onSubmit(value);

      if (!result.ok) {
        setOperationError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onSubmit, validateName, value]);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submit();
  }

  async function handleCopyTechnicalDetails(): Promise<void> {
    const details = operationError?.technicalDetails;

    if (!details) {
      return;
    }

    const result = await performClipboardCopy(clipboardAdapter, details);
    setCopyFailed(!result.ok);
  }

  return (
    <InfoDialog
      title={title}
      opener={opener}
      onClose={onClose}
      trapFocus={trapFocus}
      footer={
        <div className="nameInputDialogFooter">
          <div className="appDialogFooterCopy">
            {showTechnicalCopy ? (
              <button
                type="button"
                className="appDialogCopyButton nameInputDialogCopyButton"
                aria-label={translate("dialog.copyErrorDetails")}
                title={translate("dialog.copyErrorDetails")}
                disabled={busy}
                onClick={() => {
                  void handleCopyTechnicalDetails();
                }}
                dangerouslySetInnerHTML={{ __html: dialogCopyButtonIconSvg }}
              />
            ) : null}
            {copyFailed ? (
              <span className="appDialogCopyFailure" role="alert">
                {translate("dialog.copyErrorDetailsFailed")}
              </span>
            ) : null}
          </div>
          <div className="appDialogActions">
            <button
              type="button"
              className="appDialogButton"
              onClick={onClose}
            >
              {translate("common.cancel")}
            </button>
            <button
              type="button"
              className="appDialogButton appDialogButton-confirm nameInputDialogPrimary"
              disabled={primaryDisabled}
              onClick={() => {
                void submit();
              }}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      }
    >
      <form
        id={inputId}
        className="nameInputDialogForm"
        onSubmit={handleFormSubmit}
      >
        <p id={descriptionId} className="nameInputDialogDescription">
          {description}
        </p>
        {contextValue ? (
          <p className="nameInputDialogContext">
            {contextLabel ? (
              <span className="nameInputDialogContextLabel">
                {contextLabel}
              </span>
            ) : null}
            <span className="nameInputDialogContextValue">{contextValue}</span>
          </p>
        ) : null}
        <label className="nameInputDialogLabel" htmlFor={`${inputId}-field`}>
          <span className="nameInputDialogLabelText">{inputLabel}</span>
          <span className="nameInputDialogInputRow">
            <img
              className="nameInputDialogIcon"
              src={icon.url}
              alt={icon.alt ?? ""}
              aria-hidden={icon.alt ? undefined : "true"}
            />
            <input
              ref={inputRef}
              id={`${inputId}-field`}
              className="nameInputDialogInput"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={value}
              placeholder={placeholder}
              aria-describedby={
                activeError ? `${descriptionId} ${errorId}` : descriptionId
              }
              aria-invalid={activeError ? "true" : undefined}
              disabled={busy}
              onChange={(event) => updateValue(event.target.value)}
            />
          </span>
        </label>
        {activeError ? (
          <p id={errorId} className="nameInputDialogError" role="alert">
            {activeError.message}
          </p>
        ) : null}
      </form>
    </InfoDialog>
  );
}
