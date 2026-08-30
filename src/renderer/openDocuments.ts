import {
  currentProjectRelativePath,
  type CurrentDocument
} from "./currentDocument";
import {
  createUntitledEditorId,
  editorIdEquals,
  type ActiveProjectContext,
  type EditorId
} from "../shared/editorId";
import type {
  DirtyWorkingCopy,
  DirtyWorkingCopyScope
} from "../shared/lifecycle";
import {
  createMarkdownCurrentEditor,
  currentEditorTitle,
  editorIdForCurrentEditor,
  isCurrentEditorDirty,
  isCurrentEditorIdentityCompatible,
  markdownDocumentForEditor,
  type CurrentEditor
} from "./currentEditor";

export interface OpenDocument {
  id: EditorId;
  editor: CurrentEditor;
}

/**
 * #262: the "zero-tab" state — `documents: []` with `activeDocumentId: null` —
 * is a legitimate runtime state (Pergamum shows the Welcome surface then), not
 * a transient or a placeholder-pending state. Every state mutation must keep
 * this invariant intact:
 *
 *   documents.length === 0  ⟺  activeDocumentId === null
 *   documents.length  >  0  ⟹  activeDocumentId points at one of `documents`
 *
 * A non-null `activeDocumentId` that does not match any open document, or a
 * null `activeDocumentId` while documents exist, is never valid.
 */
export interface OpenDocumentsState {
  documents: OpenDocument[];
  activeDocumentId: EditorId | null;
  nextUntitledId: number;
}

export interface DocumentTab {
  id: EditorId;
  title: string;
  isDirty: boolean;
  /**
   * True for a Markdown document opened from outside the active project
   * (`CurrentDocument.kind === "file"`) — never for a project document or a
   * glossary entry. Derived from editor/document identity, not from
   * comparing raw paths against the project root (#152 dogfood follow-up).
   */
  isExternalMarkdownFile: boolean;
}

export interface ReplaceOpenDocumentResult {
  state: OpenDocumentsState;
  didCollide: boolean;
}

export function editorIdForCurrentDocument(
  document: CurrentDocument,
  activeProjectContext: ActiveProjectContext | null
): EditorId | null {
  return editorIdForCurrentEditor(
    createMarkdownCurrentEditor(document),
    activeProjectContext
  );
}

function assertEditorIdentityCompatible(
  editor: CurrentEditor,
  editorId: EditorId
): void {
  if (!isCurrentEditorIdentityCompatible(editor, editorId)) {
    throw new Error("CurrentEditor kind does not match its EditorId.");
  }
}

/**
 * #262: the initial state has no open tabs and no active editor. It does not
 * fabricate a placeholder `Untitled.md` document — an Untitled Markdown tab
 * only exists once one is actually created.
 */
export function createInitialOpenDocumentsState(
  nextUntitledId = 1
): OpenDocumentsState {
  return {
    documents: [],
    activeDocumentId: null,
    nextUntitledId
  };
}

export function createOpenDocumentsStateWithDocument(
  document: CurrentDocument,
  activeProjectContext: ActiveProjectContext | null,
  nextUntitledId = 1
): OpenDocumentsState {
  return createOpenDocumentsStateWithEditor(
    createMarkdownCurrentEditor(document),
    activeProjectContext,
    nextUntitledId
  );
}

export function createOpenDocumentsStateWithEditor(
  editor: CurrentEditor,
  activeProjectContext: ActiveProjectContext | null,
  nextUntitledId = 1
): OpenDocumentsState {
  const stableId = editorIdForCurrentEditor(
    editor,
    activeProjectContext
  );

  if (!stableId) {
    // An Untitled editor has no stable identity, so it gets a session-local
    // EditorId — the same allocation `openOrActivateEditor` uses. Only
    // `createInitialOpenDocumentsState` produces the zero-tab state; a real
    // editor passed here always becomes a one-tab state.
    const activeDocumentId = createUntitledEditorId(nextUntitledId);

    return {
      documents: [
        {
          id: activeDocumentId,
          editor
        }
      ],
      activeDocumentId,
      nextUntitledId: nextUntitledId + 1
    };
  }

  assertEditorIdentityCompatible(editor, stableId);

  return {
    documents: [
      {
        id: stableId,
        editor
      }
    ],
    activeDocumentId: stableId,
    nextUntitledId
  };
}

export function activeOpenDocument(
  state: OpenDocumentsState
): OpenDocument | null {
  const { activeDocumentId } = state;

  if (activeDocumentId === null) {
    return null;
  }

  return (
    state.documents.find((document) =>
      editorIdEquals(document.id, activeDocumentId)
    ) ?? null
  );
}

export function findOpenDocument(
  state: OpenDocumentsState,
  editorId: EditorId
): OpenDocument | null {
  return (
    state.documents.find((document) =>
      editorIdEquals(document.id, editorId)
    ) ?? null
  );
}

