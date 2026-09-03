import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import {
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { createGlossaryEntryCurrentEditor } from "../../src/renderer/currentEditor";
import {
  createOpenDocumentsStateWithDocument,
  openOrActivateEditor,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  loadFirstProjectDocumentIfCurrent,
  openFirstProjectDocumentAfterContextSwitch,
  ProjectActivationLifetime,
  resetOpenDocumentsForProjectContextSwitch
} from "../../src/renderer/projectActivationState";

const oldProjectContext: ActiveProjectContext = {
  rootPath: "C:\\OldNovel"
};

const newProjectContext: ActiveProjectContext = {
  rootPath: "C:\\NewNovel"
};

const oldDocument: ProjectDocument = {
  relativePath: "old-chapter.md",
  name: "old-chapter.md"
};

const newDocument: ProjectDocument = {
  relativePath: "new-chapter.md",
  name: "new-chapter.md"
};

const oldGlossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "旧 Project の用語",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "旧用語",
      matchFlags: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  tags: []
};

function oldProjectScopedOpenDocuments(): OpenDocumentsState {
  const state = createOpenDocumentsStateWithDocument(
    createProjectDocument(oldDocument, "old content"),
    oldProjectContext,
    7
  );

  return openOrActivateEditor(
    state,
    createGlossaryEntryCurrentEditor(oldGlossaryEntry),
    oldProjectContext
  );
}

// #262: a Project Context switch resets to the zero-tab state (Welcome) — no
// placeholder Untitled editor is seeded.
function expectEmptyZeroTabState(state: OpenDocumentsState): void {
  expect(state.documents).toHaveLength(0);
  expect(state.activeDocumentId).toBeNull();
}

