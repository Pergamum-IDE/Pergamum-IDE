import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from "react";
import { handleInfoDialogKeyDown } from "./infoDialogHandlers";

export interface InfoDialogProps {
  title: string;
  opener: Element | null;
  children: ReactNode;
  footer: ReactNode;
  hideVisualTitle?: boolean;
  onClose: () => void;
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

export function InfoDialog({
  title,
  opener,
  children,
  footer,
  hideVisualTitle = false,
  onClose
}: InfoDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const bodyId = `${dialogId}-body`;
  const titleHeading = (
    <h2
      id={titleId}
      className={hideVisualTitle ? "appInfoDialogHiddenTitle" : "appDialogTitle"}
    >
      {title}
    </h2>
  );

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
    if (handleInfoDialogKeyDown(event, onClose)) {
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

  return (
    <div className="appDialogBackdrop">
      <div
        ref={dialogRef}
        className="appDialog appInfoDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClick={(event: ReactMouseEvent<HTMLDivElement>) =>
          event.stopPropagation()
        }
        onKeyDown={handleContainerKeyDown}
      >
        {hideVisualTitle ? (
          titleHeading
        ) : (
          <div className="appDialogHeader appInfoDialogHeader">
            {titleHeading}
          </div>
        )}
        <div id={bodyId} className="appDialogBody appInfoDialogBody">
          {children}
        </div>
        <div className="appDialogFooter appInfoDialogFooter">{footer}</div>
      </div>
    </div>
  );
}