export function activeCurrentDocument(
  state: OpenDocumentsState
): CurrentDocument {
  const active = activeOpenDocument(state);
  const document = active && markdownDocumentForEditor(active.editor);

  if (!document) {
    throw new Error("Active editor is not a Markdown document.");
  }

  return document;
}

export function activeCurrentEditor(
  state: OpenDocumentsState
): CurrentEditor | null {
  return activeOpenDocument(state)?.editor ?? null;
}

/**
 * #318: the project-relative path of the active editor's backing project
 * file, or `null` when there is no active editor, it is not a Markdown
 * editor, or its document is untitled / an external (non-project) file.
 *
 * This is the target a *global* Rename (Command Palette / menu / shortcut)
 * acts on — never the File Explorer's own selection.
 */
export function activeProjectDocumentRelativePath(
  state: OpenDocumentsState
): string | null {
  const editor = activeCurrentEditor(state);
  const document = editor ? markdownDocumentForEditor(editor) : null;

  return document ? currentProjectRelativePath(document) : null;
}

export function hasDirtyOpenDocuments(state: OpenDocumentsState): boolean {
  return hasDirtyWorkingCopies(state);
}

function dirtyWorkingCopyScopeForEditor(
  editor: CurrentEditor
): DirtyWorkingCopyScope {
  if (editor.kind === "glossaryEntry") {
    return "glossary";
  }

  switch (editor.document.kind) {
    case "project":
      return "projectDocument";
    case "file":
      return "standaloneMarkdown";
    case "untitled":
      return "untitledMarkdown";
  }
}

export function getDirtyWorkingCopies(
  state: OpenDocumentsState
): DirtyWorkingCopy[] {
  return state.documents.flatMap((openDocument) =>
    isCurrentEditorDirty(openDocument.editor)
      ? [
          {
            editorId: openDocument.id,
            kind: openDocument.editor.kind,
            scope: dirtyWorkingCopyScopeForEditor(openDocument.editor),
            title: currentEditorTitle(openDocument.editor)
          }
        ]
      : []
  );
}

export function hasDirtyWorkingCopies(
  state: OpenDocumentsState
): boolean {
  return getDirtyWorkingCopies(state).length > 0;
}

function isExternalMarkdownFileEditor(editor: CurrentEditor): boolean {
  return markdownDocumentForEditor(editor)?.kind === "file";
}

export function documentTabs(state: OpenDocumentsState): DocumentTab[] {
  return state.documents.map((openDocument) => ({
    id: openDocument.id,
    title: currentEditorTitle(openDocument.editor),
    isDirty: isCurrentEditorDirty(openDocument.editor),
    isExternalMarkdownFile: isExternalMarkdownFileEditor(openDocument.editor)
  }));
}

export function hasOpenDocument(
  state: OpenDocumentsState,
  editorId: EditorId
): boolean {
  return state.documents.some((document) =>
    editorIdEquals(document.id, editorId)
  );
}

export function activateOpenDocument(
  state: OpenDocumentsState,
  editorId: EditorId
): OpenDocumentsState {
  if (!hasOpenDocument(state, editorId)) {
    return state;
  }

  return {
    ...state,
    activeDocumentId: editorId
  };
}

export function openOrActivateDocument(
  state: OpenDocumentsState,
  document: CurrentDocument,
  activeProjectContext: ActiveProjectContext | null
): OpenDocumentsState {
  return openOrActivateEditor(
    state,
    createMarkdownCurrentEditor(document),
    activeProjectContext
  );
}

export function openOrActivateEditor(
  state: OpenDocumentsState,
  editor: CurrentEditor,
  activeProjectContext: ActiveProjectContext | null
): OpenDocumentsState {
  const stableId = editorIdForCurrentEditor(
    editor,
    activeProjectContext
  );

  if (!stableId) {
    const activeDocumentId = createUntitledEditorId(state.nextUntitledId);

    return {
      documents: [
        ...state.documents,
        {
          id: activeDocumentId,
          editor
        }
      ],
      activeDocumentId,
      nextUntitledId: state.nextUntitledId + 1
    };
  }

  assertEditorIdentityCompatible(editor, stableId);

  if (hasOpenDocument(state, stableId)) {
    return activateOpenDocument(state, stableId);
  }

  return {
    ...state,
    documents: [
      ...state.documents,
      {
        id: stableId,
        editor
      }
    ],
    activeDocumentId: stableId
  };
}

/**
 * Resolves which editor a close request targets (#184). An explicit
 * `editorId` must refer to a currently open document — a stale/unrelated ID
 * resolves to `null` rather than silently falling back to the active editor,
 * so a close request never closes an editor other than the one asked for.
 * Omitting `editorId` targets the active editor — or resolves to `null` when
 * there is no active editor (#262 zero-tab state), so there is nothing to
 * close.
 */
export function resolveCloseTargetEditorId(
  state: OpenDocumentsState,
  editorId?: EditorId
): EditorId | null {
  if (!editorId) {
    return state.activeDocumentId;
  }

  return hasOpenDocument(state, editorId) ? editorId : null;
}

