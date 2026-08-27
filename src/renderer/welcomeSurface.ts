import type { OpenDocumentsState } from "./openDocuments";

export interface WelcomeSurfaceInput {
  readonly openDocumentsState: OpenDocumentsState;
  readonly isSettingsTabOpen: boolean;
}

/**
 * #262: the Welcome surface is the main surface shown exactly when there are
 * zero open tabs of any kind — no open documents (Markdown / Untitled /
 * Glossary) and no special tab (Application Settings). It is derived purely
 * from the open-tab count; whether a project is open is deliberately not a
 * factor, so `project = open, open tabs = 0` still shows Welcome.
 */
export function shouldShowWelcomeSurface(input: WelcomeSurfaceInput): boolean {
  return (
    input.openDocumentsState.documents.length === 0 && !input.isSettingsTabOpen
  );
}
