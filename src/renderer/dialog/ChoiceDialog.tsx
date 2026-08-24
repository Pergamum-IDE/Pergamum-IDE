import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import type { AppPlatform } from "../../shared/platform";
import type { Translate } from "../../shared/i18n";
import {
  choiceDialogDismissesOnBackdropClick,
  resolveChoiceDialogActionOrder,
  resolveInitialFocusChoiceId,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult,
  type AppDialogChoiceRole
} from "./appDialogTypes";
import {
  choiceDialogChosenResult,
  handleChoiceDialogBackdropClick,
  handleChoiceDialogKeyDown
} from "./choiceDialogHandlers";
import {
  performClipboardCopy,
  type ClipboardAdapter
} from "./clipboardAdapter";
import {
  dialogChoiceIconSvgByKind,
  dialogCopyButtonIconSvg,
  dialogIconSvgByKind
} from "./dialogIcons";
import { DialogMessage } from "./DialogMessage";

export interface ChoiceDialogProps {
  options: AppChoiceDialogOptions;
  platform: AppPlatform;
  translate: Translate;
  clipboardAdapter: ClipboardAdapter;
  opener: Element | null;
  onResult: (result: AppChoiceDialogResult) => void;
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

function choiceButtonClassName(role: AppDialogChoiceRole): string {
  const classes = [
    "appDialogButton",
    "appDialogButton-choice",
    `appDialogButton-choice-${role}`
  ];

  if (role === "primary") {
    classes.push("appDialogButton-confirm");
  } else if (role === "cancel") {
    classes.push("appDialogButton-cancel");
  }

  return classes.join(" ");
}

/**
 * Renderer-owned multi-choice dialog (#192). This is intentionally separate
 * from `ConfirmDialog`: choice IDs are stable business results, while labels
 * are display text only. Message text is rendered as a plain JSX text child;
 * HTML message rendering is not supported.
 */
export function ChoiceDialog({
  options,
  platform,
  translate,
  clipboardAdapter,
  opener,
  onResult
}: ChoiceDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const actionChoices = resolveChoiceDialogActionOrder(options, platform);
  const initialFocusChoiceId = resolveInitialFocusChoiceId(options);
  const clipboardText = options.clipboardText ?? null;
  const hasCopyButton = Boolean(clipboardText);
  const hasCopyContent = hasCopyButton || copyFailed;
  const hasDestructiveChoice = options.choices.some(
    (choice) => choice.role === "destructive"
  );
  const dialogClasses = ["appDialog", "appDialog-choice"];
  const footerClasses = [
    "appDialogFooter",
    hasCopyContent ? "appDialogFooter-hasCopy" : "appDialogFooter-noCopy"
  ];

  if (hasDestructiveChoice) {
    dialogClasses.push("appDialog-choice-hasDestructive");
  }

  if (options.icon?.kind === "warning") {
    dialogClasses.push("appDialog-warning");
  }

  useEffect(() => {
    return () => {
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
    if (handleChoiceDialogKeyDown(event, onResult)) {
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
    const result = await performClipboardCopy(clipboardAdapter, clipboardText);
    setIsCopying(false);
    setCopyFailed(!result.ok);
  }

  const titleId = "appChoiceDialogTitle";
  const messageId = "appChoiceDialogMessage";

  return (
    <div
      className="appDialogBackdrop"
      onClick={() =>
        handleChoiceDialogBackdropClick(
          onResult,
          choiceDialogDismissesOnBackdropClick(options)
        )
      }
    >
      <div
        ref={dialogRef}
        className={dialogClasses.join(" ")}
        role={hasDestructiveChoice ? "alertdialog" : "dialog"}
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
        <div className={footerClasses.join(" ")}>
          <div className="appDialogFooterCopy">
            {hasCopyButton ? (
              <button
                type="button"
                className="appDialogCopyButton"
                aria-label={translate("dialog.copyErrorDetails")}
                title={translate("dialog.copyErrorDetails")}
                onClick={() => {
                  void handleCopyClick();
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
            {actionChoices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={choiceButtonClassName(choice.role)}
                data-choice-id={choice.id}
                autoFocus={choice.id === initialFocusChoiceId}
                onClick={() => onResult(choiceDialogChosenResult(choice.id))}
              >
                {choice.icon ? (
                  <span
                    className={`appDialogButtonIcon appDialogButtonIcon-${choice.icon.kind}`}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{
                      __html: dialogChoiceIconSvgByKind[choice.icon.kind]
                    }}
                  />
                ) : null}
                <span className="appDialogButtonLabel">{choice.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
