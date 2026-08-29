/**
 * Notification foundation (#266) — the DOM-free half.
 *
 * `NotificationToast` is an application-level, non-modal, information-only
 * channel: normal-operation notices that must not interrupt writing. It is
 * NOT for warnings or errors — those stay with the Dialog infrastructure.
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

import type { ApplicationMenuCommandId } from "../../shared/commandIds";
import type { TranslationKey } from "../../shared/i18n";

export type NotificationToastLane = "internal" | "external" | "ambient";
export type NotificationPriority = number;

export type NotificationToastIcon =
  | { readonly kind: "none" }
  | {
      readonly kind: "preset";
      readonly name:
        | "info"
        | "success"
        | "recovery"
        | "credits"
        | "pergamum";
    };

export type NotificationToastPlacement =
  | { readonly kind: "viewportBottomEnd" }
  | {
      readonly kind: "anchorRect";
      readonly rect: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
      readonly preferredPlacement: "above" | "below" | "right" | "left";
    };

export type NotificationToastMotion =
  | { readonly kind: "slideUpFade" }
  | { readonly kind: "fade" }
  | { readonly kind: "none" }
  | {
      readonly kind: "marquee";
      readonly direction: "inlineStart" | "inlineEnd";
    };

export interface NotificationToastAction {
  readonly kind: "command";
  readonly commandId: ApplicationMenuCommandId;
  readonly labelKey: TranslationKey;
}

export interface NotificationToastDetailRow {
  readonly label: string;
  readonly value: string;
}

export interface NotificationToastRequest {
  readonly id?: string;
  readonly lane?: NotificationToastLane;
  readonly priority?: NotificationPriority;
  readonly message: string;
  readonly icon?: NotificationToastIcon;
  readonly placement?: NotificationToastPlacement;
  readonly motion?: NotificationToastMotion;
  readonly action?: NotificationToastAction;
  readonly detailRows?: readonly NotificationToastDetailRow[];
  readonly durationMs?: number;
  readonly createdAt?: string;
}

export const notificationToastDefaultPriority = 10;
export const notificationToastMinDurationMs = 3_000;
export const notificationToastMaxDurationMs = 30_000;

export const notificationToastPriority = {
  ambient: 0,
  info: 10,
  success: 20,
  recoveryReminder: 30
} as const;

const notificationToastLaneOrder: readonly NotificationToastLane[] = [
  "internal",
  "external",
  "ambient"
];

const notificationToastDefaultVisibleLimits: Record<
  NotificationToastLane,
  number
> = {
  internal: 3,
  external: 3,
  ambient: 1
};

export interface NotificationEntry {
  readonly id: string;
  /**
   * Already-translated display text. The controller is i18n-agnostic on
   * purpose: the call site owns `translate` (it is bound to the current
   * display language) and passes a resolved string, so no Japanese text is
   * ever embedded in the notification components themselves (#266 §10).
   */
  readonly lane: NotificationToastLane;
  readonly priority: NotificationPriority;
  readonly message: string;
  readonly icon: NotificationToastIcon;
  readonly placement: NotificationToastPlacement;
  readonly motion: NotificationToastMotion;
  readonly action?: NotificationToastAction;
  readonly detailRows: readonly NotificationToastDetailRow[];
  readonly durationMs: number | null;
  readonly createdAt: string;
}

