import type { AppPlatform } from "../../shared/platform";

// ---------------------------------------------------------------------------
// Icon (#182 D-3 / D-4 / D-5 / D-6)
// ---------------------------------------------------------------------------

export type AppDialogIconKind = "info" | "warning" | "error" | "question";

/**
 * Nullable and explicit (D-4): `null` means the dialog intentionally has no
 * icon, distinct from "forgot to pass one". When present, `tooltip` is
 * required (D-5) and is also used as the icon's accessibility label.
 */
export type AppDialogIcon =
  | {
      kind: AppDialogIconKind;
      tooltip: string;
    }
  | null;

// ---------------------------------------------------------------------------
// Message (#182 D-7)
// ---------------------------------------------------------------------------

export interface AppDialogPathBlock {
  readonly label: string;
  readonly value: string;
}

/**
 * `kind` preserves the discriminated-union shape and stops callers from
 * passing a raw string as `message`. Both variants render text as React text
 * children, not HTML or Markdown.
 */
export type AppDialogMessage =
  | {
      readonly kind: "plainText";
      readonly text: string;
    }
  | {
      readonly kind: "plainTextWithPathBlock";
      readonly beforeText: string;
      readonly pathBlock: AppDialogPathBlock;
      readonly afterText: string;
    };

// ---------------------------------------------------------------------------
// Tone (#182 D-12 / D-13)
// ---------------------------------------------------------------------------

export type AppConfirmDialogTone = "default" | "destructive";

// ---------------------------------------------------------------------------
// Result (#182 D-2)
// ---------------------------------------------------------------------------

export type AppConfirmDialogResult = "confirm" | "cancel";

// ---------------------------------------------------------------------------
// Choice dialog (#192)
// ---------------------------------------------------------------------------

export type AppDialogChoiceId = string;

export type AppDialogChoiceRole =
  | "primary"
  | "neutral"
  | "destructive"
  | "cancel";

export type AppDialogChoiceIconKind = "alertTriangle";

export interface AppDialogChoiceIcon {
  readonly kind: AppDialogChoiceIconKind;
}

export interface AppDialogChoice {
  readonly id: AppDialogChoiceId;
  readonly label: string;
  readonly role: AppDialogChoiceRole;
  readonly icon?: AppDialogChoiceIcon;
}

export type AppChoiceDialogResult =
  | { readonly kind: "chosen"; readonly id: AppDialogChoiceId }
  | { readonly kind: "dismissed" };

export type AppChoiceDialogActionOrderPolicy = "semantic" | "caller";

export interface AppChoiceDialogOptions {
  readonly title: string;
  readonly message: AppDialogMessage;
  readonly icon: AppDialogIcon;
  readonly choices: readonly AppDialogChoice[];
  readonly primaryChoiceId?: AppDialogChoiceId;
  readonly cancelChoiceId?: AppDialogChoiceId;
  readonly initialFocusChoiceId?: AppDialogChoiceId;
  readonly actionOrderPolicy?: AppChoiceDialogActionOrderPolicy;
  readonly dismissOnBackdropClick?: boolean;
  readonly clipboardText?: string | null;
}

// ---------------------------------------------------------------------------
// Errors (#182 D-14)
// ---------------------------------------------------------------------------

export type AppDialogErrorKind =
  | "dialogAlreadyOpen"
  | "invalidChoiceDialogOptions"
  | "invalidDialogResult";

/**
 * A concurrent app dialog request is a programming/control-flow error, not a
 * user decision — it must reject with this typed error rather than resolve
 * as cancel/dismissed (D-14 / #192), so the two cases stay distinguishable at
 * call sites.
 */
export class AppDialogError extends Error {
  readonly kind: AppDialogErrorKind;

  constructor(kind: AppDialogErrorKind, message?: string) {
    super(message ?? `Application dialog error: ${kind}`);
    this.name = "AppDialogError";
    this.kind = kind;
  }
}

// ---------------------------------------------------------------------------
// Platform-specific action order (#182 D-11)
// ---------------------------------------------------------------------------

export type AppDialogActionOrder = "confirmCancel" | "cancelConfirm";

/**
 * DOM/action order follows platform convention: Windows/Linux order the
 * affirmative action before cancel, while macOS-style convention orders
 * cancel before confirm. Visual placement is resolved by CSS and the
 * effective writing direction, so RTL support must not reverse this array in
 * JS. `macos` is resolved the same as `other` today but is kept as its own
 * `AppPlatform` value (not collapsed into `other`) so future macOS-specific
 * handling doesn't require widening this closed set again.
 */
export function getDialogActionOrder(
  platform: AppPlatform
): AppDialogActionOrder {
  if (platform === "windows" || platform === "linux") {
    return "confirmCancel";
  }

  return "cancelConfirm";
}

// ---------------------------------------------------------------------------
// Confirm dialog options (#182 D-10)
// ---------------------------------------------------------------------------

type AppConfirmDialogBaseOptions = {
  title: string;
  message: AppDialogMessage;
  icon: AppDialogIcon;
  clipboardText: string | null;
  cancelLabel?: string | null;
  /**
   * Whether clicking the backdrop resolves `"cancel"` (#184 follow-up).
   * Defaults to `true` when omitted, preserving every existing call site's
   * behavior. Set `false` for a dialog where an accidental backdrop click
   * dismissing it would be confusing even though it is safe — e.g. the
   * dirty-close confirmation, where backdrop click doing nothing is
   * deliberate; `Escape` and the Cancel button remain unaffected.
   */
  dismissOnBackdropClick?: boolean;
};

