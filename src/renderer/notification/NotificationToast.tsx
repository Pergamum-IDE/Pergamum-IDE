/**
 * Notification foundation (#266) — a single information toast.
 *
 * Layout contract:
 *  - the message is plain text DOM (IME-safe, selectable, no rich content);
 *  - icons are selected from trusted preset asset URLs only;
 *  - the close button sits at the inline-end (right) edge of the toast,
 *    after the message, and never shrinks away however long the message is
 *    (`flex: 0 0 auto` on the button, `min-inline-size: 0` on the message);
 *  - the button is a real <button> — keyboard operable — with an accessible
 *    name from i18n; the × glyph itself is decorative (`aria-hidden`).
 *
 * The component never calls `focus()` on itself or the button — a toast
 * appearing must not move focus away from the editor (#266 §3 / §12).
 */

import type { CSSProperties } from "react";
import pergamumIconUrl from "../../../assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.svg?url";
import checkSquareIconUrl from "../../../assets/icons/feather/dialog/check-square.svg?url";
import helpCircleIconUrl from "../../../assets/icons/feather/dialog/help-circle.svg?url";
import infoIconUrl from "../../../assets/icons/feather/dialog/info.svg?url";
import shieldIconUrl from "../../../assets/icons/feather/global/shield.svg?url";
import type {
  NotificationToastDetailRow,
  NotificationToastIcon,
  NotificationToastMotion,
  NotificationToastPlacement
} from "./notificationController";

interface NotificationToastProps {
  message: string;
  icon?: NotificationToastIcon;
  placement?: NotificationToastPlacement;
  motion?: NotificationToastMotion;
  detailRows?: readonly NotificationToastDetailRow[];
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  /** Accessible name for the dismiss button (already translated). */
  closeButtonLabel: string;
  onDismiss: () => void;
}

export interface NotificationViewport {
  readonly width: number;
  readonly height: number;
}

const anchorGapPx = 8;
const viewportMarginPx = 16;
const estimatedToastMaxWidthPx = 360;
const estimatedDetailCardMaxWidthPx = 520;
const estimatedToastMaxHeightPx = 160;
const estimatedDetailCardMaxHeightPx = 384;

const presetIconUrlByName: Record<
  Exclude<NotificationToastIcon, { readonly kind: "none" }>["name"],
  string
> = {
  info: infoIconUrl,
  success: checkSquareIconUrl,
  recovery: shieldIconUrl,
  credits: helpCircleIconUrl,
  pergamum: pergamumIconUrl
};

function classNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

function viewportSize(): NotificationViewport {
  if (typeof window === "undefined") {
    return {
      width: estimatedToastMaxWidthPx + viewportMarginPx * 2,
      height: estimatedToastMaxHeightPx + viewportMarginPx * 2
    };
  }

  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function notificationToastPlacementStyle(
  placement: NotificationToastPlacement | undefined,
  viewport: NotificationViewport = viewportSize(),
  options: { readonly detailCard?: boolean } = {}
): CSSProperties | undefined {
  if (placement?.kind !== "anchorRect") {
    return undefined;
  }

  const { rect, preferredPlacement } = placement;

  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width < 0 ||
    rect.height < 0
  ) {
    return undefined;
  }

  const anchorIsInsideViewport =
    rect.x + rect.width >= 0 &&
    rect.x <= viewport.width &&
    rect.y + rect.height >= 0 &&
    rect.y <= viewport.height;

  if (!anchorIsInsideViewport) {
    return undefined;
  }

  const estimatedMaxWidth = options.detailCard
    ? estimatedDetailCardMaxWidthPx
    : estimatedToastMaxWidthPx;
  const estimatedMaxHeight = options.detailCard
    ? estimatedDetailCardMaxHeightPx
    : estimatedToastMaxHeightPx;
  const maxInlineStart =
    viewport.width - estimatedMaxWidth - viewportMarginPx;
  const maxBlockStart =
    viewport.height - estimatedMaxHeight - viewportMarginPx;
  const inlineStart = clamp(rect.x, viewportMarginPx, maxInlineStart);
  const blockStart = clamp(rect.y, viewportMarginPx, maxBlockStart);

  switch (preferredPlacement) {
    case "above":
      return {
        position: "fixed",
        insetInlineStart: `${inlineStart}px`,
        insetBlockEnd: `${clamp(
          viewport.height - rect.y + anchorGapPx,
          viewportMarginPx,
          viewport.height - viewportMarginPx
        )}px`
      };
    case "below":
      return {
        position: "fixed",
        insetInlineStart: `${inlineStart}px`,
        insetBlockStart: `${clamp(
          rect.y + rect.height + anchorGapPx,
          viewportMarginPx,
          maxBlockStart
        )}px`
      };
    case "right":
      return {
        position: "fixed",
        insetInlineStart: `${clamp(
          rect.x + rect.width + anchorGapPx,
          viewportMarginPx,
          maxInlineStart
        )}px`,
        insetBlockStart: `${blockStart}px`
      };
    case "left":
      return {
        position: "fixed",
        insetInlineEnd: `${clamp(
          viewport.width - rect.x + anchorGapPx,
          viewportMarginPx,
          viewport.width - viewportMarginPx
        )}px`,
        insetBlockStart: `${blockStart}px`
      };
  }
}

function iconUrlFor(icon: NotificationToastIcon | undefined): string | null {
  if (icon?.kind !== "preset") {
    return null;
  }

  return presetIconUrlByName[icon.name] ?? null;
}

function motionClassName(motion: NotificationToastMotion | undefined): string {
  switch (motion?.kind) {
    case "fade":
      return "notificationToast-motionFade";
    case "none":
      return "notificationToast-motionNone";
    case "marquee":
      return classNames(
        "notificationToast-motionMarquee",
        motion.direction === "inlineEnd"
          ? "notificationToast-marqueeInlineEnd"
          : "notificationToast-marqueeInlineStart"
      );
    case "slideUpFade":
    default:
      return "notificationToast-motionSlideUpFade";
  }
}

export function NotificationToast({
  message,
  icon,
  placement,
  motion,
  detailRows = [],
  actionLabel,
  actionDisabled = false,
  onAction,
  closeButtonLabel,
  onDismiss
}: NotificationToastProps): JSX.Element {
  const presetIconUrl = iconUrlFor(icon);
  const hasAction = actionLabel !== undefined && onAction !== undefined;
  const isDetailCard = detailRows.length > 0;
  const isAnchored = placement?.kind === "anchorRect";

  return (
    <li
      className={classNames(
        "notificationToast",
        isDetailCard && "notificationToast-detailCard",
        isAnchored && "notificationToast-placementAnchor",
        motionClassName(motion)
      )}
      style={notificationToastPlacementStyle(placement, viewportSize(), {
        detailCard: isDetailCard
      })}
    >
      {presetIconUrl ? (
        <img
          className="notificationToastIcon"
          src={presetIconUrl}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div className="notificationToastBody">
        <span className="notificationToastMessage">
          <span className="notificationToastMessageInner">{message}</span>
        </span>
        {detailRows.length > 0 ? (
          <dl className="notificationToastDetailRows">
            {detailRows.map((row) => (
              <div
                key={`${row.label}\u0000${row.value}`}
                className="notificationToastDetailRow"
              >
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {hasAction ? (
          <button
            type="button"
            className="notificationToastAction"
            aria-disabled={actionDisabled ? "true" : undefined}
            onClick={() => {
              if (!actionDisabled) {
                onAction();
              }
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
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
