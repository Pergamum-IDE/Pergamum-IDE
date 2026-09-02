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
  activeOpenDocument,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  openOrActivateDocument,
  openOrActivateEditor,
  updateActiveOpenDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  buildMarkdownOutlineDocument,
  collectMarkdownHeadingSearchCandidates,
  emptyMarkdownOutlineIndex,
  recomputeMarkdownOutlineDocument,
  syncMarkdownOutlineIndex
} from "../../src/renderer/markdownOutlineIndex";
import { serializeEditorId, type ActiveProjectContext } from "../../src/shared/editorId";
import type { GlossaryEntry } from "../../src/shared/glossary";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "d",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "王都",
      matchFlags: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  tags: []
};

function stateWithProjectDoc(content = "# Alpha\n## Beta"): OpenDocumentsState {
  return openOrActivateDocument(
    createInitialOpenDocumentsState(),
    createProjectDocument({ relativePath: "a.md", name: "a.md" }, content),
    projectContext
  );
}

describe("buildMarkdownOutlineDocument (#352)", () => {
  it("indexes a project document with project-relative displayPath and serializeEditorId key", () => {
    const state = stateWithProjectDoc();
    const doc = buildMarkdownOutlineDocument(state.documents[0]);
    expect(doc).not.toBeNull();
    expect(doc!.documentKind).toBe("project");
    expect(doc!.displayPath).toBe("a.md");
    expect(doc!.editorKey).toBe(serializeEditorId(state.documents[0].id));
    expect(doc!.outline.flat.map((h) => h.text)).toEqual(["Alpha", "Beta"]);
  });

  it("indexes an external file document with an absolute displayPath", () => {
    const state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createFileDocument({ path: "C:\\Outside\\notes.md", content: "# Ext" }),
      projectContext
    );
    const doc = buildMarkdownOutlineDocument(state.documents[0]);
    expect(doc!.documentKind).toBe("external");
    expect(doc!.displayPath).toBe("C:\\Outside\\notes.md");
  });

  it("indexes an untitled document with a null displayPath", () => {
    const state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createMarkdownCurrentEditor(createUntitledDocument()),
      projectContext
    );
    const doc = buildMarkdownOutlineDocument(state.documents[0]);
    expect(doc!.documentKind).toBe("untitled");
    expect(doc!.displayPath).toBeNull();
  });

  it("returns null for a glossary editor", () => {
    const state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    expect(buildMarkdownOutlineDocument(state.documents[0])).toBeNull();
  });
});

describe("syncMarkdownOutlineIndex (#352)", () => {
  it("adds newly opened Markdown docs and skips glossary editors", () => {
    let state = stateWithProjectDoc();
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    expect(index.documents.size).toBe(1);
  });

  it("carries an already-indexed doc over verbatim (no re-parse) even when its text moved", () => {
    let state = stateWithProjectDoc("# Alpha");
    const first = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    const key = serializeEditorId(state.documents[0].id);
    const before = first.documents.get(key)!;

    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "# Alpha\n## Gamma",
        document.lineEndingBreaks
      )
    );
    const second = syncMarkdownOutlineIndex(state, first);
    // same object reference — structural sync does not re-parse
    expect(second).toBe(first);
    expect(second.documents.get(key)).toBe(before);
  });

  it("drops the record for a closed document", () => {
    let state = stateWithProjectDoc();
    state = openOrActivateDocument(
      state,
      createProjectDocument({ relativePath: "b.md", name: "b.md" }, "# B"),
      projectContext
    );
    const withBoth = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    expect(withBoth.documents.size).toBe(2);

    const closed = closeOpenEditor(state, state.documents[1].id);
    const afterClose = syncMarkdownOutlineIndex(closed, withBoth);
    expect(afterClose.documents.size).toBe(1);
  });
});

