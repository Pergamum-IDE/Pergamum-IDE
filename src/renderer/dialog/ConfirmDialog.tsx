import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { Translate } from "../../shared/i18n";
import {
  confirmDialogDismissesOnBackdropClick,
  confirmDialogTone,
  type AppConfirmDialogOptions,
  type AppConfirmDialogResult,
  type AppDialogActionOrder
} from "./appDialogTypes";
import {
  handleConfirmDialogBackdropClick,
  handleConfirmDialogKeyDown
} from "./confirmDialogHandlers";
import {
  performClipboardCopy,
  type ClipboardAdapter
} from "./clipboardAdapter";
import {
  dialogCopiedButtonIconSvg,
  dialogCopyButtonIconSvg,
  dialogIconSvgByKind
} from "./dialogIcons";
import { DialogMessage } from "./DialogMessage";

export interface ConfirmDialogProps {
  options: AppConfirmDialogOptions;
  actionOrder: AppDialogActionOrder;
  translate: Translate;
  clipboardAdapter: ClipboardAdapter;
  /**
   * The element focused immediately before this dialog opened, captured by
   * `DialogProvider` before mount (D-16). Must not be captured inside this
   * component's own effect — by the time an effect runs here, the
   * `autoFocus` buttons below have already taken focus, so
   * `document.activeElement` would no longer be the true opener.
   */
  opener: Element | null;
  onResult: (result: AppConfirmDialogResult) => void;
}

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isFocusTrapCandidate(element: HTMLElement): boolean {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.tabIndex >= 0
  );
}

function focusableElementsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector)
  ).filter(isFocusTrapCandidate);
}

/**
 * Renderer-owned confirm dialog (#182 D-1). Message text is rendered as a
 * plain JSX text child (never `dangerouslySetInnerHTML`) so HTML-like input
 * such as `<script>` is always displayed as text (D-7). Icon and copy-button
 * SVGs *do* use `dangerouslySetInnerHTML`, matching the existing
 * DocumentTabBar.tsx convention — those are trusted, build-time-bundled
 * static assets, not user-controlled dialog content, so this does not
 * conflict with the D-7 prohibition (which is specifically about dialog
 * message content).
 */
type TechnicalInfoCopyState = "idle" | "copied" | "failed";
const TECHNICAL_INFO_COPY_FEEDBACK_MS = 5000;

