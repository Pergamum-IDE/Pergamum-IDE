/**
 * #272: pure builder that turns the renderer's live working-environment
 * state into the `RendererSessionSnapshot` sent to the main process for
 * durable persistence.
 *
 * No disk, no IPC, no debounce, no serialization side effects — just a
 * deterministic mapping. `App.tsx` builds `SessionSnapshotInputs` from
 * state it already has; the persistence coordinator overlays captured
 * Editor View States (#273) and hands the result to the transport.
 *
 * The document body is never part of any of this — Editor View State
 * carries only a SHA-256 digest (see #273).
 */

import {
  editorIdEquals,
  serializeEditorId,
  type EditorId
} from "../../shared/editorId";
import type {
  RendererSessionSnapshot,
  SessionEditor,
  SessionEditorIdentity
} from "../../shared/session";
import { sessionEditorIdentity } from "../../shared/session";
import type { EditorViewState } from "../editorViewState";
import type { CurrentEditor } from "../currentEditor";
import {
  activeOpenDocument,
  type OpenDocumentsState
} from "../openDocuments";
import type { PergamumProject } from "../../shared/api";

/**
 * One open editor, reduced to what the Session needs, plus the key its
 * captured Editor View State is cached under (null for kinds that have no
 * CodeMirror view — Glossary).
 */
export interface SessionEditorInput {
  /** `viewState` here is always `null` — the coordinator overlays the
   *  real captured value by `viewStateKey` at flush time. */
  readonly editor: SessionEditor;
  readonly viewStateKey: string | null;
}

export interface SessionSnapshotInputs {
  readonly sessionId: string;
  readonly projectContext: {
    readonly projectFilePath: string;
    readonly rootPath: string;
  } | null;
  readonly editors: readonly SessionEditorInput[];
  readonly activeEditor: SessionEditorIdentity | null;
}

function sessionEditorFromOpenEditor(
  editorId: EditorId,
  editor: CurrentEditor,
  order: number
): SessionEditorInput | null {
  if (editor.kind === "glossaryEntry") {
    return {
      editor: {
        kind: "glossaryEntry",
        order,
        entryId: editor.draft.entry.id,
        viewState: null
      },
      viewStateKey: null
    };
  }

  const viewStateKey = serializeEditorId(editorId);

  switch (editor.document.kind) {
    case "project":
      return {
        editor: {
          kind: "projectMarkdown",
          order,
          relativePath: editor.document.relativePath,
          viewState: null
        },
        viewStateKey
      };
    case "file":
      return {
        editor: {
          kind: "standaloneMarkdown",
          order,
          filePath: editor.document.path,
          viewState: null
        },
        viewStateKey
      };
    case "untitled": {
      // Phase 6-4-3: the Session references the document model's stable
      // UUIDv7, never the session-local `EditorId.sessionId` counter.
      return {
        editor: {
          kind: "untitled",
          order,
          untitledId: editor.document.untitledId,
          viewState: null
        },
        viewStateKey
      };
    }
  }
}

/**
 * Build the (view-state-free) snapshot inputs from renderer state. Cheap
 * enough to call on every render — no serialization, no hashing.
 */
export function buildSessionSnapshotInputs(
  sessionId: string,
  project: PergamumProject | null,
  openDocumentsState: OpenDocumentsState
): SessionSnapshotInputs {
  const active = activeOpenDocument(openDocumentsState);
  const editors: SessionEditorInput[] = [];
  let activeEditor: SessionEditorIdentity | null = null;

  openDocumentsState.documents.forEach((openDocument) => {
    const editorInput = sessionEditorFromOpenEditor(
      openDocument.id,
      openDocument.editor,
      editors.length
    );

    if (!editorInput) {
      return;
    }

    editors.push(editorInput);

    if (active && editorIdEquals(openDocument.id, active.id)) {
      activeEditor = sessionEditorIdentity(editorInput.editor);
    }
  });

  return {
    sessionId,
    projectContext: project
      ? {
          projectFilePath: project.activeProjectFilePath,
          rootPath: project.rootPath
        }
      : null,
    editors,
    activeEditor
  };
}

/**
 * Overlay captured Editor View States onto the snapshot inputs, producing
 * the payload the main process persists.
 */
export function buildRendererSessionSnapshot(
  inputs: SessionSnapshotInputs,
  viewStateByKey: ReadonlyMap<string, EditorViewState | null>
): RendererSessionSnapshot {
  const editors: SessionEditor[] = inputs.editors.map(
    ({ editor, viewStateKey }) => {
      if (editor.kind === "glossaryEntry" || viewStateKey === null) {
        return editor;
      }

      const viewState = viewStateByKey.get(viewStateKey) ?? null;

      return viewState === null ? editor : { ...editor, viewState };
    }
  );

  return {
    sessionId: inputs.sessionId,
    projectContext: inputs.projectContext,
    editors,
    activeEditor: inputs.activeEditor
  };
}

/** Cache keys that are still referenced by the current inputs. */
export function referencedViewStateKeys(
  inputs: SessionSnapshotInputs
): Set<string> {
  const keys = new Set<string>();

  for (const { viewStateKey } of inputs.editors) {
    if (viewStateKey !== null) {
      keys.add(viewStateKey);
    }
  }

  return keys;
}
