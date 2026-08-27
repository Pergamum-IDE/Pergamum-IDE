/**
 * Notification foundation (#266) — the DOM-free half.
 *
 * `NotificationToast` is an application-level, non-modal, information-only
 * channel: normal-operation notices that must not interrupt writing. It is
 * NOT for warnings or errors — those stay with the Dialog infrastructure.
 * There is deliberately no severity / priority / grouping / action-button
 * concept here (#266 non-scope).
 *
 * This controller owns notification state and each notification's own
 * auto-dismiss timer. It has no React and no DOM dependency so the add /
 * manual-dismiss / auto-dismiss / independent-timer-lifecycle rules can be
 * unit tested directly. `NotificationHost` wraps it in React state and is
 * responsible only for rendering the stack and keeping the auto-dismiss
 * duration in sync with Settings.
 *
 * Mirrors the split already used for dialogs (`DialogController` /
 * `DialogProvider`).
 */

export interface NotificationEntry {
  readonly id: string;
  /**
   * Already-translated display text. The controller is i18n-agnostic on
   * purpose: the call site owns `translate` (it is bound to the current
   * display language) and passes a resolved string, so no Japanese text is
   * ever embedded in the notification components themselves (#266 §10).
   */
  readonly message: string;
}

export interface NotifyOptions {
  readonly message: string;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface NotificationTimers {
  setTimeout: (handler: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
}

export interface NotificationControllerOptions {
  /**
   * Auto-dismiss duration (ms) applied to notifications created from now on.
   * Resolved from Settings (`workbench.notification.durationMs`) by the host
   * and kept current through `setAutoDismissMs`. `0` (the explicit "do not
   * auto-dismiss" setting value) — like any non-positive or non-finite
   * value — means no timer is scheduled and the toast only closes on manual
   * dismiss.
   */
  autoDismissMs?: number;
  timers?: NotificationTimers;
  generateId?: () => string;
}

const defaultTimers: NotificationTimers = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle)
};

export class NotificationController {
  private entries: readonly NotificationEntry[] = [];
  private readonly dismissTimers = new Map<string, TimeoutHandle>();
  private onChange: (() => void) | null = null;
  private autoDismissMs: number;
  private readonly timers: NotificationTimers;
  private readonly generateId: () => string;
  private sequence = 0;

  constructor(options: NotificationControllerOptions = {}) {
    this.autoDismissMs = options.autoDismissMs ?? 0;
    this.timers = options.timers ?? defaultTimers;
    this.generateId =
      options.generateId ?? (() => `notification-${++this.sequence}`);
  }

  /** `NotificationHost` calls this once to be notified when state changes. */
  subscribe(onChange: () => void): () => void {
    this.onChange = onChange;

    return () => {
      if (this.onChange === onChange) {
        this.onChange = null;
      }
    };
  }

  getNotifications(): readonly NotificationEntry[] {
    return this.entries;
  }

  /**
   * Updates the auto-dismiss duration used by *future* `notify` calls.
   * Notifications already on screen keep the timer they were scheduled with
   * (independent lifecycle, #266 §7) — changing the Settings value does not
   * retroactively shorten, extend, or cancel a visible toast.
   */
  setAutoDismissMs(autoDismissMs: number): void {
    this.autoDismissMs = autoDismissMs;
  }

  /**
   * Adds an information notification and returns its id. A new notification
   * never replaces an existing one — multiple toasts coexist, each with its
   * own lifecycle. When the current auto-dismiss duration is `> 0`, this
   * toast schedules its own dismissal timer; a duration of `0` (or any
   * non-positive / non-finite value) leaves it on screen until dismissed.
   */
  notify(options: NotifyOptions): string {
    const id = this.generateId();

    this.entries = [...this.entries, { id, message: options.message }];

    if (Number.isFinite(this.autoDismissMs) && this.autoDismissMs > 0) {
      const handle = this.timers.setTimeout(() => {
        this.dismissTimers.delete(id);

        if (this.removeById(id)) {
          this.onChange?.();
        }
      }, this.autoDismissMs);

      this.dismissTimers.set(id, handle);
    }

    this.onChange?.();

    return id;
  }

  /**
   * Manually dismisses a single notification. Independent of every other
   * notification's manual/auto dismissal. A stale id (already auto-dismissed
   * or never known) is a no-op.
   */
  dismiss(id: string): void {
    this.clearDismissTimer(id);

    if (this.removeById(id)) {
      this.onChange?.();
    }
  }

  /** Host unmount: drop every notification and cancel every pending timer. */
  dispose(): void {
    for (const handle of this.dismissTimers.values()) {
      this.timers.clearTimeout(handle);
    }

    this.dismissTimers.clear();
    this.entries = [];
    this.onChange = null;
  }

  private removeById(id: string): boolean {
    const nextEntries = this.entries.filter((entry) => entry.id !== id);

    if (nextEntries.length === this.entries.length) {
      return false;
    }

    this.entries = nextEntries;

    return true;
  }

  private clearDismissTimer(id: string): void {
    const handle = this.dismissTimers.get(id);

    if (handle !== undefined) {
      this.timers.clearTimeout(handle);
      this.dismissTimers.delete(id);
    }
  }
}