describe("recomputeMarkdownOutlineDocument (#352)", () => {
  it("re-parses exactly one document, leaving the others untouched", () => {
    let state = stateWithProjectDoc("# Alpha");
    state = openOrActivateDocument(
      state,
      createProjectDocument({ relativePath: "b.md", name: "b.md" }, "# B"),
      projectContext
    );
    let index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    const keyA = serializeEditorId(state.documents[0].id);
    const keyB = serializeEditorId(state.documents[1].id);
    const bBefore = index.documents.get(keyB)!;

    // edit document A (it is not the active one now, but recompute by key)
    state = {
      ...state,
      documents: state.documents.map((openDocument, i) =>
        i === 0
          ? {
              ...openDocument,
              editor: createMarkdownCurrentEditor(
                updateCurrentDocumentContent(
                  createProjectDocument(
                    { relativePath: "a.md", name: "a.md" },
                    "# Alpha\n## Added"
                  ),
                  "# Alpha\n## Added",
                  createProjectDocument(
                    { relativePath: "a.md", name: "a.md" },
                    ""
                  ).lineEndingBreaks
                )
              )
            }
          : openDocument
      )
    };

    index = recomputeMarkdownOutlineDocument(state, index, keyA);
    expect(index.documents.get(keyA)!.outline.flat.map((h) => h.text)).toEqual([
      "Alpha",
      "Added"
    ]);
    // B untouched (same reference)
    expect(index.documents.get(keyB)).toBe(bBefore);
  });

  it("removes the key when the document is no longer open", () => {
    const state = stateWithProjectDoc();
    let index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    const key = serializeEditorId(state.documents[0].id);
    expect(index.documents.has(key)).toBe(true);

    const closed = closeOpenEditor(state, state.documents[0].id);
    index = recomputeMarkdownOutlineDocument(closed, index, key);
    expect(index.documents.has(key)).toBe(false);
  });

  it("is a no-op (same reference) when the target content is unchanged", () => {
    const state = stateWithProjectDoc();
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    const key = serializeEditorId(state.documents[0].id);
    expect(recomputeMarkdownOutlineDocument(state, index, key)).toBe(index);
  });

  it("uses the live active-document content", () => {
    let state = stateWithProjectDoc("# Alpha");
    let index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);
    const key = serializeEditorId(activeOpenDocument(state)!.id);

    state = updateActiveOpenDocument(state, (document) =>
      updateCurrentDocumentContent(
        document,
        "# Alpha\n### Deep",
        document.lineEndingBreaks
      )
    );
    index = recomputeMarkdownOutlineDocument(state, index, key);
    expect(index.documents.get(key)!.outline.flat.map((h) => h.text)).toEqual([
      "Alpha",
      "Deep"
    ]);
  });
});

describe("collectMarkdownHeadingSearchCandidates (#141)", () => {
  function twoProjectDocState(): OpenDocumentsState {
    let state = openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createProjectDocument(
        { relativePath: "a.md", name: "a.md" },
        "# A1\n\nbody of a1\n## A2"
      ),
      projectContext
    );
    // Opening b.md makes it the ACTIVE tab; tab-bar order stays [a, b].
    state = openOrActivateDocument(
      state,
      createProjectDocument(
        { relativePath: "b.md", name: "b.md" },
        "# B1\n\nbody of b1"
      ),
      projectContext
    );
    return state;
  }

  it("lists the active document's headings first, then the other tabs in tab-bar order, each in document order", () => {
    const state = twoProjectDocState();
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);

    const candidates = collectMarkdownHeadingSearchCandidates(index, state);

    expect(candidates.map((candidate) => candidate.text)).toEqual([
      "B1",
      "A1",
      "A2"
    ]);
  });

  it("keeps tab-bar order when the active tab is already first", () => {
    let state = twoProjectDocState();
    // Re-activate a.md (documents[0]) without changing tab order.
    state = { ...state, activeDocumentId: state.documents[0].id };
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);

    expect(
      collectMarkdownHeadingSearchCandidates(index, state).map((c) => c.text)
    ).toEqual(["A1", "A2", "B1"]);
  });

  it("carries the fields the Command Palette needs, incl. a bounded body preview and a stable id", () => {
    const state = twoProjectDocState();
    state.activeDocumentId = state.documents[0].id;
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);

    const [a1, a2, b1] = collectMarkdownHeadingSearchCandidates(index, state);

    expect(a1).toMatchObject({
      text: "A1",
      level: 1,
      lineNumber: 0,
      documentKind: "project",
      documentPath: "a.md",
      bodyPreview: "body of a1"
    });
    // A1's preview stops at A2 — never leaks the `## A2` line.
    expect(a1.bodyPreview).not.toContain("A2");
    // A2 has no body line before end of document.
    expect(a2.bodyPreview).toBeNull();
    expect(b1.bodyPreview).toBe("body of b1");
    // id = `${editorKey}::${headingId}` and is unique per heading.
    expect(a1.id).toBe(`${a1.editorKey}::${a1.headingId}`);
    expect(new Set([a1.id, a2.id, b1.id]).size).toBe(3);
  });

  it("returns [] when there are no open Markdown documents", () => {
    expect(
      collectMarkdownHeadingSearchCandidates(
        emptyMarkdownOutlineIndex,
        createInitialOpenDocumentsState()
      )
    ).toEqual([]);
  });

  it("ignores a non-Markdown (glossary) editor — it is never in the index", () => {
    let state = twoProjectDocState();
    state = openOrActivateEditor(
      state,
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    const index = syncMarkdownOutlineIndex(state, emptyMarkdownOutlineIndex);

    const candidates = collectMarkdownHeadingSearchCandidates(index, state);

    expect(candidates.map((candidate) => candidate.text).sort()).toEqual([
      "A1",
      "A2",
      "B1"
    ]);
  });
});
