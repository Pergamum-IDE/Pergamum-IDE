/**
 * Notification foundation (#266) — the React half.
 *
 * Renders the bottom-right toast stack. The controller owns lane / priority /
 * createdAt ordering; the host keeps the live region stable and maps entries
 * to non-modal toast DOM.
 *
 * Responsibilities kept here (everything else is in `NotificationController`):
 *  - subscribe to the controller and re-render on change;
 *  - keep the controller's auto-dismiss duration in sync with Settings;
 *  - resolve the (i18n) close-button label once and hand each toast a
 *    plain string, so the leaf component stays i18n-free.
 *
 * The host is a passive, non-modal overlay: no backdrop, no focus trap, it
 * never calls `focus()`. The container is always mounted (even with zero
 * toasts) so the `aria-live="polite"` region is stable — additions are
 * announced calmly, never assertively (#266 §12).
 */

import { useEffect, useState } from "react";
import type { Translate } from "../../shared/i18n";
import {
  NotificationController,
  type NotificationEntry,
  type NotificationToastAction
} from "./notificationController";
import { NotificationToast } from "./NotificationToast";

interface NotificationHostProps {
  controller: NotificationController;
  translate: Translate;
  /**
   * Auto-dismiss duration in milliseconds — passed straight through from
   * `effectiveSettings.workbench.notification.durationMs` (the setting is
   * already stored in this unit). Pushed into the controller so future
   * toasts pick it up; toasts already visible keep their original timer.
   * The controller keeps `0 = no auto-dismiss`; positive values receive
   * #298 priority adjustment and safe min/max clamp.
   */
  autoDismissMs: number;
  outputEnabled: boolean;
  isActionEnabled?: (action: NotificationToastAction) => boolean;
  onExecuteAction?: (action: NotificationToastAction) => void;
}

export function NotificationHost({
  controller,
  translate,
  autoDismissMs,
  outputEnabled,
  isActionEnabled,
  onExecuteAction
}: NotificationHostProps): JSX.Element {
  const [entries, setEntries] = useState<readonly NotificationEntry[]>(() =>
    controller.getNotifications()
  );

  useEffect(
    () =>
      controller.subscribe(() =>
        setEntries(controller.getNotifications())
      ),
    [controller]
  );

  useEffect(() => {
    controller.setAutoDismissMs(autoDismissMs);
  }, [controller, autoDismissMs]);

  useEffect(() => {
    controller.setOutputEnabled(outputEnabled);
  }, [controller, outputEnabled]);

  const closeButtonLabel = translate("notification.dismiss");

  const viewportEntries = entries.filter(
    (entry) => entry.placement.kind === "viewportBottomEnd"
  );
  const anchorEntries = entries.filter(
    (entry) => entry.placement.kind === "anchorRect"
  );

  function renderToast(entry: NotificationEntry): JSX.Element {
    return (
      <NotificationToast
        key={entry.id}
        message={entry.message}
        icon={entry.icon}
        placement={entry.placement}
        motion={entry.motion}
        detailRows={entry.detailRows}
        actionLabel={entry.action ? translate(entry.action.labelKey) : undefined}
        actionDisabled={
          entry.action && isActionEnabled
            ? !isActionEnabled(entry.action)
            : false
        }
        closeButtonLabel={closeButtonLabel}
        onAction={
          entry.action && onExecuteAction
            ? () => onExecuteAction(entry.action as NotificationToastAction)
            : undefined
        }
        onDismiss={() => controller.dismiss(entry.id)}
      />
    );
  }

  return (
    <>
      <ol
        className="notificationHost notificationHost-viewport"
        aria-live="polite"
        aria-atomic="false"
      >
        {viewportEntries.map(renderToast)}
      </ol>
      <ol
        className="notificationHost notificationHost-anchorLayer"
        aria-live="polite"
        aria-atomic="false"
      >
        {anchorEntries.map(renderToast)}
      </ol>
    </>
  );
}
