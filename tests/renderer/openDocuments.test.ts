import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import {
  createMarkdownCurrentEditor,
  type MarkdownCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  currentDocumentForOpenedFile,
  findProjectDocumentByEditorId
} from "../../src/renderer/projectDocumentResolution";
import {
  activateOpenDocument,
  activeProjectDocumentRelativePath,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  createOpenDocumentsStateWithDocument,
  documentTabs,
  editorIdsForBatchTabClose,
  findOpenDocument,
  isOpenDocumentDirty,
  openOrActivateDocument,
  reorderOpenDocuments,
  replaceOpenDocument,
  createOpenDocumentsStateWithEditor,
  removeProjectScopedOpenEditors,
  resolveCloseTargetEditorId,
  updateActiveOpenDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  createEditorIdForPath,
  createFileEditorIdForPath,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  editorIdEquals,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import type {
  MarkdownFile,
  PergamumProject,
  ProjectDocument
} from "../../src/shared/api";

function markdownFile(path: string, content: string): MarkdownFile {
  return {
    path,
    content,
    metadata: {
      encoding: "utf8",
      lineEnding: "lf",
      byteLength: Buffer.byteLength(content, "utf8"),
      characterLength: content.length,
      hadBom: false
    }
  };
}

const projectContext: ActiveProjectContext = {
  rootPath: "C:\\Novel"
};

const firstProjectDocument: ProjectDocument = {
  relativePath: "chapter-01.md",
  name: "chapter-01.md"
};

const secondProjectDocument: ProjectDocument = {
  relativePath: "chapter-02.md",
  name: "chapter-02.md"
};

const project: PergamumProject = {
  rootPath: projectContext.rootPath,
  activeProjectFilePath: `${projectContext.rootPath}\\pergamum.db`,
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [firstProjectDocument, secondProjectDocument]
};

describe("OpenDocumentsState", () => {
  it("does not duplicate a project document opened with relative path case differences", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    const sameProjectDocumentWithDifferentCase = createProjectDocument(
      {
        relativePath: "Chapter-01.md",
        name: "Chapter-01.md"
      },
      "other content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );

    state = openOrActivateDocument(
      state,
      sameProjectDocumentWithDifferentCase,
      projectContext
    );

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createProjectDocumentEditorId("chapter-01.md", projectContext)
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("markdown");
    expect(
      (state.documents[0].editor as MarkdownCurrentEditor).document.content
    ).toBe("project content");
  });

  it("keeps a file CurrentDocument inside the project root as a standalone file editor", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createFileDocument(markdownFile("C:\\Novel\\chapter-01.md", "content")),
      projectContext
    );

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createFileEditorIdForPath("C:\\Novel\\chapter-01.md")
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("markdown");
    expect(
      (state.documents[0].editor as MarkdownCurrentEditor).document.kind
    ).toBe("file");
  });

  it("keeps a file CurrentDocument distinct from an already-open projectDocument at the same path", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    const nextState = openOrActivateDocument(
      state,
      createFileDocument(markdownFile("C:\\Novel\\chapter-01.md", "content")),
      projectContext
    );

    expect(nextState.documents).toHaveLength(2);
    expect(
      nextState.documents.some(
        (document) => document.editor.kind === "markdown" &&
          document.editor.document.kind === "file"
      )
    ).toBe(true);
  });

  it("matches Windows project listings case-insensitively without changing display paths", () => {
    const projectWithMixedCaseListing: PergamumProject = {
      ...project,
      documents: [
        {
          relativePath: "Chapter-01.md",
          name: "Chapter-01.md"
        }
      ]
    };
    const document = currentDocumentForOpenedFile(
      markdownFile("C:\\novel\\chapter-01.md", "content"),
      projectWithMixedCaseListing,
      projectContext
    );

    expect(document).toMatchObject({
      kind: "project",
      relativePath: "Chapter-01.md"
    });
  });

  it("matches project listings through EditorId identity semantics", () => {
    const editorId = createEditorIdForPath(
      "C:\\novel\\Chapter-01.md",
      projectContext
    );

    expect(
      findProjectDocumentByEditorId(project, editorId, projectContext)
    ).toBe(firstProjectDocument);
  });

  it("creates a project CurrentDocument for a listed project file path", () => {
    const document = currentDocumentForOpenedFile(
      markdownFile("C:\\novel\\Chapter-01.md", "content"),
      project,
      projectContext
    );

    expect(document).toMatchObject({
      kind: "project",
      relativePath: "chapter-01.md"
    });
  });

  it("does not fall back to a file CurrentDocument for an unlisted project path", () => {
    expect(() =>
      currentDocumentForOpenedFile(
        markdownFile("C:\\Novel\\missing.md", "content"),
        project,
        projectContext
      )
    ).toThrow("Project document is not listed in the active project.");
  });

  it("keeps the existing multi-tab behavior for standalone files", () => {
    const firstDocument = createFileDocument(markdownFile("D:\\Outside\\first.md", "first"));
    const secondDocument = createFileDocument(markdownFile("D:\\Outside\\second.md", "second"));
    let state = createInitialOpenDocumentsState();

    state = openOrActivateDocument(state, firstDocument, projectContext);
    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createEditorIdForPath("D:\\Outside\\first.md", projectContext)
      )
    ).toBe(true);

    state = openOrActivateDocument(state, secondDocument, projectContext);
    expect(state.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createEditorIdForPath("D:\\Outside\\second.md", projectContext)
      )
    ).toBe(true);

    state = openOrActivateDocument(state, firstDocument, projectContext);
    expect(state.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createEditorIdForPath("D:\\Outside\\first.md", projectContext)
      )
    ).toBe(true);
  });

  it("keeps untitled EditorIds session-stable while allocating new untitled IDs", () => {
    const firstState = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(),
      projectContext
    );
    const firstEditorId = firstState.activeDocumentId;
    const nextState = openOrActivateDocument(
      firstState,
      createUntitledDocument(),
      projectContext
    );

    expect(
      editorIdEquals(firstEditorId as EditorId, createUntitledEditorId(1))
    ).toBe(true);
    // Opening the second Untitled tab must not renumber the first.
    expect(
      editorIdEquals(firstState.activeDocumentId as EditorId, firstEditorId as EditorId)
    ).toBe(true);
    expect(nextState.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        nextState.activeDocumentId as EditorId,
        createUntitledEditorId(2)
      )
    ).toBe(true);
    expect(nextState.nextUntitledId).toBe(3);
  });

  it("does not reuse untitled session IDs across an OpenDocumentsState reset", () => {
    const firstState = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(),
      projectContext
    );
    // A reset threads `nextUntitledId` forward from the state being replaced.
    const resetState = openOrActivateDocument(
      createInitialOpenDocumentsState(firstState.nextUntitledId),
      createUntitledDocument(),
      projectContext
    );

    expect(
      editorIdEquals(
        firstState.activeDocumentId as EditorId,
        createUntitledEditorId(1)
      )
    ).toBe(true);
    expect(
      editorIdEquals(
        resetState.activeDocumentId as EditorId,
        createUntitledEditorId(2)
      )
    ).toBe(true);
  });

  it("allows replacement with a file CurrentDocument inside the project root", () => {
    const existingProjectDocument = createProjectDocument(
      firstProjectDocument,
      "existing"
    );
    let state = createOpenDocumentsStateWithDocument(
      existingProjectDocument,
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createUntitledDocument(),
      projectContext
    );

    const untitledEditorId = state.activeDocumentId as EditorId;

    const result = replaceOpenDocument(
      state,
      untitledEditorId,
      createFileDocument(markdownFile("C:\\Novel\\chapter-01.md", "saved")),
      projectContext
    );

    expect(result.didCollide).toBe(false);
    expect(
      editorIdEquals(
        result.state.activeDocumentId as EditorId,
        createFileEditorIdForPath("C:\\Novel\\chapter-01.md")
      )
    ).toBe(true);
  });

  it("replaces a clean project document with a renamed project document identity", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "existing"),
      projectContext
    );
    const result = replaceOpenDocument(
      state,
      createProjectDocumentEditorId("chapter-01.md", projectContext),
      createProjectDocument(
        {
          relativePath: "chapter-renamed.md",
          name: "chapter-renamed.md"
        },
        "existing"
      ),
      projectContext
    );

    expect(result.didCollide).toBe(false);
    expect(
      editorIdEquals(
        result.state.activeDocumentId as EditorId,
        createProjectDocumentEditorId("chapter-renamed.md", projectContext)
      )
    ).toBe(true);
    expect(documentTabs(result.state)[0].title).toBe("chapter-renamed.md");
  });

  it("relocates a clean open project document to a new folder after a File Explorer Move (#338)", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "existing"),
      projectContext
    );
    const result = replaceOpenDocument(
      state,
      createProjectDocumentEditorId("chapter-01.md", projectContext),
      createProjectDocument(
        {
          relativePath: "Archive/chapter-01.md",
          name: "chapter-01.md"
        },
        "existing"
      ),
      projectContext
    );

    expect(result.didCollide).toBe(false);
    // The editor identity — which is also the save target — follows the new
    // project-relative path; the old identity no longer resolves.
    expect(
      editorIdEquals(
        result.state.activeDocumentId as EditorId,
        createProjectDocumentEditorId(
          "Archive/chapter-01.md",
          projectContext
        )
      )
    ).toBe(true);
    expect(
      findOpenDocument(
        result.state,
        createProjectDocumentEditorId("chapter-01.md", projectContext)
      )
    ).toBeNull();
    expect(documentTabs(result.state)[0].title).toBe("chapter-01.md");
  });

  it("opens a project document into the empty zero-tab initial state (#262)", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createProjectDocument(secondProjectDocument, "second"),
      projectContext
    );

    expect(documentTabs(state)).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createProjectDocumentEditorId("chapter-02.md", projectContext)
      )
    ).toBe(true);
  });

  it("marks only an external (file-kind) Markdown document's tab as isExternalMarkdownFile (#152 dogfood follow-up)", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );

    state = openOrActivateDocument(
      state,
      createFileDocument(markdownFile("C:\\Outside\\notes.md", "external content")),
      projectContext
    );

    const flags = documentTabs(state).map((tab) => tab.isExternalMarkdownFile);

    expect(flags).toEqual([false, true]);
  });

  it("opening an external Markdown file mutates no project state", () => {
    const documentsBeforeOpen = project.documents;
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    state = openOrActivateDocument(
      state,
      createFileDocument(markdownFile("C:\\Outside\\notes.md", "external content")),
      projectContext
    );

    // `openOrActivateDocument` / `documentTabs` only ever operate on
    // OpenDocumentsState — neither takes a PergamumProject argument, so the
    // project's own document list is structurally unreachable from this
    // flow and stays exactly the reference it started as.
    expect(project.documents).toBe(documentsBeforeOpen);
    expect(documentTabs(state).some((tab) => tab.isExternalMarkdownFile)).toBe(
      true
    );
  });

  it("does not derive isExternalMarkdownFile from a raw path string comparison against the project root", () => {
    // Built directly (bypassing createEditorIdForPath's own path-based
    // routing, a separate concern) with a path string that is textually
    // "inside" the project root, to prove documentTabs reads
    // CurrentDocument.kind rather than comparing paths itself.
    const fileDocument = createFileDocument(
      markdownFile(`${projectContext.rootPath}\\chapter-01.md`, "content")
    );
    const editorId = createUntitledEditorId(1);
    const state = {
      documents: [
        { id: editorId, editor: createMarkdownCurrentEditor(fileDocument) }
      ],
      activeDocumentId: editorId,
      nextUntitledId: 2
    };

    expect(documentTabs(state)[0].isExternalMarkdownFile).toBe(true);
  });

  it("does nothing when closing an EditorId that is not open", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    const nextState = closeOpenEditor(
      state,
      createProjectDocumentEditorId("not-open.md", projectContext)
    );

    expect(nextState).toBe(state);
  });

  it("closes an inactive tab without changing the active document", () => {
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createProjectDocument(secondProjectDocument, "second content"),
      projectContext
    );

    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );
    const secondProjectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-02.md",
      projectContext
    );
    state = activateOpenDocument(state, projectDocumentEditorId);

    const nextState = closeOpenEditor(state, secondProjectDocumentEditorId);

    expect(nextState.documents).toHaveLength(1);
    expect(editorIdEquals(nextState.activeDocumentId as EditorId, projectDocumentEditorId)).toBe(
      true
    );
  });

  it("activates an adjacent tab when closing the active tab", () => {
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createProjectDocument(secondProjectDocument, "second content"),
      projectContext
    );

    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );

    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createProjectDocumentEditorId("chapter-02.md", projectContext)
      )
    ).toBe(true);

    const nextState = closeOpenEditor(
      state,
      createProjectDocumentEditorId("chapter-02.md", projectContext)
    );

    expect(nextState.documents).toHaveLength(1);
    expect(editorIdEquals(nextState.activeDocumentId as EditorId, projectDocumentEditorId)).toBe(
      true
    );
  });

  it("returns to the empty zero-tab state when closing the last open tab (#262)", () => {
    const seededState = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext,
      5
    );
    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );

    const nextState = closeOpenEditor(seededState, projectDocumentEditorId);

    // #262: no placeholder Untitled tab is re-seeded — `nextUntitledId` is
    // preserved so future Untitled tabs still get fresh session IDs.
    expect(nextState.documents).toHaveLength(0);
    expect(nextState.activeDocumentId).toBeNull();
    expect(nextState.nextUntitledId).toBe(5);
  });

  it("removes only project-scoped editors for explicit Project Close", () => {
    const standalonePath = "C:\\Outside\\memo.md";
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createFileDocument(markdownFile(standalonePath, "standalone content")),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createUntitledDocument(),
      projectContext
    );

    const nextState = removeProjectScopedOpenEditors(state);

    expect(documentTabs(nextState).map((tab) => tab.title)).toEqual([
      "memo.md",
      "Untitled.md"
    ]);
    expect(
      nextState.documents.map((openDocument) =>
        openDocument.editor.kind === "markdown"
          ? openDocument.editor.document.kind
          : openDocument.editor.kind
      )
    ).toEqual(["file", "untitled"]);
    expect(
      editorIdEquals(nextState.activeDocumentId as EditorId, createUntitledEditorId(1))
    ).toBe(true);
    expect(nextState.nextUntitledId).toBe(2);
  });

  it("keeps an active standalone editor active after explicit Project Close filtering", () => {
    const standalonePath = "C:\\Outside\\memo.md";
    const standaloneEditorId = createFileEditorIdForPath(standalonePath);
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createFileDocument(markdownFile(standalonePath, "standalone content")),
      projectContext
    );
    state = activateOpenDocument(state, standaloneEditorId);

    const nextState = removeProjectScopedOpenEditors(state);

    expect(documentTabs(nextState).map((tab) => tab.title)).toEqual([
      "memo.md"
    ]);
    expect(editorIdEquals(nextState.activeDocumentId as EditorId, standaloneEditorId)).toBe(
      true
    );
  });

  it("uses the existing close fallback when the active project editor is removed", () => {
    const standalonePath = "C:\\Outside\\memo.md";
    const projectDocumentEditorId = createProjectDocumentEditorId(
      firstProjectDocument.relativePath,
      projectContext
    );
    const standaloneEditorId = createFileEditorIdForPath(standalonePath);
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createFileDocument(markdownFile(standalonePath, "standalone content")),
      projectContext
    );
    state = activateOpenDocument(state, projectDocumentEditorId);

    const nextState = removeProjectScopedOpenEditors(state);

    expect(documentTabs(nextState).map((tab) => tab.title)).toEqual([
      "memo.md"
    ]);
    expect(editorIdEquals(nextState.activeDocumentId as EditorId, standaloneEditorId)).toBe(
      true
    );
  });

  it("returns to zero-tab when explicit Project Close removes every open editor", () => {
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext,
      7
    );

    const nextState = removeProjectScopedOpenEditors(state);

    expect(nextState.documents).toEqual([]);
    expect(nextState.activeDocumentId).toBeNull();
    expect(nextState.nextUntitledId).toBe(7);
  });
});

