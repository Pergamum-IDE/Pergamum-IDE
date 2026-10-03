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
import { glossaryEntryDraftIsNew } from "../glossaryEntryDraft";
import {
  activeOpenDocument,
  findOpenDocument,
  type OpenDocument,
  type OpenDocumentsState
} from "../openDocuments";
import type { PergamumProject } from "../../shared/api";
import {
  isSessionRestorableSpecialTab,
  specialTabRequiresProject
} from "../../shared/specialTab";
import type { WorkspaceTabId } from "../workspaceTabs";

/**
 * One open editor, reduced to what the Session needs, plus the key its
 * captured Editor View State is cached under.
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
  /** #541 follow-up: see `SessionRecord.previewVisible`. */
  readonly previewVisible: boolean;
}

function sessionEditorFromOpenEditor(
  editorId: EditorId,
  editor: CurrentEditor,
  order: number
): SessionEditorInput | null {
  const viewStateKey = serializeEditorId(editorId);

  // #573 Slice 8: a glossary Description tab is recorded by its entry id
  // only (the entry is re-read on restore). #574 Slice 1: it carries #273
  // View State under the same serialized-EditorId key as a document. A
  // never-saved new-entry tab has no entry to reopen — its content is
  // Recovery's job — so it is not recorded at all.
  if (editor.kind === "glossaryDescription") {
    return glossaryEntryDraftIsNew(editor.draft)
      ? null
      : {
          editor: {
            kind: "glossaryDescription",
            order,
            entryId: editor.entryId,
            viewState: null
          },
          viewStateKey
        };
  }

  // A project image viewer tab is recorded by its project-relative path only
  // (no content, no #273 View State — there is no text selection / scroll to
  // restore). Restore re-checks the file and reopens it as an image tab.
  if (editor.kind === "projectImage") {
    return {
      editor: {
        kind: "projectImage",
        order,
        relativePath: editor.relativePath,
        viewState: null
      },
      viewStateKey: null
    };
  }

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
 * The workspace tab bar as the user sees it (documents, images and special
 * tabs interleaved), so the Session can record the mixed order and which
 * special tab — if any — was active. Omitted ⟹ documents only (legacy shape).
 */
export interface SessionWorkspaceTabs {
  /** Every open tab, in visible order. */
  readonly tabIds: readonly WorkspaceTabId[];
  /** The active tab (document or special). */
  readonly activeTabId: WorkspaceTabId | undefined;
}

/**
 * Build the (view-state-free) snapshot inputs from renderer state. Cheap
 * enough to call on every render — no serialization, no hashing.
 */
export function buildSessionSnapshotInputs(
  sessionId: string,
  project: PergamumProject | null,
  openDocumentsState: OpenDocumentsState,
  previewVisible: boolean,
  workspaceTabs?: SessionWorkspaceTabs
): SessionSnapshotInputs {
  const active = activeOpenDocument(openDocumentsState);
  const editors: SessionEditorInput[] = [];
  let activeDocumentIdentity: SessionEditorIdentity | null = null;
  let activeSpecialIdentity: SessionEditorIdentity | null = null;

  const pushDocument = (openDocument: OpenDocument): void => {
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
      activeDocumentIdentity = sessionEditorIdentity(editorInput.editor);
    }
  };

  if (!workspaceTabs) {
    openDocumentsState.documents.forEach(pushDocument);
  } else {
    const pushed = new Set<OpenDocument>();

    for (const tabId of workspaceTabs.tabIds) {
      if (tabId.kind === "document") {
        const openDocument = findOpenDocument(
          openDocumentsState,
          tabId.editorId
        );

        if (openDocument && !pushed.has(openDocument)) {
          pushed.add(openDocument);
          pushDocument(openDocument);
        }

        continue;
      }

      // Special tab: only a restorable one (never Debug Log), and a
      // Project-dependent one only while a Project is open.
      if (
        !isSessionRestorableSpecialTab(tabId.id) ||
        (specialTabRequiresProject(tabId.id) && project === null)
      ) {
        continue;
      }

      const editor: SessionEditor = {
        kind: "specialTab",
        order: editors.length,
        tabId: tabId.id,
        viewState: null
      };

      editors.push({ editor, viewStateKey: null });

      if (workspaceTabs.activeTabId?.kind === "special" && workspaceTabs.activeTabId.id === tabId.id) {
        activeSpecialIdentity = sessionEditorIdentity(editor);
      }
    }

    // Safety net: a document not (yet) in `tabIds` is still recorded.
    for (const openDocument of openDocumentsState.documents) {
      if (!pushed.has(openDocument)) {
        pushDocument(openDocument);
      }
    }
  }

  // A restorable active special tab wins; otherwise (a document, or a special
  // tab that is not restored such as Debug Log) the active document is the
  // saved active identity, exactly as before special tabs were recorded.
  const activeEditor: SessionEditorIdentity | null =
    activeSpecialIdentity ?? activeDocumentIdentity;

  return {
    sessionId,
    projectContext: project
      ? {
          projectFilePath: project.activeProjectFilePath,
          rootPath: project.rootPath
        }
      : null,
    editors,
    activeEditor,
    previewVisible
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
      // An image viewer tab never carries View State.
      if (viewStateKey === null || editor.kind === "projectImage") {
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
    activeEditor: inputs.activeEditor,
    previewVisible: inputs.previewVisible
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
