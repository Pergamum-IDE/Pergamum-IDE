import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor
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
  isOpenDocumentDirty,
  openOrActivateEditor,
  openOrActivateDocument,
  replaceOpenDocument,
  createOpenDocumentsStateWithEditor,
  removeProjectScopedOpenEditors,
  resolveCloseTargetEditorId,
  updateActiveOpenDocument,
  updateActiveOpenEditor,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  createEditorIdForPath,
  createFileEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  editorIdEquals,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import type { PergamumProject, ProjectDocument } from "../../src/shared/api";
import type { GlossaryEntry } from "../../src/shared/glossary";

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

const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  kind: "place",
  description: "王国の首都",
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
        state.activeDocumentId,
        createProjectDocumentEditorId("chapter-01.md", projectContext)
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("markdown");
    expect(state.documents[0].editor.document.content).toBe("project content");
  });

  it("keeps a file CurrentDocument inside the project root as a standalone file editor", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createFileDocument({
        path: "C:\\Novel\\chapter-01.md",
        content: "content"
      }),
      projectContext
    );

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createFileEditorIdForPath("C:\\Novel\\chapter-01.md")
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("markdown");
    expect(state.documents[0].editor.document.kind).toBe("file");
  });

  it("keeps a file CurrentDocument distinct from an already-open projectDocument at the same path", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    const nextState = openOrActivateDocument(
      state,
      createFileDocument({
        path: "C:\\Novel\\chapter-01.md",
        content: "content"
      }),
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
      {
        path: "C:\\novel\\chapter-01.md",
        content: "content"
      },
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
      {
        path: "C:\\novel\\Chapter-01.md",
        content: "content"
      },
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
        {
          path: "C:\\Novel\\missing.md",
          content: "content"
        },
        project,
        projectContext
      )
    ).toThrow("Project document is not listed in the active project.");
  });

  it("keeps the existing multi-tab behavior for standalone files", () => {
    const firstDocument = createFileDocument({
      path: "D:\\Outside\\first.md",
      content: "first"
    });
    const secondDocument = createFileDocument({
      path: "D:\\Outside\\second.md",
      content: "second"
    });
    let state = createInitialOpenDocumentsState();

    state = openOrActivateDocument(state, firstDocument, projectContext);
    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createEditorIdForPath("D:\\Outside\\first.md", projectContext)
      )
    ).toBe(true);

    state = openOrActivateDocument(state, secondDocument, projectContext);
    expect(state.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createEditorIdForPath("D:\\Outside\\second.md", projectContext)
      )
    ).toBe(true);

    state = openOrActivateDocument(state, firstDocument, projectContext);
    expect(state.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        state.activeDocumentId,
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

    const untitledEditorId = state.activeDocumentId;

    const result = replaceOpenDocument(
      state,
      untitledEditorId,
      createFileDocument({
        path: "C:\\Novel\\chapter-01.md",
        content: "saved"
      }),
      projectContext
    );

    expect(result.didCollide).toBe(false);
    expect(
      editorIdEquals(
        result.state.activeDocumentId,
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
        result.state.activeDocumentId,
        createProjectDocumentEditorId("chapter-renamed.md", projectContext)
      )
    ).toBe(true);
    expect(documentTabs(result.state)[0].title).toBe("chapter-renamed.md");
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
        state.activeDocumentId,
        createProjectDocumentEditorId("chapter-02.md", projectContext)
      )
    ).toBe(true);
  });

  it("keeps Markdown documents and glossary entries in one Open Documents state", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );

    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    expect(state.documents).toHaveLength(2);
    expect(documentTabs(state)).toEqual([
      {
        id: createProjectDocumentEditorId("chapter-01.md", projectContext),
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      },
      {
        id: createGlossaryEntryEditorId(glossaryEntry.id, projectContext),
        title: "王都",
        isDirty: false,
        isExternalMarkdownFile: false
      }
    ]);
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
      createFileDocument({
        path: "C:\\Outside\\notes.md",
        content: "external content"
      }),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const flags = documentTabs(state).map((tab) => tab.isExternalMarkdownFile);

    expect(flags).toEqual([false, true, false]);
  });

  it("opening an external Markdown file mutates no project state", () => {
    const documentsBeforeOpen = project.documents;
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    state = openOrActivateDocument(
      state,
      createFileDocument({
        path: "C:\\Outside\\notes.md",
        content: "external content"
      }),
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
    const fileDocument = createFileDocument({
      path: `${projectContext.rootPath}\\chapter-01.md`,
      content: "content"
    });
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

  it("does not duplicate the same glossary entry when reopened", () => {
    const firstEditor = createGlossaryEntryCurrentEditor(glossaryEntry);
    const secondEditor = createGlossaryEntryCurrentEditor({
      ...glossaryEntry,
      description: "changed after the first open"
    });
    let state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      firstEditor,
      projectContext
    );

    state = openOrActivateEditor(state, secondEditor, projectContext);

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createGlossaryEntryEditorId(glossaryEntry.id, projectContext)
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("glossaryEntry");
    expect(state.documents[0].editor.draft.entry.description).toBe(
      "王国の首都"
    );
  });

  it("updates only the active editor's draft, leaving other open editors untouched", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const updatedState = updateActiveOpenEditor(state, (editor) =>
      editor.kind === "glossaryEntry"
        ? {
            ...editor,
            draft: { ...editor.draft, description: "編集後" }
          }
        : editor
    );

    expect(updatedState.documents[1].editor.draft.description).toBe("編集後");
    expect(updatedState.documents[0].editor.document.content).toBe(
      "project content"
    );
  });

  it("does nothing when closing an EditorId that is not open", () => {
    const state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext
    );

    const nextState = closeOpenEditor(
      state,
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext)
    );

    expect(nextState).toBe(state);
  });

  it("closes an inactive tab without changing the active document", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const glossaryEditorId = createGlossaryEntryEditorId(
      glossaryEntry.id,
      projectContext
    );
    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );
    state = activateOpenDocument(state, projectDocumentEditorId);

    const nextState = closeOpenEditor(state, glossaryEditorId);

    expect(nextState.documents).toHaveLength(1);
    expect(editorIdEquals(nextState.activeDocumentId, projectDocumentEditorId)).toBe(
      true
    );
  });

  it("activates an adjacent tab when closing the active tab", () => {
    const projectDocument = createProjectDocument(
      firstProjectDocument,
      "project content"
    );
    let state = createOpenDocumentsStateWithDocument(
      projectDocument,
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const projectDocumentEditorId = createProjectDocumentEditorId(
      "chapter-01.md",
      projectContext
    );

    expect(
      editorIdEquals(
        state.activeDocumentId,
        createGlossaryEntryEditorId(glossaryEntry.id, projectContext)
      )
    ).toBe(true);

    const nextState = closeOpenEditor(
      state,
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext)
    );

    expect(nextState.documents).toHaveLength(1);
    expect(editorIdEquals(nextState.activeDocumentId, projectDocumentEditorId)).toBe(
      true
    );
  });

  it("returns to the empty zero-tab state when closing the last open tab (#262)", () => {
    const glossaryEditorId = createGlossaryEntryEditorId(
      glossaryEntry.id,
      projectContext
    );
    const seededState = openOrActivateEditor(
      createInitialOpenDocumentsState(5),
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    const nextState = closeOpenEditor(seededState, glossaryEditorId);

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
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createFileDocument({
        path: standalonePath,
        content: "standalone content"
      }),
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
      editorIdEquals(nextState.activeDocumentId, createUntitledEditorId(1))
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
      createFileDocument({
        path: standalonePath,
        content: "standalone content"
      }),
      projectContext
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    state = activateOpenDocument(state, standaloneEditorId);

    const nextState = removeProjectScopedOpenEditors(state);

    expect(documentTabs(nextState).map((tab) => tab.title)).toEqual([
      "memo.md"
    ]);
    expect(editorIdEquals(nextState.activeDocumentId, standaloneEditorId)).toBe(
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
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    state = openOrActivateDocument(
      state,
      createFileDocument({
        path: standalonePath,
        content: "standalone content"
      }),
      projectContext
    );
    state = activateOpenDocument(state, projectDocumentEditorId);

    const nextState = removeProjectScopedOpenEditors(state);

    expect(documentTabs(nextState).map((tab) => tab.title)).toEqual([
      "memo.md"
    ]);
    expect(editorIdEquals(nextState.activeDocumentId, standaloneEditorId)).toBe(
      true
    );
  });

  it("returns to zero-tab when explicit Project Close removes every open editor", () => {
    let state = createOpenDocumentsStateWithDocument(
      createProjectDocument(firstProjectDocument, "project content"),
      projectContext,
      7
    );
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
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
    expect(state.documents[0].editor.document.kind).toBe("untitled");
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
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    expectConsistent(state);
    state = activateOpenDocument(state, projectDocumentEditorId);
    expectConsistent(state);

    // close the inactive tab -> still consistent, still 1 tab
    state = closeOpenEditor(
      state,
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext)
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

    expect(editorIdEquals(state.activeDocumentId, firstEditorId)).toBe(false);
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
      updateCurrentDocumentContent(document, "changed")
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
      createFileDocument({
        path: "C:\\Elsewhere\\notes.md",
        content: "content"
      }),
      projectContext
    );

    expect(activeProjectDocumentRelativePath(state)).toBeNull();
  });

  it("is null for a glossary-entry editor", () => {
    const state = createOpenDocumentsStateWithEditor(
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );

    expect(activeProjectDocumentRelativePath(state)).toBeNull();
  });
});
