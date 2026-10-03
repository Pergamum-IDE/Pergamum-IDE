import type { GlossaryTag } from "../../shared/glossary";
import type { EditorId } from "../../shared/editorId";
import type { AssistExportTarget } from "../../shared/glossaryExportEntry";
import type { CurrentEditor } from "../currentEditor";
import { createGlossaryDescriptionExportSnapshot } from "./glossaryExportSnapshot";

/**
 * #684 / #695: what Export exports for a RIGHT-CLICKED document tab. Read from
 * that tab itself, never from the active editor, so a tab that is not active
 * is exported as itself and nothing needs to be activated:
 *  - a project document: that one file (its on-disk project-relative path);
 *  - a glossary Description: a detached snapshot of that tab's current draft
 *    (unsaved edits included; nothing is saved or read from the database).
 * Anything else (external file, untitled, ...) has no target.
 */
export interface TabExportTargetDeps {
  readonly projectDocumentRelativePath: (editorId: EditorId) => string | null;
  readonly openEditor: (editorId: EditorId) => CurrentEditor | null;
  /** The project's tags as they are now, to resolve the draft's tag ids. */
  readonly projectTags: readonly GlossaryTag[];
}

export function resolveTabExportTarget(
  tab: { readonly id: EditorId },
  deps: TabExportTargetDeps
): AssistExportTarget | null {
  if (tab.id.kind === "glossaryDescription") {
    const editor = deps.openEditor(tab.id);

    return editor?.kind === "glossaryDescription"
      ? {
          kind: "glossaryDescription",
          snapshot: createGlossaryDescriptionExportSnapshot({
            tabEntryId: editor.entryId,
            draft: editor.draft,
            projectTags: deps.projectTags
          })
        }
      : null;
  }

  const relativePath = deps.projectDocumentRelativePath(tab.id);

  return relativePath === null
    ? null
    : { kind: "project", origin: { kind: "file", filePath: relativePath } };
}