function deferred<TResult>(): {
  promise: Promise<TResult>;
  resolve: (value: TResult) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: TResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<TResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function applyLoadedFirstDocument(
  state: OpenDocumentsState,
  document: ReturnType<typeof createProjectDocument>,
  context: ActiveProjectContext
): OpenDocumentsState {
  return openFirstProjectDocumentAfterContextSwitch(
    state,
    document,
    context
  );
}

describe("project activation state", () => {
  it("discards old project-scoped Open Editors at Project Context switch start", () => {
    const resetState = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );

    expectEmptyZeroTabState(resetState);
  });

  it("does not restore an old Glossary Editor when first Project document loading fails", async () => {
    const lifetime = new ProjectActivationLifetime();
    const token = lifetime.startProjectContextSwitch();
    const failedLoad = deferred<ReturnType<typeof createProjectDocument>>();
    let state = oldProjectScopedOpenDocuments();
    state = resetOpenDocumentsForProjectContextSwitch(state);

    const loadedDocument = loadFirstProjectDocumentIfCurrent(
      lifetime,
      token,
      () => failedLoad.promise
    );
    lifetime.startProjectContextSwitch();
    failedLoad.reject(new Error("could not read first document"));

    await expect(
      loadedDocument
    ).resolves.toBeNull();

    expectEmptyZeroTabState(state);
  });

  it("does not let an old Project activation overwrite a newer Project activation", async () => {
    const lifetime = new ProjectActivationLifetime();
    const projectBToken = lifetime.startProjectContextSwitch();
    const projectBLoad = deferred<ReturnType<typeof createProjectDocument>>();
    let state = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );

    const projectBDocument = loadFirstProjectDocumentIfCurrent(
      lifetime,
      projectBToken,
      () => projectBLoad.promise
    ).then((document) => {
      if (document) {
        state = applyLoadedFirstDocument(state, document, {
          rootPath: "C:\\ProjectB"
        });
      }
    });

    const projectCToken = lifetime.startProjectContextSwitch();
    const projectCLoad = deferred<ReturnType<typeof createProjectDocument>>();
    state = resetOpenDocumentsForProjectContextSwitch(state);
    const projectCDocument = loadFirstProjectDocumentIfCurrent(
      lifetime,
      projectCToken,
      () => projectCLoad.promise
    ).then((document) => {
      if (document) {
        state = applyLoadedFirstDocument(state, document, newProjectContext);
      }
    });

    projectBLoad.resolve(
      createProjectDocument(
        {
          relativePath: "project-b.md",
          name: "project-b.md"
        },
        "project B"
      )
    );
    await projectBDocument;
    expectEmptyZeroTabState(state);

    projectCLoad.resolve(
      createProjectDocument(newDocument, "new content"),
    );
    await projectCDocument;

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createProjectDocumentEditorId(newDocument.relativePath, newProjectContext)
      )
    ).toBe(true);
  });

  it("does not let delayed first document loading overwrite explicit Editor activation", async () => {
    const lifetime = new ProjectActivationLifetime();
    const token = lifetime.startProjectContextSwitch();
    const pendingLoad = deferred<ReturnType<typeof createProjectDocument>>();
    let state = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );
    const loadedDocument = loadFirstProjectDocumentIfCurrent(
      lifetime,
      token,
      () => pendingLoad.promise
    ).then((document) => {
      if (document) {
        state = applyLoadedFirstDocument(state, document, newProjectContext);
      }
    });

    lifetime.markExplicitEditorActivation();
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(oldGlossaryEntry),
      newProjectContext
    );

    pendingLoad.resolve(createProjectDocument(newDocument, "new content"));
    await loadedDocument;

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createGlossaryEntryEditorId(oldGlossaryEntry.id, newProjectContext)
      )
    ).toBe(true);
  });

  it("activates the new Project first document after a successful load", async () => {
    const lifetime = new ProjectActivationLifetime();
    const token = lifetime.startProjectContextSwitch();
    const pendingLoad = deferred<ReturnType<typeof createProjectDocument>>();
    let state = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );
    const loadedDocument = loadFirstProjectDocumentIfCurrent(
      lifetime,
      token,
      () => pendingLoad.promise
    ).then((document) => {
      if (document) {
        state = applyLoadedFirstDocument(state, document, newProjectContext);
      }
    });

    pendingLoad.resolve(createProjectDocument(newDocument, "new content"));
    await loadedDocument;

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createProjectDocumentEditorId(newDocument.relativePath, newProjectContext)
      )
    ).toBe(true);
    expect(state.documents[0].editor.kind).toBe("markdown");
    expect(
      state.documents[0].editor.kind === "markdown" &&
        state.documents[0].editor.document.relativePath
    ).toBe(newDocument.relativePath);
    expect(
      state.documents.some((document) =>
        editorIdEquals(
          document.id,
          createGlossaryEntryEditorId(oldGlossaryEntry.id, oldProjectContext)
        )
      )
    ).toBe(false);
  });

  it("keeps the reset state when a Project has no first document to load", () => {
    const state = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );

    expectEmptyZeroTabState(state);
  });

  it("treats a captured Project activation generation as stale after a Project switch", () => {
    const lifetime = new ProjectActivationLifetime();
    const generation = lifetime.captureProjectActivationGeneration();

    expect(lifetime.isProjectActivationCurrent(generation)).toBe(true);

    lifetime.startProjectContextSwitch();

    expect(lifetime.isProjectActivationCurrent(generation)).toBe(false);
  });

  it("does not open an Editor from a Glossary Entry create started in the old Project after a switch to a new Project", async () => {
    const lifetime = new ProjectActivationLifetime();
    const createGeneration = lifetime.captureProjectActivationGeneration();
    const pendingCreate = deferred<GlossaryEntry>();
    let openedEditor = false;

    const staleCreateCompletion = (async () => {
      const entry = await pendingCreate.promise;

      if (!lifetime.isProjectActivationCurrent(createGeneration)) {
        return;
      }

      lifetime.markExplicitEditorActivation();
      openedEditor = true;
    })();

    lifetime.startProjectContextSwitch();
    pendingCreate.resolve(oldGlossaryEntry);
    await staleCreateCompletion;

    expect(openedEditor).toBe(false);
  });

  it("does not let a stale Glossary Entry create invalidate the new Project's first-document activation", async () => {
    const lifetime = new ProjectActivationLifetime();
    const createGeneration = lifetime.captureProjectActivationGeneration();
    const pendingCreate = deferred<GlossaryEntry>();

    const projectBToken = lifetime.startProjectContextSwitch();
    const pendingFirstDocument = deferred<
      ReturnType<typeof createProjectDocument>
    >();
    let state = resetOpenDocumentsForProjectContextSwitch(
      oldProjectScopedOpenDocuments()
    );
    const firstDocumentLoad = loadFirstProjectDocumentIfCurrent(
      lifetime,
      projectBToken,
      () => pendingFirstDocument.promise
    ).then((document) => {
      if (document) {
        state = applyLoadedFirstDocument(state, document, newProjectContext);
      }
    });

    const staleCreateCompletion = (async () => {
      const entry = await pendingCreate.promise;

      if (!lifetime.isProjectActivationCurrent(createGeneration)) {
        return;
      }

      lifetime.markExplicitEditorActivation();
    })();

    pendingCreate.resolve(oldGlossaryEntry);
    await staleCreateCompletion;

    pendingFirstDocument.resolve(
      createProjectDocument(newDocument, "new content")
    );
    await firstDocumentLoad;

    expect(state.documents).toHaveLength(1);
    expect(
      editorIdEquals(
        state.activeDocumentId,
        createProjectDocumentEditorId(
          newDocument.relativePath,
          newProjectContext
        )
      )
    ).toBe(true);
  });

  it("does not apply a Glossary Entry save's status or Sidebar refresh from the old Project after a switch to a new Project", async () => {
    const lifetime = new ProjectActivationLifetime();
    const saveGeneration = lifetime.captureProjectActivationGeneration();
    const pendingSave = deferred<GlossaryEntry>();
    let didRefreshSidebar = false;
    let appliedStatusEntryId: string | null = null;

    const staleSaveCompletion = (async () => {
      const savedEntry = await pendingSave.promise;

      if (!lifetime.isProjectActivationCurrent(saveGeneration)) {
        return;
      }

      didRefreshSidebar = true;
      appliedStatusEntryId = savedEntry.id;
    })();

    lifetime.startProjectContextSwitch();
    pendingSave.resolve(oldGlossaryEntry);
    await staleSaveCompletion;

    expect(didRefreshSidebar).toBe(false);
    expect(appliedStatusEntryId).toBeNull();
  });
});
