/**
 * Notification foundation (#266) — a single information toast.
 *
 * Layout contract:
 *  - the message is plain text DOM (IME-safe, selectable, no rich content);
 *  - the close button sits at the inline-end (right) edge of the toast,
 *    after the message, and never shrinks away however long the message is
 *    (`flex: 0 0 auto` on the button, `min-inline-size: 0` on the message);
 *  - the button is a real <button> — keyboard operable — with an accessible
 *    name from i18n; the × glyph itself is decorative (`aria-hidden`).
 *
 * The component never calls `focus()` on itself or the button — a toast
 * appearing must not move focus away from the editor (#266 §3 / §12).
 */

interface NotificationToastProps {
  message: string;
  /** Accessible name for the dismiss button (already translated). */
  closeButtonLabel: string;
  onDismiss: () => void;
}

export function NotificationToast({
  message,
  closeButtonLabel,
  onDismiss
}: NotificationToastProps): JSX.Element {
  return (
    <li className="notificationToast">
      <span className="notificationToastMessage">{message}</span>
      <button
        type="button"
        className="notificationToastClose"
        aria-label={closeButtonLabel}
        title={closeButtonLabel}
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}