describe("OpenDocumentsState zero-tab invariant (#262)", () => {
  function expectConsistent(state: OpenDocumentsState): void {
    if (state.documents.length === 0) {
      expect(state.activeDocumentId).toBeNull();
      return;
    }

    expect(state.activeDocumentId).not.toBeNull();
    expect(
      state.documents.some((document) =>
        editorIdEquals(document.id, state.activeDocumentId as EditorId)
      )
    ).toBe(true);
  }

  it("the initial state has no tabs, no active editor, and no placeholder document", () => {
    const state = createInitialOpenDocumentsState();

    expect(state.documents).toEqual([]);
    expect(state.activeDocumentId).toBeNull();
    expectConsistent(state);
  });

  it("only createInitialOpenDocumentsState makes a zero-tab state — a real Untitled document seeds a one-tab state", () => {
    const state = createOpenDocumentsStateWithDocument(
      createUntitledDocument(),
      null
    );

    expect(state.documents).toHaveLength(1);
    expect(state.activeDocumentId).not.toBeNull();
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createUntitledEditorId(1)
      )
    ).toBe(true);
    expect(
      (state.documents[0].editor as MarkdownCurrentEditor).document.kind
    ).toBe("untitled");
    expect(state.nextUntitledId).toBe(2);
    expectConsistent(state);
  });

  it("createOpenDocumentsStateWithEditor allocates a session-local EditorId for an Untitled editor", () => {
    const state = createOpenDocumentsStateWithEditor(
      createMarkdownCurrentEditor(createUntitledDocument()),
      null,
      5
    );

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        createUntitledEditorId(5)
      )
    ).toBe(true);
    expect(state.nextUntitledId).toBe(6);
    expectConsistent(state);
  });

  it("holds through open / activate / close / reset transitions", () => {
    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );

    let state: OpenDocumentsState = createInitialOpenDocumentsState();
    expectConsistent(state);

    // open -> 1 tab, active is the opened document
    state = openOrActivateDocument(
      state,
      createProjectDocument(firstProjectDocument, "content"),
      projectContext
    );
    expectConsistent(state);
    expect(
      editorIdEquals(
        state.activeDocumentId as EditorId,
        projectDocumentEditorId
      )
    ).toBe(true);

    // open a second tab, then re-activate the first
    state = openOrActivateDocument(
      state,
      createProjectDocument(secondProjectDocument, "second content"),
      projectContext
    );
    expectConsistent(state);
    state = activateOpenDocument(state, projectDocumentEditorId);
    expectConsistent(state);

    // close the inactive tab -> still consistent, still 1 tab
    state = closeOpenEditor(
      state,
      createProjectDocumentEditorId("chapter-02.md", projectContext)
    );
    expectConsistent(state);
    expect(state.documents).toHaveLength(1);

    // close the last tab -> back to the zero-tab state
    state = closeOpenEditor(state, projectDocumentEditorId);
    expectConsistent(state);
    expect(state.documents).toHaveLength(0);

    // reset (project context switch) keeps it consistent and empty
    state = createInitialOpenDocumentsState(state.nextUntitledId);
    expectConsistent(state);
    expect(state.documents).toHaveLength(0);
  });
});

