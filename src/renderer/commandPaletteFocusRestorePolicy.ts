export type CommandPaletteFocusRestoreActiveSurface =
  | "markdown"
  | "glossary"
  | "special"
  | "empty";

export type CommandPaletteFocusRestoreBlockedReason =
  | "focusRestoreNotPending"
  | "focusClaimingSurfacePendingOrOpen"
  | "zeroTab"
  | "glossaryActive"
  | "specialSurfaceActive"
  | "activeMarkdownEditorMissing";

export interface CommandPaletteFocusRestorePolicyInput {
  readonly focusRestorePending: boolean;
  readonly focusClaimingSurfacePendingOrOpen: boolean;
  readonly hasOpenDocumentTab: boolean;
  readonly activeSurface: CommandPaletteFocusRestoreActiveSurface;
  readonly activeDocumentKey: string | null;
}

export type CommandPaletteFocusRestorePolicyResult =
  | {
      readonly kind: "requestFocus";
      readonly documentKey: string;
    }
  | {
      readonly kind: "blocked";
      readonly reason: CommandPaletteFocusRestoreBlockedReason;
    };

export function resolveCommandPaletteFocusRestorePolicy(
  input: CommandPaletteFocusRestorePolicyInput
): CommandPaletteFocusRestorePolicyResult {
  if (!input.focusRestorePending) {
    return { kind: "blocked", reason: "focusRestoreNotPending" };
  }

  if (input.focusClaimingSurfacePendingOrOpen) {
    return {
      kind: "blocked",
      reason: "focusClaimingSurfacePendingOrOpen"
    };
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

  return {
    kind: "requestFocus",
    documentKey: input.activeDocumentKey
  };
}
