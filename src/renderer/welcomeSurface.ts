import type { OpenDocumentsState } from "./openDocuments";

export interface WelcomeSurfaceInput {
  readonly openDocumentsState: OpenDocumentsState;
  readonly isSettingsTabOpen: boolean;
  // #377: the debug-only Debug Log special tab also counts as an open tab, so
  // opening it from the bug icon on an otherwise empty workbench does not
  // leave the Welcome surface covering it. Optional so existing callers that
  // never open it need no change.
  readonly isDebugLogTabOpen?: boolean;
}

/**
 * #262: the Welcome surface is the main surface shown exactly when there are
 * zero open tabs of any kind — no open documents (Markdown / Untitled /
 * Glossary) and no special tab (Application Settings, or the debug-only Debug
 * Log tab). It is derived purely from the open-tab count; whether a project
 * is open is deliberately not a factor, so `project = open, open tabs = 0`
 * still shows Welcome.
 */
export function shouldShowWelcomeSurface(input: WelcomeSurfaceInput): boolean {
  return (
    input.openDocumentsState.documents.length === 0 &&
    !input.isSettingsTabOpen &&
    !input.isDebugLogTabOpen
  );
}

export interface FullScreenWelcomeSurfaceInput extends WelcomeSurfaceInput {
  readonly projectIsOpen: boolean;
}

/**
 * Blocker (#311 dogfood): the *full-screen* Welcome surface — the one that
 * replaces the entire workbench, File Explorer / sidebar included — is shown
 * only when the zero-tab Welcome state coincides with no project being open.
 *
 * With a project open, zero tabs still shows Welcome (see
 * {@link shouldShowWelcomeSurface}), but scoped to the editor area so the
 * sidebar stays mounted and under the sole control of the side navigation.
 * Closing the last document tab must never close, collapse, or break File
 * Explorer; active-editor presence is not a condition for rendering it.
 */
export function shouldShowFullScreenWelcomeSurface(
  input: FullScreenWelcomeSurfaceInput
): boolean {
  return (
    shouldShowWelcomeSurface({
      openDocumentsState: input.openDocumentsState,
      isSettingsTabOpen: input.isSettingsTabOpen,
      isDebugLogTabOpen: input.isDebugLogTabOpen
    }) && !input.projectIsOpen
  );
}