describe("resolveCloseTargetEditorId (#184)", () => {
  it("resolves to the active editor when no editorId is given", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(),
      projectContext
    );

    expect(
      editorIdEquals(
        resolveCloseTargetEditorId(state, undefined) as EditorId,
        state.activeDocumentId as EditorId
      )
    ).toBe(true);
  });

  it("resolves to null when there are no open tabs (#262 zero-tab state)", () => {
    expect(
      resolveCloseTargetEditorId(createInitialOpenDocumentsState(), undefined)
    ).toBeNull();
  });

  it("resolves an explicit editorId that is open, even if it is not active", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createProjectDocument(secondProjectDocument, "content"),
      projectContext
    );
    const firstEditorId = createProjectDocumentEditorId(
      firstProjectDocument.relativePath,
      projectContext
    );

    expect(editorIdEquals(state.activeDocumentId as EditorId, firstEditorId)).toBe(false);
    expect(
      editorIdEquals(
        resolveCloseTargetEditorId(state, firstEditorId) as EditorId,
        firstEditorId
      )
    ).toBe(true);
  });

  it("resolves to null for an explicit editorId that is not open (never falls back to the active editor)", () => {
    const state = createInitialOpenDocumentsState();
    const unrelatedEditorId = createProjectDocumentEditorId(
      "not-open.md",
      projectContext
    );

    expect(resolveCloseTargetEditorId(state, unrelatedEditorId)).toBeNull();
  });
});

