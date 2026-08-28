import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument
} from "../../src/renderer/currentDocument";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  createInitialOpenDocumentsState,
  createOpenDocumentsStateWithEditor,
  openOrActivateEditor,
  activateOpenDocument,
  removeProjectScopedOpenEditors,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  createFileEditorIdForPath,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import {
  buildRendererSessionSnapshot,
  buildSessionSnapshotInputs,
  referencedViewStateKeys
} from "../../src/renderer/session/sessionSnapshot";
import type { EditorViewState } from "../../src/renderer/editorViewState";
import type { PergamumProject, ProjectDocument } from "../../src/shared/api";
import type { GlossaryEntry } from "../../src/shared/glossary";

const projectContext: ActiveProjectContext = { rootPath: "C:/Novel" };

const projectDocA: ProjectDocument = { relativePath: "01.md", name: "01.md" };
const projectDocB: ProjectDocument = { relativePath: "02.md", name: "02.md" };

const project: PergamumProject = {
  rootPath: projectContext.rootPath,
  activeProjectFilePath: "C:/Novel/story.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [projectDocA, projectDocB]
};

const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  kind: "place",
  description: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  forms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "王都",
      relation: null,
      warningPolicy: null,
      isCanonical: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ]
};

const SESSION_ID = "018f0000-0000-7000-8000-000000000000";

function markdownFileEditor(filePath: string) {
  return createMarkdownCurrentEditor(
    createFileDocument({ path: filePath, content: "x" })
  );
}

function projectEditor(document: ProjectDocument) {
  return createMarkdownCurrentEditor(
    createProjectDocument(document, "project body")
  );
}

function untitledEditor() {
  return createMarkdownCurrentEditor(createUntitledDocument());
}

function viewState(digestChar: string): EditorViewState {
  return {
    contentDigest: { algorithm: "sha256", digest: digestChar.repeat(64) },
    selection: { anchor: 1, head: 4 },
    scroll: { top: 12, left: 0 }
  };
}

