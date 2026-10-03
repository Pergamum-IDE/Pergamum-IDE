/**
 * Special (non-document) workspace tabs and their Session Restore policy.
 *
 * `SpecialTabId` is the identity of a special tab (at most one of each kind is
 * ever open). `specialTabSessionPolicy` is the single place that says, per
 * tab, whether Session Restore brings it back and whether it needs an open
 * Project. It is typed `Record<SpecialTabId, ...>`, so adding a new special
 * tab fails to compile until its policy is declared.
 *
 * Only the tab's identity, order and active-ness are ever persisted — never
 * its scroll position, focus, form input or any other internal view state.
 */

export const specialTabIds = [
  "settings",
  "keyboardShortcuts",
  "projectSettings",
  "glossaryTagManager",
  "glossaryEntryManager",
  "debugLog",
  "resumeHub"
] as const;

export type SpecialTabId = (typeof specialTabIds)[number];

export interface SpecialTabSessionPolicy {
  /** Whether Session Restore reopens this tab on the next start. */
  readonly restoreInSession: boolean;
  /** Whether the tab only exists inside an open Project (closed with it). */
  readonly requiresProject: boolean;
}

export const specialTabSessionPolicy: Readonly<
  Record<SpecialTabId, SpecialTabSessionPolicy>
> = {
  settings: { restoreInSession: true, requiresProject: false },
  keyboardShortcuts: { restoreInSession: true, requiresProject: false },
  projectSettings: { restoreInSession: true, requiresProject: true },
  glossaryTagManager: { restoreInSession: true, requiresProject: true },
  glossaryEntryManager: { restoreInSession: true, requiresProject: true },
  // Debug-only diagnostic surface: never restored.
  debugLog: { restoreInSession: false, requiresProject: false },
  resumeHub: { restoreInSession: true, requiresProject: true }
};

export function isSpecialTabId(value: unknown): value is SpecialTabId {
  return (
    typeof value === "string" &&
    (specialTabIds as readonly string[]).includes(value)
  );
}

export function isSessionRestorableSpecialTab(id: SpecialTabId): boolean {
  return specialTabSessionPolicy[id].restoreInSession;
}

export function specialTabRequiresProject(id: SpecialTabId): boolean {
  return specialTabSessionPolicy[id].requiresProject;
}