describe("isOpenDocumentDirty (#184)", () => {
  it("is false for a clean document", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(),
      projectContext
    );

    expect(
      isOpenDocumentDirty(state, state.activeDocumentId as EditorId)
    ).toBe(false);
  });

  it("is true once the document's content has changed", () => {
    const initialState = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(),
      projectContext
    );
    const dirtyState = updateActiveOpenDocument(initialState, (document) =>
      updateCurrentDocumentContent(
        document,
        "changed",
        buildLineEndingBreakSet(analyzeLineEndings("changed"))
      )
    );

    expect(
      isOpenDocumentDirty(dirtyState, dirtyState.activeDocumentId as EditorId)
    ).toBe(true);
  });

  it("is false for an editorId that is not open", () => {
    const state = createInitialOpenDocumentsState();
    const unrelatedEditorId = createProjectDocumentEditorId(
      "not-open.md",
      projectContext
    );

    expect(isOpenDocumentDirty(state, unrelatedEditorId)).toBe(false);
  });
});

describe("activeProjectDocumentRelativePath (#318)", () => {
  it("returns the project-relative path of the active project-file editor", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(secondProjectDocument, "content"),
      projectContext
    );

    expect(activeProjectDocumentRelativePath(state)).toBe("chapter-02.md");
  });

  it("is null in the zero-tab state (no active editor)", () => {
    expect(
      activeProjectDocumentRelativePath(createInitialOpenDocumentsState())
    ).toBeNull();
  });

  it("is null for an untitled document", () => {
    const state = createOpenDocumentsStateWithDocument(
      createUntitledDocument(),
      projectContext
    );

    expect(activeProjectDocumentRelativePath(state)).toBeNull();
  });

  it("is null for an external / standalone Markdown file editor", () => {
    const state = createOpenDocumentsStateWithDocument(
      createFileDocument(markdownFile("C:\\Elsewhere\\notes.md", "content")),
      projectContext
    );

    expect(activeProjectDocumentRelativePath(state)).toBeNull();
  });

});

