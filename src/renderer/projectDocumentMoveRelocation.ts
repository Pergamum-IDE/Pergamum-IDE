import type { PergamumProject } from "../shared/api";
import type { ProjectDocumentPathRelocation } from "../shared/projectMove";
import {
  createProjectDocumentEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../shared/editorId";
import { displayName } from "./currentDocument";
import { markdownDocumentForEditor } from "./currentEditor";
import {
  findOpenDocument,
  replaceOpenDocument,
  type OpenDocumentsState
} from "./openDocuments";

/**
 * Whether two `PergamumProject` values are the SAME open instance. One project
 * root can hold several `.pergamum` project files, so identity is
 * `rootPath` AND `activeProjectFilePath` — never `rootPath` alone.
 */
export function isSameProjectInstance(
  left: PergamumProject,
  right: PergamumProject
): boolean {
  return (
    left.rootPath === right.rootPath &&
    left.activeProjectFilePath === right.activeProjectFilePath
  );
}

/** #320 renderer Recovery bookkeeping re-key, old → new `document_key`. */
export interface RecoveryDocumentKeyRelocation {
  readonly oldKey: string;
  readonly newKey: string;
}

export interface ProjectDocumentMoveRelocationPlan {
  /** The open-documents state with every open, moved project document
   *  re-keyed to its new path. Reference-equal to the input when nothing
   *  open moved. */
  readonly openDocumentsState: OpenDocumentsState;
  /** `true` when `openDocumentsState` differs from the input. */
  readonly openDocumentsChanged: boolean;
  /** Editor ids whose navigation state must be invalidated (the old
   *  identities that no longer resolve). */
  readonly invalidatedEditorIds: readonly EditorId[];
  /** #320 renderer Recovery bookkeeping re-keys, old → new document key. */
  readonly recoveryKeyRelocations: readonly RecoveryDocumentKeyRelocation[];
}

/**
 * #338: plan the renderer-side follow-through for a successful File Explorer
 * Move — open editor identity, navigation invalidation, and Recovery
 * bookkeeping re-keys.
 *
 * Returns `null` (apply NOTHING) when the Move must be treated as stale:
 *   - there are no relocations,
 *   - the project was closed while the Move IPC was in flight, or
 *   - the project was switched — including to another `.pergamum` file under
 *     the SAME root — while the Move IPC was in flight.
 *
 * `relocations` must already be the `status === "moved"` entries only, so a
 * validation failure (no entries) and a partial failure (moved entries only)
 * fall out of the caller's `collectMovedProjectDocumentRelocations` step.
 *
 * Pure: it computes a plan, it does not touch React state or the coordinator.
 */
export function planProjectDocumentMoveRelocation(input: {
  readonly projectSnapshot: PergamumProject;
  readonly currentProject: PergamumProject | null;
  readonly relocations: readonly ProjectDocumentPathRelocation[];
  readonly openDocumentsState: OpenDocumentsState;
  readonly context: ActiveProjectContext;
  readonly recoveryKeyForRelativePath: (relativePath: string) => string | null;
}): ProjectDocumentMoveRelocationPlan | null {
  const {
    projectSnapshot,
    currentProject,
    relocations,
    context,
    recoveryKeyForRelativePath
  } = input;

  if (
    relocations.length === 0 ||
    !currentProject ||
    !isSameProjectInstance(currentProject, projectSnapshot)
  ) {
    return null;
  }

  let openDocumentsState = input.openDocumentsState;
  let openDocumentsChanged = false;
  const invalidatedEditorIds: EditorId[] = [];
  const recoveryKeyRelocations: RecoveryDocumentKeyRelocation[] = [];

  for (const { oldRelativePath, newRelativePath } of relocations) {
    const oldEditorId = createProjectDocumentEditorId(oldRelativePath, context);
    const openDocument = findOpenDocument(openDocumentsState, oldEditorId);
    const currentDocument = openDocument
      ? markdownDocumentForEditor(openDocument.editor)
      : null;

    if (currentDocument?.kind === "project") {
      const replacement = replaceOpenDocument(
        openDocumentsState,
        oldEditorId,
        {
          ...currentDocument,
          relativePath: newRelativePath,
          name: displayName(newRelativePath)
        },
        context
      );

      if (!replacement.didCollide) {
        openDocumentsState = replacement.state;
        openDocumentsChanged = true;
      }

      invalidatedEditorIds.push(oldEditorId);
    }

    const oldKey = recoveryKeyForRelativePath(oldRelativePath);
    const newKey = recoveryKeyForRelativePath(newRelativePath);
    if (oldKey && newKey && oldKey !== newKey) {
      recoveryKeyRelocations.push({ oldKey, newKey });
    }
  }

  return {
    openDocumentsState,
    openDocumentsChanged,
    invalidatedEditorIds,
    recoveryKeyRelocations
  };
}