/**
 * A discriminated union so TypeScript enforces D-10's rule at the type
 * level: `tone: "destructive"` requires a concrete `confirmLabel`, while
 * `tone` omitted or `"default"` leaves both labels optional (defaulted to
 * the localized `common.ok` / `common.cancel`).
 */
export type AppConfirmDialogOptions =
  | (AppConfirmDialogBaseOptions & {
      tone?: "default";
      confirmLabel?: string;
    })
  | (AppConfirmDialogBaseOptions & {
      tone: "destructive";
      confirmLabel: string;
    });

export function confirmDialogTone(
  options: AppConfirmDialogOptions
): AppConfirmDialogTone {
  return options.tone ?? "default";
}

/**
 * Resolves `dismissOnBackdropClick` to its effective boolean, defaulting to
 * `true` (backdrop click cancels) when the caller does not specify it.
 */
export function confirmDialogDismissesOnBackdropClick(
  options: AppConfirmDialogOptions
): boolean {
  return options.dismissOnBackdropClick ?? true;
}

export function choiceDialogDismissesOnBackdropClick(
  options: AppChoiceDialogOptions
): boolean {
  return options.dismissOnBackdropClick === true;
}

function invalidChoiceDialogOptions(message: string): AppDialogError {
  return new AppDialogError("invalidChoiceDialogOptions", message);
}

export function validateChoiceDialogOptions(
  options: AppChoiceDialogOptions
): void {
  if (options.choices.length === 0) {
    throw invalidChoiceDialogOptions("Choice dialog requires at least one choice.");
  }

  const ids = new Set<AppDialogChoiceId>();

  for (const choice of options.choices) {
    if (ids.has(choice.id)) {
      throw invalidChoiceDialogOptions(
        `Choice dialog has a duplicate choice id: ${choice.id}`
      );
    }

    ids.add(choice.id);
  }

  for (const choiceId of [
    options.primaryChoiceId,
    options.cancelChoiceId,
    options.initialFocusChoiceId
  ]) {
    if (choiceId !== undefined && !ids.has(choiceId)) {
      throw invalidChoiceDialogOptions(
        `Choice dialog references an unknown choice id: ${choiceId}`
      );
    }
  }

  if (
    options.primaryChoiceId !== undefined &&
    options.cancelChoiceId !== undefined &&
    options.primaryChoiceId === options.cancelChoiceId
  ) {
    throw invalidChoiceDialogOptions(
      `Choice dialog primaryChoiceId and cancelChoiceId must be distinct: ${options.primaryChoiceId}`
    );
  }
}

export function resolvePrimaryChoiceId(
  options: AppChoiceDialogOptions
): AppDialogChoiceId | null {
  return (
    options.primaryChoiceId ??
    options.choices.find((choice) => choice.role === "primary")?.id ??
    null
  );
}

export function resolveCancelChoiceId(
  options: AppChoiceDialogOptions
): AppDialogChoiceId | null {
  return (
    options.cancelChoiceId ??
    options.choices.find((choice) => choice.role === "cancel")?.id ??
    null
  );
}

/**
 * Safe initial-focus fallback (#192): explicit initial focus, explicit cancel
 * choice, first cancel-role choice, first non-destructive choice, then the
 * first choice. This keeps destructive choices out of default focus unless
 * the caller explicitly asks for one.
 */
export function resolveInitialFocusChoiceId(
  options: AppChoiceDialogOptions
): AppDialogChoiceId {
  return (
    options.initialFocusChoiceId ??
    options.cancelChoiceId ??
    options.choices.find((choice) => choice.role === "cancel")?.id ??
    options.choices.find((choice) => choice.role !== "destructive")?.id ??
    options.choices[0].id
  );
}

export function resolveChoiceDialogActionOrderPolicy(
  options: AppChoiceDialogOptions
): AppChoiceDialogActionOrderPolicy {
  return options.actionOrderPolicy ?? "semantic";
}

export function resolveChoiceDialogActionOrder(
  options: AppChoiceDialogOptions,
  _platform: AppPlatform
): readonly AppDialogChoice[] {
  if (resolveChoiceDialogActionOrderPolicy(options) === "caller") {
    return [...options.choices];
  }

  const primaryChoiceId = resolvePrimaryChoiceId(options);
  const cancelChoiceId = resolveCancelChoiceId(options);
  const primaryChoice = primaryChoiceId
    ? options.choices.find((choice) => choice.id === primaryChoiceId)
    : undefined;
  const cancelChoice = cancelChoiceId
    ? options.choices.find((choice) => choice.id === cancelChoiceId)
    : undefined;
  const middleChoices = options.choices.filter(
    (choice) => choice.id !== primaryChoiceId && choice.id !== cancelChoiceId
  );

  return [
    ...(primaryChoice ? [primaryChoice] : []),
    ...middleChoices,
    ...(cancelChoice ? [cancelChoice] : [])
  ];
}
