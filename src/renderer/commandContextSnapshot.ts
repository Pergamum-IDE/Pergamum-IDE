import type { CommandContext } from "../shared/commandEnablement";

export interface CommandContextSnapshotInput {
  readonly projectIsOpen: boolean;
  readonly projectAccessReadWrite: boolean;
  readonly projectAccessReadOnly: boolean;
  readonly editorHasDocument: boolean;
  readonly editorIsDirty: boolean;
  readonly editorKindMarkdown: boolean;
  readonly editorDocumentProjectOwned: boolean;
  /** #318: active editor is a Markdown editor backed by a project file. */
  readonly editorDocumentProjectFile: boolean;
  readonly activeEditorSaveBlockedByReadOnlyProjectRootForUi: boolean;
  readonly occurrenceTrackingActive: boolean;
  readonly recoveryOwner: boolean;
  readonly recoveryHasRecoverableCandidates: boolean;
}

/**
 * Builds a copied, value-only command context snapshot. Takes primitive
 * booleans (rather than CurrentEditor/PergamumProject/etc.) so it stays pure
 * and testable without constructing full app state, and so the result can
 * never hold a reference to mutable editor/project/glossary state (#128).
 */
export function buildCommandContextSnapshot(
  input: CommandContextSnapshotInput
): CommandContext {
  return Object.freeze({
    "project.isOpen": input.projectIsOpen,
    "project.access.readWrite": input.projectAccessReadWrite,
    "project.access.readOnly": input.projectAccessReadOnly,
    "editor.hasDocument": input.editorHasDocument,
    "editor.isDirty": input.editorIsDirty,
    "editor.kind.markdown": input.editorKindMarkdown,
    "editor.document.projectOwned": input.editorDocumentProjectOwned,
    "editor.document.projectFile": input.editorDocumentProjectFile,
    "activeEditor.saveBlockedByReadOnlyProjectRootForUi":
      input.activeEditorSaveBlockedByReadOnlyProjectRootForUi,
    "glossary.occurrences.tracking.active": input.occurrenceTrackingActive,
    "recovery.owner": input.recoveryOwner,
    "recovery.hasRecoverableCandidates":
      input.recoveryHasRecoverableCandidates
  });
}