export function isOpenDocumentDirty(
  state: OpenDocumentsState,
  editorId: EditorId
): boolean {
  const document = findOpenDocument(state, editorId);

  return document ? isCurrentEditorDirty(document.editor) : false;
}

export function closeOpenEditor(
  state: OpenDocumentsState,
  editorId: EditorId
): OpenDocumentsState {
  const index = state.documents.findIndex((document) =>
    editorIdEquals(document.id, editorId)
  );

  if (index === -1) {
    return state;
  }

  const remainingDocuments = state.documents.filter(
    (_document, documentIndex) => documentIndex !== index
  );

  if (remainingDocuments.length === 0) {
    // #262: closing the last tab returns to the zero-tab state (Welcome),
    // preserving `nextUntitledId` — it never re-seeds a placeholder document.
    return {
      ...state,
      documents: [],
      activeDocumentId: null
    };
  }

  if (
    state.activeDocumentId === null ||
    !editorIdEquals(state.activeDocumentId, editorId)
  ) {
    return {
      ...state,
      documents: remainingDocuments
    };
  }

  const fallbackIndex = Math.min(index, remainingDocuments.length - 1);

  return {
    ...state,
    documents: remainingDocuments,
    activeDocumentId: remainingDocuments[fallbackIndex].id
  };
}

function isProjectScopedOpenEditor(openDocument: OpenDocument): boolean {
  const { editor } = openDocument;

  return (
    editor.kind === "glossaryEntry" ||
    (editor.kind === "markdown" && editor.document.kind === "project")
  );
}

export function removeProjectScopedOpenEditors(
  state: OpenDocumentsState
): OpenDocumentsState {
  return state.documents.reduce(
    (nextState, openDocument) =>
      isProjectScopedOpenEditor(openDocument)
        ? closeOpenEditor(nextState, openDocument.id)
        : nextState,
    state
  );
}

export function updateOpenDocument(
  state: OpenDocumentsState,
  editorId: EditorId,
  updateDocument: (document: CurrentDocument) => CurrentDocument
): OpenDocumentsState {
  return updateOpenEditor(state, editorId, (editor) => {
    const document = markdownDocumentForEditor(editor);

    return document
      ? createMarkdownCurrentEditor(updateDocument(document))
      : editor;
  });
}

export function updateOpenEditor(
  state: OpenDocumentsState,
  editorId: EditorId,
  updateEditor: (editor: CurrentEditor) => CurrentEditor
): OpenDocumentsState {
  return {
    ...state,
    documents: state.documents.map((openDocument) =>
      editorIdEquals(openDocument.id, editorId)
        ? {
            ...openDocument,
            editor: updateEditor(openDocument.editor)
          }
        : openDocument
    )
  };
}

export function updateActiveOpenDocument(
  state: OpenDocumentsState,
  updateDocument: (document: CurrentDocument) => CurrentDocument
): OpenDocumentsState {
  if (state.activeDocumentId === null) {
    return state;
  }

  return updateOpenDocument(state, state.activeDocumentId, updateDocument);
}

export function updateActiveOpenEditor(
  state: OpenDocumentsState,
  updateEditor: (editor: CurrentEditor) => CurrentEditor
): OpenDocumentsState {
  if (state.activeDocumentId === null) {
    return state;
  }

  return updateOpenEditor(state, state.activeDocumentId, updateEditor);
}

export function replaceOpenDocument(
  state: OpenDocumentsState,
  editorId: EditorId,
  document: CurrentDocument,
  activeProjectContext: ActiveProjectContext | null
): ReplaceOpenDocumentResult {
  return replaceOpenEditor(
    state,
    editorId,
    createMarkdownCurrentEditor(document),
    activeProjectContext
  );
}

export function replaceOpenEditor(
  state: OpenDocumentsState,
  editorId: EditorId,
  editor: CurrentEditor,
  activeProjectContext: ActiveProjectContext | null
): ReplaceOpenDocumentResult {
  const existingIndex = state.documents.findIndex(
    (openDocument) => editorIdEquals(openDocument.id, editorId)
  );

  if (existingIndex === -1) {
    return {
      state,
      didCollide: false
    };
  }

  const nextId =
    editorIdForCurrentEditor(editor, activeProjectContext) ?? editorId;
  assertEditorIdentityCompatible(editor, nextId);

  const didCollide =
    !editorIdEquals(nextId, editorId) && hasOpenDocument(state, nextId);

  if (didCollide) {
    return {
      state,
      didCollide
    };
  }

  const documents = state.documents.map((openDocument) =>
    editorIdEquals(openDocument.id, editorId)
      ? {
          id: nextId,
          editor
        }
      : openDocument
  );

  return {
    state: {
      ...state,
      documents,
      activeDocumentId:
        state.activeDocumentId !== null &&
        editorIdEquals(state.activeDocumentId, editorId)
          ? nextId
          : state.activeDocumentId
    },
    didCollide
  };
}