describe("buildSessionSnapshotInputs (#272)", () => {
  it("maps each editor kind to its identity / locator with 0-based order", () => {
    let state = createOpenDocumentsStateWithEditor(
      projectEditor(projectDocA),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/notes/scratch.md"),
      projectContext
    );
    state = openOrActivateEditor(state, untitledEditor(), projectContext);
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const inputs = buildSessionSnapshotInputs(SESSION_ID, project, state);

    expect(inputs.editors.map((e) => e.editor)).toEqual([
      { kind: "projectMarkdown", order: 0, relativePath: "01.md", viewState: null },
      {
        kind: "standaloneMarkdown",
        order: 1,
        filePath: "C:/notes/scratch.md",
        viewState: null
      },
      { kind: "untitled", order: 2, untitledId: "1", viewState: null },
      {
        kind: "glossaryEntry",
        order: 3,
        entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
        viewState: null
      }
    ]);
    expect(inputs.projectContext).toEqual({
      projectFilePath: "C:/Novel/story.pergamum",
      rootPath: "C:/Novel"
    });
    // Glossary has no view-state cache key.
    expect(inputs.editors[3].viewStateKey).toBeNull();
    expect(inputs.editors[1].viewStateKey).not.toBeNull();
  });

  it("captures the active editor identity", () => {
    let state = createOpenDocumentsStateWithEditor(
      markdownFileEditor("C:/a.md"),
      projectContext
    );
    const bId = createFileEditorIdForPath("C:/b.md");
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/b.md"),
      projectContext
    );
    state = activateOpenDocument(state, bId);

    const inputs = buildSessionSnapshotInputs(SESSION_ID, null, state);
    expect(inputs.activeEditor).toEqual({
      kind: "standaloneMarkdown",
      filePath: "C:/b.md"
    });
  });

  it("is a legal zero-tab snapshot (editors: [], activeEditor: null)", () => {
    const inputs = buildSessionSnapshotInputs(
      SESSION_ID,
      null,
      createInitialOpenDocumentsState()
    );

    expect(inputs.editors).toEqual([]);
    expect(inputs.activeEditor).toBeNull();
    expect(inputs.projectContext).toBeNull();
  });

  it("keeps Project Context independent of the editor list (project open + zero tabs)", () => {
    const inputs = buildSessionSnapshotInputs(
      SESSION_ID,
      project,
      createInitialOpenDocumentsState()
    );

    expect(inputs.projectContext).not.toBeNull();
    expect(inputs.editors).toEqual([]);
  });

  it("persists standalone editors with no Project (never fabricates a Project Context)", () => {
    const state = createOpenDocumentsStateWithEditor(
      markdownFileEditor("C:/solo.md"),
      null
    );

    const inputs = buildSessionSnapshotInputs(SESSION_ID, null, state);
    expect(inputs.projectContext).toBeNull();
    expect(inputs.editors).toHaveLength(1);
    expect(inputs.editors[0].editor.kind).toBe("standaloneMarkdown");
  });

  it("keeps both Project Context and standalone-only editors", () => {
    let state = createOpenDocumentsStateWithEditor(
      markdownFileEditor("C:/x.md"),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/y.md"),
      projectContext
    );

    const inputs = buildSessionSnapshotInputs(SESSION_ID, project, state);
    expect(inputs.projectContext).not.toBeNull();
    expect(inputs.editors.map((e) => e.editor.kind)).toEqual([
      "standaloneMarkdown",
      "standaloneMarkdown"
    ]);
  });

  it("keeps a standalone editor active even while a Project is open", () => {
    let state = createOpenDocumentsStateWithEditor(
      projectEditor(projectDocA),
      projectContext
    );
    const standaloneId = createFileEditorIdForPath("C:/active-standalone.md");
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/active-standalone.md"),
      projectContext
    );
    state = activateOpenDocument(state, standaloneId);

    const inputs = buildSessionSnapshotInputs(SESSION_ID, project, state);
    expect(inputs.activeEditor).toEqual({
      kind: "standaloneMarkdown",
      filePath: "C:/active-standalone.md"
    });
  });

  it("after removing project-scoped editors, standalone + untitled remain and Project Context is dropped", () => {
    let state = createOpenDocumentsStateWithEditor(
      projectEditor(projectDocA),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/keep.md"),
      projectContext
    );
    state = openOrActivateEditor(state, untitledEditor(), projectContext);
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    // What explicitProjectClose does in App.tsx: drop project-owned editors
    // and setProject(null).
    state = removeProjectScopedOpenEditors(state);
    const inputs = buildSessionSnapshotInputs(SESSION_ID, null, state);

    expect(inputs.projectContext).toBeNull();
    expect(inputs.editors.map((e) => e.editor.kind)).toEqual([
      "standaloneMarkdown",
      "untitled"
    ]);
  });

  it("distinguishes multiple untitled editors by identity + order", () => {
    let state = createOpenDocumentsStateWithEditor(untitledEditor(), null);
    state = openOrActivateEditor(state, untitledEditor(), null);
    state = openOrActivateEditor(state, untitledEditor(), null);

    const inputs = buildSessionSnapshotInputs(SESSION_ID, null, state);
    const untitledIds = inputs.editors.map(
      (e) => (e.editor as { untitledId: string }).untitledId
    );

    expect(new Set(untitledIds).size).toBe(3);
    expect(inputs.editors.map((e) => e.editor.order)).toEqual([0, 1, 2]);
  });
});

describe("buildRendererSessionSnapshot (#272)", () => {
  function inputsWithTwoMarkdown(): {
    inputs: ReturnType<typeof buildSessionSnapshotInputs>;
    keyA: string;
    keyB: string;
  } {
    let state = createOpenDocumentsStateWithEditor(
      markdownFileEditor("C:/a.md"),
      null
    );
    state = openOrActivateEditor(
      state,
      markdownFileEditor("C:/b.md"),
      null
    );
    const inputs = buildSessionSnapshotInputs(SESSION_ID, null, state);

    return {
      inputs,
      keyA: inputs.editors[0].viewStateKey as string,
      keyB: inputs.editors[1].viewStateKey as string
    };
  }

  it("overlays cached view states onto the matching editors only", () => {
    const { inputs, keyA } = inputsWithTwoMarkdown();
    const cache = new Map<string, EditorViewState | null>([
      [keyA, viewState("a")]
    ]);

    const snapshot = buildRendererSessionSnapshot(inputs, cache);

    expect(snapshot.editors[0].viewState).toEqual(viewState("a"));
    expect(snapshot.editors[1].viewState).toBeNull();
    expect(snapshot.sessionId).toBe(SESSION_ID);
  });

  it("emits no document body — only the digest", () => {
    const { inputs, keyA } = inputsWithTwoMarkdown();
    const cache = new Map<string, EditorViewState | null>([
      [keyA, viewState("f")]
    ]);

    const serialized = JSON.stringify(
      buildRendererSessionSnapshot(inputs, cache)
    );

    expect(serialized).toContain("contentDigest");
    expect(serialized).not.toMatch(/"(content|body|text|markdown)"\s*:/);
  });

  it("referencedViewStateKeys returns exactly the markdown editor keys", () => {
    const { inputs, keyA, keyB } = inputsWithTwoMarkdown();

    expect(referencedViewStateKeys(inputs)).toEqual(new Set([keyA, keyB]));
  });
});
