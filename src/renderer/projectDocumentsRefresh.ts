/**
 * #501 slice 8 blocker fix: `project.documents` (the renderer's cache that
 * Quick Open, Command Palette prefix-less file search, and Project-wide
 * Search all read from — see `projectFileQuickOpen.ts` / `projectTextSearch.ts`)
 * is populated once at project open and otherwise only patched by specific
 * file operations (create / rename / move / delete). It does NOT react to
 * `textFiles.enablePlainTextDocuments` changing at runtime, unlike the File
 * Explorer (which re-lists live via its own effect — see FileExplorer.tsx).
 *
 * This predicate decides whether that setting genuinely changed since the
 * last observed value, so the caller's effect knows when to re-fetch
 * `project.documents` from main (`window.pergamum.projects.listProjectDocuments`)
 * without a project reopen. It deliberately never fires on the initial
 * (`null`) observation — that is app/project mount, not a change.
 */
export function projectDocumentDiscoverySettingChanged(
  previouslyObserved: boolean | null,
  current: boolean
): boolean {
  return previouslyObserved !== null && previouslyObserved !== current;
}
