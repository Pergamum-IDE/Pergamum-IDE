/**
 * #457 — a module-level "current active Markdown editor selection" slot,
 * mirroring the publish/subscribe pattern in `activeFindKeymapExtension.ts`
 * (the CodeMirror `EditorState` that backs a document is cached in an
 * App-owned Map that outlives an EditorSurface/MarkdownEditor remount, so a
 * mount-local ref/closure would go stale - see that file's header comment
 * for the full rationale, which applies identically here).
 *
 * Unlike the other slots in this folder (which are "push" APIs - a keymap
 * calls `config.requestOpen(...)` on keydown), this one is a "pull" / query
 * API: it lets code anywhere in the renderer synchronously ask "what is the
 * active Markdown editor's current primary selection text, right now?"
 * without any React prop drilling. This is the CodeMirror-selection fallback
 * (priority 4) for the #457 Ctrl+Shift+F / Ctrl+Shift+H selection resolver -
 * used when no focused form control and no `window.getSelection()` inside
 * the Pergamum app root produced a usable selection.
 *
 * Published by the SAME `MarkdownEditor` mount that publishes
 * `activeFindConfig` (EditorSurface's main document editor) - reusing that
 * prop's presence as the existing "is this the main document editor, not
 * the Glossary description field's editor" gate, rather than threading a
 * new prop through for the same purpose.
 */

export interface ActiveEditorSelectionAccess {
  /** The live primary-selection text of the active Markdown editor, or `""`
   *  when the selection is a caret (empty) or no editor is mounted. Raw
   *  document text - never trimmed / normalized. */
  readonly getSelectionText: () => string;
}

let currentAccess: ActiveEditorSelectionAccess | null = null;

/** Make `access` THE current active-editor selection source. */
export function publishCurrentActiveEditorSelectionAccess(
  access: ActiveEditorSelectionAccess
): void {
  currentAccess = access;
}

/**
 * Clear the current source, but only if it is still `access` - so a later
 * mount's publish is never wiped by an earlier mount's (async) teardown.
 */
export function unpublishCurrentActiveEditorSelectionAccess(
  access: ActiveEditorSelectionAccess
): void {
  if (currentAccess === access) {
    currentAccess = null;
  }
}

/** The active Markdown editor's current primary selection text, or `""`
 *  when there is none (nothing mounted, or the selection is a caret). */
export function getCurrentActiveEditorSelectionText(): string {
  return currentAccess?.getSelectionText() ?? "";
}