export type NotifyOptions = NotificationToastRequest;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface NotificationTimers {
  setTimeout: (handler: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
}

export interface NotificationControllerOptions {
  /**
   * Auto-dismiss duration (ms) applied to notifications created from now on.
   * Resolved from Settings (`workbench.notification.durationMs`) by the host
   * and kept current through `setAutoDismissMs`. #298 treats this as the
   * base duration: each request can override it, and the resolved value is
   * priority-adjusted then clamped to the safe min/max before a timer is
   * scheduled. `0` keeps the existing #266 meaning: do not auto-dismiss.
   */
  autoDismissMs?: number;
  outputEnabled?: boolean;
  visibleLimits?: Partial<Record<NotificationToastLane, number>>;
  timers?: NotificationTimers;
  generateId?: () => string;
  now?: () => string;
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
  private outputEnabled: boolean;
  private readonly visibleLimits: Record<NotificationToastLane, number>;
  private readonly timers: NotificationTimers;
  private readonly generateId: () => string;
  private readonly now: () => string;
  private sequence = 0;

  constructor(options: NotificationControllerOptions = {}) {
    this.autoDismissMs = options.autoDismissMs ?? 0;
    this.outputEnabled = options.outputEnabled ?? true;
    this.visibleLimits = {
      ...notificationToastDefaultVisibleLimits,
      ...options.visibleLimits
    };
    this.timers = options.timers ?? defaultTimers;
    this.generateId =
      options.generateId ?? (() => `notification-${++this.sequence}`);
    this.now = options.now ?? (() => new Date().toISOString());
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
   * Settings-controlled output gate (#298). Disabling in-app notification
   * output removes existing toasts and cancels their timers, but this
   * controller has no connection to Error dialogs, status-bar messages, or
   * Recovery modals.
   */
  setOutputEnabled(outputEnabled: boolean): void {
    if (this.outputEnabled === outputEnabled) {
      return;
    }

    this.outputEnabled = outputEnabled;

    if (!outputEnabled && this.entries.length > 0) {
      this.clearAllDismissTimers();
      this.entries = [];
      this.onChange?.();
    }
  }

  /**
   * Adds an information notification and returns its id. A new notification
   * never replaces an existing one — multiple toasts coexist, each with its
   * own lifecycle. Each accepted toast schedules its own dismissal timer
   * from the #298 duration resolver unless that resolver returns `null`;
   * disabling output is the only path that suppresses toast creation here.
   */
  notify(options: NotifyOptions): string | null {
    if (!this.outputEnabled) {
      return null;
    }

    const entry = this.normalizeRequest(options);
    const nextEntries = this.enforceLaneLimit(
      [...this.entries, entry],
      entry.lane
    );
    const accepted = nextEntries.some((candidate) => candidate.id === entry.id);
    const droppedIds = new Set(
      [...this.entries, entry]
        .filter(
          (candidate) =>
            !nextEntries.some((nextEntry) => nextEntry.id === candidate.id)
        )
        .map((candidate) => candidate.id)
    );

    for (const droppedId of droppedIds) {
      this.clearDismissTimer(droppedId);
    }

    if (!accepted && droppedIds.size === 1 && droppedIds.has(entry.id)) {
      return null;
    }

    this.entries = this.sortEntries(nextEntries);

    if (accepted && entry.durationMs !== null) {
      const handle = this.timers.setTimeout(() => {
        this.dismissTimers.delete(entry.id);

        if (this.removeById(entry.id)) {
          this.onChange?.();
        }
      }, entry.durationMs);

      this.dismissTimers.set(entry.id, handle);
    }

    this.onChange?.();

    return accepted ? entry.id : null;
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
    this.clearAllDismissTimers();
    this.entries = [];
    this.onChange = null;
  }

  private normalizeRequest(request: NotificationToastRequest): NotificationEntry {
    const lane = normalizeLane(request.lane);
    const priority = clampPriority(request.priority);
    const action = normalizeAction(request.action);

    return {
      id: this.uniqueId(request.id),
      lane,
      priority,
      message: request.message,
      icon: normalizeIcon(request.icon),
      placement: normalizePlacement(request.placement),
      motion: normalizeMotion(request.motion, lane, action),
      action,
      detailRows: normalizeDetailRows(request.detailRows),
      durationMs: resolveNotificationDurationMs({
        baseDurationMs: this.autoDismissMs,
        explicitDurationMs: request.durationMs,
        priority
      }),
      createdAt: normalizeCreatedAt(request.createdAt, this.now)
    };
  }

  private uniqueId(requestedId: string | undefined): string {
    const trimmedId = requestedId?.trim();

    if (
      trimmedId &&
      !this.entries.some((entry) => entry.id === trimmedId)
    ) {
      return trimmedId;
    }

    let id = this.generateId();

    while (this.entries.some((entry) => entry.id === id)) {
      id = this.generateId();
    }

    return id;
  }

  private enforceLaneLimit(
    entries: readonly NotificationEntry[],
    lane: NotificationToastLane
  ): readonly NotificationEntry[] {
    const limit = normalizeVisibleLimit(this.visibleLimits[lane]);
    const laneEntries = entries.filter((entry) => entry.lane === lane);

    if (laneEntries.length <= limit) {
      return entries;
    }

    const dropCount = laneEntries.length - limit;
    const dropIds = new Set(
      [...laneEntries]
        .sort(compareDropPriority)
        .slice(0, dropCount)
        .map((entry) => entry.id)
    );

    return entries.filter((entry) => !dropIds.has(entry.id));
  }

  private sortEntries(
    entries: readonly NotificationEntry[]
  ): readonly NotificationEntry[] {
    return [...entries].sort(compareDisplayPriority);
  }

  private clearAllDismissTimers(): void {
    for (const handle of this.dismissTimers.values()) {
      this.timers.clearTimeout(handle);
    }

    this.dismissTimers.clear();
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

function normalizeLane(
  lane: NotificationToastLane | undefined
): NotificationToastLane {
  return lane && notificationToastLaneOrder.includes(lane)
    ? lane
    : "internal";
}

export function clampPriority(priority: unknown): NotificationPriority {
  if (typeof priority !== "number" || !Number.isFinite(priority)) {
    return notificationToastDefaultPriority;
  }

  return Math.min(100, Math.max(0, priority));
}

function clampDuration(durationMs: number): number {
  return Math.min(
    notificationToastMaxDurationMs,
    Math.max(notificationToastMinDurationMs, Math.round(durationMs))
  );
}

export function resolveNotificationDurationMs({
  baseDurationMs,
  explicitDurationMs,
  priority
}: {
  readonly baseDurationMs: number;
  readonly explicitDurationMs?: number;
  readonly priority: NotificationPriority;
}): number | null {
  if (
    explicitDurationMs !== undefined &&
    Number.isFinite(explicitDurationMs)
  ) {
    if (explicitDurationMs <= 0) {
      return null;
    }

    return clampDuration(explicitDurationMs);
  }

  if (baseDurationMs <= 0) {
    return null;
  }

  if (!Number.isFinite(baseDurationMs)) {
    return notificationToastMinDurationMs;
  }

  return clampDuration(baseDurationMs * (1 + clampPriority(priority) / 100));
}

function normalizeIcon(
  icon: NotificationToastIcon | undefined
): NotificationToastIcon {
  if (icon?.kind === "none") {
    return { kind: "none" };
  }

  if (
    icon?.kind === "preset" &&
    ["info", "success", "recovery", "credits", "pergamum"].includes(icon.name)
  ) {
    return { kind: "preset", name: icon.name };
  }

  return { kind: "preset", name: "info" };
}

function normalizePlacement(
  placement: NotificationToastPlacement | undefined
): NotificationToastPlacement {
  if (placement?.kind !== "anchorRect") {
    return { kind: "viewportBottomEnd" };
  }

  const { rect, preferredPlacement } = placement;

  if (
    !["above", "below", "right", "left"].includes(preferredPlacement) ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width < 0 ||
    rect.height < 0
  ) {
    return { kind: "viewportBottomEnd" };
  }

  return {
    kind: "anchorRect",
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    preferredPlacement
  };
}

function normalizeMotion(
  motion: NotificationToastMotion | undefined,
  lane: NotificationToastLane,
  action: NotificationToastAction | undefined
): NotificationToastMotion {
  if (motion?.kind === "fade" || motion?.kind === "none") {
    return motion;
  }

  if (motion?.kind === "marquee") {
    if (lane !== "ambient" || action) {
      return { kind: "slideUpFade" };
    }

    return {
      kind: "marquee",
      direction:
        motion.direction === "inlineEnd" ? "inlineEnd" : "inlineStart"
    };
  }

  return { kind: "slideUpFade" };
}

function normalizeAction(
  action: NotificationToastAction | undefined
): NotificationToastAction | undefined {
  return action?.kind === "command" ? action : undefined;
}

function normalizeDetailRows(
  rows: readonly NotificationToastDetailRow[] | undefined
): readonly NotificationToastDetailRow[] {
  if (!rows) {
    return [];
  }

  return rows
    .filter(
      (row) =>
        typeof row.label === "string" &&
        row.label.trim().length > 0 &&
        typeof row.value === "string" &&
        row.value.trim().length > 0
    )
    .map((row) => ({ label: row.label, value: row.value }));
}

function normalizeCreatedAt(
  createdAt: string | undefined,
  now: () => string
): string {
  if (typeof createdAt === "string" && Number.isFinite(Date.parse(createdAt))) {
    return createdAt;
  }

  return now();
}

function normalizeVisibleLimit(limit: number | undefined): number {
  if (
    typeof limit !== "number" ||
    !Number.isFinite(limit) ||
    limit < 0
  ) {
    return 0;
  }

  return Math.floor(limit);
}

function laneRank(lane: NotificationToastLane): number {
  return notificationToastLaneOrder.indexOf(lane);
}

function createdAtMillis(entry: NotificationEntry): number {
  return Date.parse(entry.createdAt);
}

function compareDisplayPriority(
  a: NotificationEntry,
  b: NotificationEntry
): number {
  const laneDelta = laneRank(a.lane) - laneRank(b.lane);

  if (laneDelta !== 0) {
    return laneDelta;
  }

  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }

  return createdAtMillis(a) - createdAtMillis(b);
}

function compareDropPriority(
  a: NotificationEntry,
  b: NotificationEntry
): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  return createdAtMillis(a) - createdAtMillis(b);
}