describe("reorderOpenDocuments / editorIdsForBatchTabClose (#354)", () => {
  function fourTabState(): OpenDocumentsState {
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument({ relativePath: "a.md", name: "a.md" }, "a"),
      projectContext
    );
    for (const relativePath of ["b.md", "c.md", "d.md"]) {
      state = openOrActivateDocument(
        state,
        createProjectDocument({ relativePath, name: relativePath }, relativePath),
        projectContext
      );
    }
    // active = last opened ("d.md")
    return state;
  }

  const idFor = (relativePath: string): EditorId =>
    createProjectDocumentEditorId(relativePath, projectContext);
  const order = (state: OpenDocumentsState): string[] =>
    state.documents.map((d) =>
      d.editor.kind === "markdown" && d.editor.document.kind === "project"
        ? d.editor.document.relativePath
        : "?"
    );

  it("moves a tab right", () => {
    const state = fourTabState();
    const next = reorderOpenDocuments(state, idFor("a.md"), 2);
    expect(order(next)).toEqual(["b.md", "c.md", "a.md", "d.md"]);
  });

  it("moves a tab left", () => {
    const state = fourTabState();
    const next = reorderOpenDocuments(state, idFor("d.md"), 0);
    expect(order(next)).toEqual(["d.md", "a.md", "b.md", "c.md"]);
  });

  it("is a no-op (same reference) when the target index equals the source", () => {
    const state = fourTabState();
    expect(reorderOpenDocuments(state, idFor("b.md"), 1)).toBe(state);
  });

  it("is a no-op for an unknown editor id", () => {
    const state = fourTabState();
    expect(reorderOpenDocuments(state, idFor("zzz.md"), 0)).toBe(state);
  });

  it("clamps an out-of-range target index", () => {
    const state = fourTabState();
    expect(order(reorderOpenDocuments(state, idFor("a.md"), 99))).toEqual([
      "b.md",
      "c.md",
      "d.md",
      "a.md"
    ]);
    expect(order(reorderOpenDocuments(state, idFor("d.md"), -5))).toEqual([
      "d.md",
      "a.md",
      "b.md",
      "c.md"
    ]);
  });

  it("preserves activeDocumentId, identity, dirty and view state", () => {
    let state = fourTabState();
    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "dirty edit",
        buildLineEndingBreakSet(analyzeLineEndings("dirty edit"))
      )
    );
    const activeBefore = state.activeDocumentId as EditorId;
    const dirtyBefore = documentTabs(state).map((t) => t.isDirty);

    const next = reorderOpenDocuments(state, idFor("a.md"), 3);

    expect(editorIdEquals(next.activeDocumentId as EditorId, activeBefore)).toBe(true);
    expect(next.nextUntitledId).toBe(state.nextUntitledId);
    // same OpenDocument objects, just reordered
    expect(new Set(next.documents)).toEqual(new Set(state.documents));
    const dirtyAfterByPath = new Map(
      next.documents.map((d) => [
        d.editor.kind === "markdown" && d.editor.document.kind === "project"
          ? d.editor.document.relativePath
          : "?",
        isOpenDocumentDirty(next, d.id)
      ])
    );
    expect(dirtyAfterByPath.get("d.md")).toBe(dirtyBefore[3]);
  });

  it("editorIdsForBatchTabClose — others / left / right, by anchor position", () => {
    const state = fourTabState(); // [a, b, c, d]

    expect(
      editorIdsForBatchTabClose(state, idFor("b.md"), "others").map((id) =>
        id.kind === "projectDocument" ? id.relativePath : "?"
      )
    ).toEqual(["a.md", "c.md", "d.md"]);

    expect(
      editorIdsForBatchTabClose(state, idFor("c.md"), "left").map((id) =>
        id.kind === "projectDocument" ? id.relativePath : "?"
      )
    ).toEqual(["a.md", "b.md"]);

    expect(
      editorIdsForBatchTabClose(state, idFor("b.md"), "right").map((id) =>
        id.kind === "projectDocument" ? id.relativePath : "?"
      )
    ).toEqual(["c.md", "d.md"]);

    // anchor first
    expect(editorIdsForBatchTabClose(state, idFor("a.md"), "left")).toEqual([]);
    // anchor last
    expect(editorIdsForBatchTabClose(state, idFor("d.md"), "right")).toEqual([]);
  });

  it("editorIdsForBatchTabClose — single tab has nothing to batch-close", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "only"),
      projectContext
    );
    const only = state.documents[0].id;
    expect(editorIdsForBatchTabClose(state, only, "others")).toEqual([]);
    expect(editorIdsForBatchTabClose(state, only, "left")).toEqual([]);
    expect(editorIdsForBatchTabClose(state, only, "right")).toEqual([]);
  });

  it("editorIdsForBatchTabClose — unknown anchor yields []", () => {
    const state = fourTabState();
    expect(editorIdsForBatchTabClose(state, idFor("zzz.md"), "others")).toEqual(
      []
    );
  });
});
