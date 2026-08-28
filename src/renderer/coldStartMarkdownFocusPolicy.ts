export type ColdStartMarkdownFocusActiveSurface =
  | "markdown"
  | "glossary"
  | "special"
  | "empty";

export type ColdStartMarkdownFocusBlockedReason =
  | "coldStartRestorePending"
  | "coldStartFocusNotArmed"
  | "launchRoutingPending"
  | "deferredRestoreErrorDialogOutstanding"
  | "modalSurfacePendingOrOpen"
  | "zeroTab"
  | "glossaryActive"
  | "specialSurfaceActive"
  | "activeMarkdownEditorMissing"
  | "viewStatePending"
  | "documentInactive"
  | "alreadyRequested";

export interface ColdStartMarkdownFocusPolicyInput {
  readonly coldStartRestoreSettled: boolean;
  /**
   * True only when cold-start Session Restore applied a previous workspace.
   * This keeps the policy out of ordinary startup project-open semantics.
   */
  readonly coldStartMarkdownFocusArmed: boolean;
  readonly launchRoutingSettled: boolean;
  readonly deferredRestoreErrorDialogOutstanding: boolean;
  readonly modalSurfacePendingOrOpen: boolean;
  readonly hasOpenDocumentTab: boolean;
  readonly activeSurface: ColdStartMarkdownFocusActiveSurface;
  readonly activeDocumentKey: string | null;
  readonly pendingRestoreViewStateKey: string | null;
  readonly documentHasFocus: boolean;
  readonly focusAlreadyRequested: boolean;
}

export type ColdStartMarkdownFocusPolicyResult =
  | {
      readonly kind: "requestFocus";
      readonly documentKey: string;
    }
  | {
      readonly kind: "blocked";
      readonly reason: ColdStartMarkdownFocusBlockedReason;
    };

export function resolveColdStartMarkdownFocusPolicy(
  input: ColdStartMarkdownFocusPolicyInput
): ColdStartMarkdownFocusPolicyResult {
  if (!input.coldStartRestoreSettled) {
    return { kind: "blocked", reason: "coldStartRestorePending" };
  }

  if (!input.coldStartMarkdownFocusArmed) {
    return { kind: "blocked", reason: "coldStartFocusNotArmed" };
  }

  if (!input.launchRoutingSettled) {
    return { kind: "blocked", reason: "launchRoutingPending" };
  }

  if (input.deferredRestoreErrorDialogOutstanding) {
    return {
      kind: "blocked",
      reason: "deferredRestoreErrorDialogOutstanding"
    };
  }

  if (input.modalSurfacePendingOrOpen) {
    return { kind: "blocked", reason: "modalSurfacePendingOrOpen" };
  }

  if (!input.hasOpenDocumentTab) {
    return { kind: "blocked", reason: "zeroTab" };
  }

  if (input.activeSurface === "glossary") {
    return { kind: "blocked", reason: "glossaryActive" };
  }

  if (input.activeSurface === "special") {
    return { kind: "blocked", reason: "specialSurfaceActive" };
  }

  if (input.activeSurface !== "markdown" || input.activeDocumentKey === null) {
    return { kind: "blocked", reason: "activeMarkdownEditorMissing" };
  }

  if (input.pendingRestoreViewStateKey !== null) {
    return { kind: "blocked", reason: "viewStatePending" };
  }

  if (!input.documentHasFocus) {
    return { kind: "blocked", reason: "documentInactive" };
  }

  if (input.focusAlreadyRequested) {
    return { kind: "blocked", reason: "alreadyRequested" };
  }

  return {
    kind: "requestFocus",
    documentKey: input.activeDocumentKey
  };
}
