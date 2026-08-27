/**
 * Notification foundation (#266) — the React half.
 *
 * Renders the bottom-right toast stack. New toasts are appended; CSS
 * (`flex-direction: column-reverse`) makes the newest sit at the bottom-right
 * corner and pushes older ones upward.
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
  type NotificationEntry
} from "./notificationController";
import { NotificationToast } from "./NotificationToast";

interface NotificationHostProps {
  controller: NotificationController;
  translate: Translate;
  /**
   * Auto-dismiss duration in milliseconds — passed straight through from
   * `effectiveSettings.workbench.notification.durationMs` (the setting is
   * already stored in this unit; `0` means "do not auto-dismiss"). Pushed
   * into the controller so future toasts pick it up; toasts already visible
   * keep their original timer.
   */
  autoDismissMs: number;
}

export function NotificationHost({
  controller,
  translate,
  autoDismissMs
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

  const closeButtonLabel = translate("notification.dismiss");

  return (
    <ol className="notificationHost" aria-live="polite" aria-atomic="false">
      {entries.map((entry) => (
        <NotificationToast
          key={entry.id}
          message={entry.message}
          closeButtonLabel={closeButtonLabel}
          onDismiss={() => controller.dismiss(entry.id)}
        />
      ))}
    </ol>
  );
}