export function ConfirmDialog({
  options,
  actionOrder,
  translate,
  clipboardAdapter,
  opener,
  onResult
}: ConfirmDialogProps): JSX.Element {
  const tone = confirmDialogTone(options);
  const isDestructive = tone === "destructive";
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<TechnicalInfoCopyState>("idle");
  const [isCopying, setIsCopying] = useState(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCopyFeedbackTimer(): void {
    if (copyFeedbackTimerRef.current !== null) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
  }

  const confirmLabel = options.confirmLabel ?? translate("common.ok");
  const cancelLabel =
    options.cancelLabel === null
      ? null
      : options.cancelLabel ?? translate("common.cancel");
  const clipboardText = options.clipboardText;
  const hasCopyButton = Boolean(clipboardText);

  useEffect(() => {
    return () => {
      clearCopyFeedbackTimer();
      if (
        opener instanceof HTMLElement &&
        typeof document !== "undefined" &&
        document.contains(opener)
      ) {
        opener.focus();
      }
    };
  }, [opener]);

  function handleContainerKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>
  ): void {
    if (handleConfirmDialogKeyDown(event, onResult)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }

    const elements = focusableElementsIn(dialogRef.current);

    if (elements.length === 0) {
      return;
    }

    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !dialogRef.current.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !dialogRef.current.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleCopyClick(): Promise<void> {
    if (!clipboardText || isCopying) {
      return;
    }

    setIsCopying(true);
    let copySucceeded = false;
    try {
      const result = await performClipboardCopy(clipboardAdapter, clipboardText);
      copySucceeded = result.ok;
    } catch {
      copySucceeded = false;
    } finally {
      setIsCopying(false);
    }

    clearCopyFeedbackTimer();
    const nextState = copySucceeded ? "copied" : "failed";
    setCopyState(nextState);
    copyFeedbackTimerRef.current = setTimeout(() => {
      copyFeedbackTimerRef.current = null;
      setCopyState("idle");
    }, TECHNICAL_INFO_COPY_FEEDBACK_MS);
  }

  const confirmButton = (
    <button
      key="confirm"
      type="button"
      className="appDialogButton appDialogButton-confirm"
      autoFocus={!isDestructive}
      onClick={() => onResult("confirm")}
    >
      {confirmLabel}
    </button>
  );

  const cancelButton =
    cancelLabel === null ? null : (
      <button
        key="cancel"
        type="button"
        className="appDialogButton appDialogButton-cancel"
        autoFocus={isDestructive}
        onClick={() => onResult("cancel")}
      >
        {cancelLabel}
      </button>
    );

  // D-11 / D-15 / #187: DOM order follows the platform action order. Visual
  // order is resolved by CSS and the effective writing direction; in LTR
  // contexts, DOM order and visual order match. Result semantics never
  // change — the confirm button always resolves "confirm" and the cancel
  // button always resolves "cancel" regardless of placement.
  const actionButtons =
    actionOrder === "confirmCancel"
      ? [confirmButton, cancelButton].filter(Boolean)
      : [cancelButton, confirmButton].filter(Boolean);

  const titleId = "appDialogTitle";
  const messageId = "appDialogMessage";

  const isCopied = copyState === "copied";
  const copyFailed = copyState === "failed";
  const copyButtonTitle = isCopied
    ? translate("dialog.about.copyTechnicalInfoCopied")
    : options.clipboardTextTitle ?? translate("dialog.copyErrorDetails");
  const copyButtonIconSvg = isCopied
    ? dialogCopiedButtonIconSvg
    : dialogCopyButtonIconSvg;

  return (
    <div
      className="appDialogBackdrop"
      onClick={() =>
        handleConfirmDialogBackdropClick(
          onResult,
          confirmDialogDismissesOnBackdropClick(options)
        )
      }
    >
      <div
        ref={dialogRef}
        className={
          isDestructive ? "appDialog appDialog-destructive" : "appDialog"
        }
        role={isDestructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) =>
          event.stopPropagation()
        }
        onKeyDown={handleContainerKeyDown}
      >
        <div className="appDialogHeader">
          {options.icon ? (
            <span
              className={`appDialogIcon appDialogIcon-${options.icon.kind}`}
              role="img"
              aria-label={options.icon.tooltip}
              title={options.icon.tooltip}
              dangerouslySetInnerHTML={{
                __html: dialogIconSvgByKind[options.icon.kind]
              }}
            />
          ) : null}
          <h2 id={titleId} className="appDialogTitle">
            {options.title}
          </h2>
        </div>
        <div className="appDialogBody">
          <DialogMessage id={messageId} message={options.message} />
        </div>
        <div className="appDialogFooter">
          <div className="appDialogFooterCopy" style={{ position: "relative" }}>
            {hasCopyButton ? (
              <button
                type="button"
                className="appDialogCopyButton"
                aria-label={copyButtonTitle}
                title={copyButtonTitle}
                disabled={isCopying}
                onClick={() => {
                  void handleCopyClick();
                }}
                dangerouslySetInnerHTML={{ __html: copyButtonIconSvg }}
              />
            ) : null}
            {isCopied ? (
              <span
                className="appDialogCopyToast appDialogCopyToast-copied"
                role="status"
                aria-live="polite"
              >
                {translate("dialog.about.copyTechnicalInfoCopied")}
              </span>
            ) : null}
            {copyFailed ? (
              <span className="appDialogCopyFailure" role="alert">
                {translate("dialog.copyErrorDetailsFailed")}
              </span>
            ) : null}
          </div>
          <div className="appDialogActions">{actionButtons}</div>
        </div>
      </div>
    </div>
  );
}
