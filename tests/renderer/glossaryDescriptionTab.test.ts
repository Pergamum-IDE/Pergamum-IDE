import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  createGlossaryDescriptionEditorId,
  createProjectDocumentEditorId,
  deserializeEditorId,
  editorIdEquals,
  isProjectScopedEditorId,
  serializeEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  currentEditorProjectRelativePath,
  currentEditorTitle,
  editorIdForCurrentEditor,
  glossaryDescriptionEditorTitle,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  updateGlossaryDescriptionEditorText
} from "../../src/renderer/currentEditor";
import {
  activeProjectDocumentRelativePath,
  closeOpenEditor,
  createInitialOpenDocumentsState,
  documentTabs,
  getDirtyWorkingCopies,
  openOrActivateDocument,
  openOrActivateEditor,
  removeProjectScopedOpenEditors,
  updateActiveOpenEditor,
  updateOpenDocument
} from "../../src/renderer/openDocuments";
import {
  describeTabContextMenu,
  resolveTabCopyText
} from "../../src/renderer/documentTabContextMenu";
import { buildSessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import { resolveCurrentEditor } from "../../src/renderer/resolveCurrentEditor";

const projectContext: ActiveProjectContext = { rootPath: "C:/novel" };
const entryIdA = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b";
const entryIdB = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0c";

function glossaryEntry(id: string, representative: string): GlossaryEntry {
  return {
    id,
    description: "説明",
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
        entryId: id,
        sortOrder: 0,
        value: representative,
        matchFlags: 0,
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z"
  };
}

describe("glossaryDescription EditorId (#573 Slice 1)", () => {
  it("serializes and deserializes canonically by entryId", () => {
    const editorId = createGlossaryDescriptionEditorId(entryIdA);
    const serialized = serializeEditorId(editorId);

    expect(serialized).toBe(
      JSON.stringify({ kind: "glossaryDescription", entryId: entryIdA })
    );
    expect(
      editorIdEquals(deserializeEditorId(serialized, projectContext), editorId)
    ).toBe(true);
  });

  it("rejects a non-UUIDv7 entryId and non-canonical keys", () => {
    expect(() => createGlossaryDescriptionEditorId("not-an-id")).toThrow();
    expect(() =>
      deserializeEditorId(
        JSON.stringify({ entryId: entryIdA, kind: "glossaryDescription" }),
        projectContext
      )
    ).toThrow();
  });

  it("compares by entryId and never equals a document id", () => {
    expect(
      editorIdEquals(
        createGlossaryDescriptionEditorId(entryIdA),
        createGlossaryDescriptionEditorId(entryIdA)
      )
    ).toBe(true);
    expect(
      editorIdEquals(
        createGlossaryDescriptionEditorId(entryIdA),
        createGlossaryDescriptionEditorId(entryIdB)
      )
    ).toBe(false);
    expect(
      editorIdEquals(
        createGlossaryDescriptionEditorId(entryIdA),
        createProjectDocumentEditorId("a.md", projectContext)
      )
    ).toBe(false);
  });

  it("is project-scoped", () => {
    expect(
      isProjectScopedEditorId(createGlossaryDescriptionEditorId(entryIdA))
    ).toBe(true);
  });
});

describe("glossaryDescription CurrentEditor (#573 Slice 1)", () => {
  it("titles the tab 語彙: <代表表記>", () => {
    const editor = createGlossaryDescriptionCurrentEditor(
      glossaryEntry(entryIdA, "アリス")
    );

    expect(currentEditorTitle(editor)).toBe("語彙: アリス");
  });

  it("falls back to 語彙 when the representative surface is blank", () => {
    expect(glossaryDescriptionEditorTitle("   ")).toBe("語彙");
  });

  it("is never a Markdown document, never dirty, has no project path", () => {
    const editor = createGlossaryDescriptionCurrentEditor(
      glossaryEntry(entryIdA, "アリス")
    );

    expect(markdownDocumentForEditor(editor)).toBeNull();
    expect(isCurrentEditorDirty(editor)).toBe(false);
    expect(currentEditorProjectRelativePath(editor)).toBeNull();
    expect(
      editorIdEquals(
        editorIdForCurrentEditor(editor, projectContext)!,
        createGlossaryDescriptionEditorId(entryIdA)
      )
    ).toBe(true);
  });
});

describe("glossaryDescription tabs in OpenDocuments (#573 Slice 1)", () => {
  function openGlossary(
    state = createInitialOpenDocumentsState(),
    id = entryIdA,
    representative = "アリス"
  ) {
    return openOrActivateEditor(
      state,
      createGlossaryDescriptionCurrentEditor(glossaryEntry(id, representative)),
      projectContext
    );
  }

  it("opens one tab per entry and focuses an existing tab on re-open", () => {
    const opened = openGlossary();
    const withDocument = openOrActivateDocument(
      opened,
      createProjectDocument(
        { relativePath: "chapter.md", name: "chapter.md" },
        "本文"
      ),
      projectContext
    );
    const reopened = openGlossary(withDocument);

    expect(reopened.documents).toHaveLength(2);
    expect(
      editorIdEquals(
        reopened.activeDocumentId!,
        createGlossaryDescriptionEditorId(entryIdA)
      )
    ).toBe(true);

    const withB = openGlossary(reopened, entryIdB, "ボブ");

    expect(documentTabs(withB).map((tab) => tab.title)).toEqual([
      "語彙: アリス",
      "chapter.md",
      "語彙: ボブ"
    ]);
  });

  it("shows a clean, non-external tab", () => {
    const [tab] = documentTabs(openGlossary());

    expect(tab).toMatchObject({
      title: "語彙: アリス",
      isDirty: false,
      isExternalMarkdownFile: false
    });
  });

  it("is excluded from file-backed features", () => {
    const state = openGlossary();

    expect(activeProjectDocumentRelativePath(state)).toBeNull();
    expect(getDirtyWorkingCopies(state)).toEqual([]);
    expect(
      updateOpenDocument(state, state.activeDocumentId!, () => {
        throw new Error("must not be called for a glossary tab");
      })
    ).toEqual(state);
    // #573 Slice 8: recorded in the Session by entry id only.
    expect(
      buildSessionSnapshotInputs("session", null, state, true).editors.map(
        ({ editor }) => editor
      )
    ).toEqual([
      {
        kind: "glossaryDescription",
        order: 0,
        entryId: entryIdA,
        viewState: null
      }
    ]);
  });

  it("closes like any other tab and with the project", () => {
    const state = openGlossary();

    expect(closeOpenEditor(state, state.activeDocumentId!).documents).toEqual(
      []
    );
    expect(removeProjectScopedOpenEditors(state).documents).toEqual([]);
  });

  it("resolves only while already open", async () => {
    const state = openGlossary();
    const context = {
      openDocumentsState: state,
      project: null,
      activeProjectContext: projectContext,
      readProjectDocument: async () => {
        throw new Error("unused");
      }
    };

    await expect(
      resolveCurrentEditor(createGlossaryDescriptionEditorId(entryIdA), context)
    ).resolves.toMatchObject({ kind: "resolved" });
    await expect(
      resolveCurrentEditor(createGlossaryDescriptionEditorId(entryIdB), context)
    ).resolves.toEqual({ kind: "notFound" });
  });

  it("disables file-only tab context menu items and copies nothing", () => {
    const tabs = documentTabs(openGlossary());
    const menu = describeTabContextMenu(tabs[0], {
      allTabs: tabs,
      projectAccess: null
    });
    const enabledById = Object.fromEntries(
      menu.items.map((item) => [item.id, item.enabled])
    );

    expect(enabledById).toMatchObject({
      close: true,
      selectInFileExplorer: false,
      renameFile: false,
      saveAs: false,
      copyAbsolutePath: false,
      copyRelativePath: false,
      copyFileName: false
    });
    expect(resolveTabCopyText(tabs[0], { projectRootPath: "C:/novel" })).toEqual(
      { absolute: null, relative: null, fileName: null }
    );
  });

  it("keeps Markdown editors as Markdown documents", () => {
    const editor = createMarkdownCurrentEditor(
      createProjectDocument(
        { relativePath: "chapter.md", name: "chapter.md" },
        "本文"
      )
    );

    expect(markdownDocumentForEditor(editor)).toMatchObject({
      kind: "project",
      relativePath: "chapter.md"
    });
  });
});

describe("glossaryDescription in-memory draft (#573 Slice 3)", () => {
  it("seeds the tab's draft from the entry's current Description", () => {
    const entry = { ...glossaryEntry(entryIdA, "アリス"), description: "一行目\r\n二行目" };
    const editor = createGlossaryDescriptionCurrentEditor(entry);

    expect(editor.draft.entry).toBe(entry);
    expect(editor.draft.description).toBe("一行目\r\n二行目");
    expect(currentEditorTitle(editor)).toBe("語彙: アリス");
  });

  it("updates only the draft Description, becomes dirty, and never becomes a document", () => {
    const editor = createGlossaryDescriptionCurrentEditor(
      glossaryEntry(entryIdA, "アリス")
    );
    const breaks = createGlossaryDescriptionCurrentEditor({
      ...glossaryEntry(entryIdA, "アリス"),
      description: "a\nb"
    }).descriptionLineEndingBreaks;
    const updated = updateGlossaryDescriptionEditorText(editor, "新しい説明", breaks);

    expect(updated.kind).toBe("glossaryDescription");
    if (updated.kind !== "glossaryDescription") {
      return;
    }
    expect(updated.draft.description).toBe("新しい説明");
    expect(updated.draft.entry.description).toBe("説明");
    expect(updated.descriptionLineEndingBreaks).toBe(breaks);
    // #573 Slice 4: dirty against the draft's saved baseline.
    expect(isCurrentEditorDirty(updated)).toBe(true);
    expect(markdownDocumentForEditor(updated)).toBeNull();
  });

  it("leaves a Markdown editor untouched", () => {
    const editor = createMarkdownCurrentEditor(
      createProjectDocument({ relativePath: "a.md", name: "a.md" }, "本文")
    );
    const breaks = markdownDocumentForEditor(editor)!.lineEndingBreaks;

    expect(updateGlossaryDescriptionEditorText(editor, "x", breaks)).toBe(editor);
  });

  it("updates the active glossary tab's draft inside OpenDocuments", () => {
    const glossaryEditor = createGlossaryDescriptionCurrentEditor(
      glossaryEntry(entryIdA, "アリス")
    );
    const opened = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      glossaryEditor,
      projectContext
    );
    const next = updateActiveOpenEditor(opened, (editor) =>
      updateGlossaryDescriptionEditorText(
        editor,
        "編集後",
        glossaryEditor.descriptionLineEndingBreaks
      )
    );
    const nextEditor = next.documents[0].editor;

    expect(
      nextEditor.kind === "glossaryDescription" && nextEditor.draft.description
    ).toBe("編集後");
    expect(getDirtyWorkingCopies(next)).toEqual([
      {
        editorId: createGlossaryDescriptionEditorId(entryIdA),
        kind: "glossaryDescription",
        scope: "glossary",
        title: "語彙: アリス"
      }
    ]);
    // #573 Slice 8: the Session keeps only the entry id, never the draft.
    expect(
      buildSessionSnapshotInputs("session", null, next, true).editors.map(
        ({ editor }) => editor
      )
    ).toEqual([
      {
        kind: "glossaryDescription",
        order: 0,
        entryId: entryIdA,
        viewState: null
      }
    ]);
  });
});

describe("App glossary Description wiring (#573 Slice 3)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("routes editor text changes of a glossary tab into its in-memory draft", () => {
    const block = appSource.slice(
      appSource.indexOf("function setActiveDocumentContent"),
      appSource.indexOf("function openGlossaryCreateEntryPaneFromSidebar")
    );

    expect(block).toContain(
      'activeCurrentEditor(state)?.kind === "glossaryDescription"'
    );
    expect(block).toContain("updateGlossaryDescriptionEditorText(");
    expect(block).not.toContain("window.pergamum.glossary");
  });

  // #573 Slice 6 enabled image paste / insertion for glossary tabs (project-
  // root links); that wiring is covered by glossaryDescriptionImage.test.ts.
  it("still limits file-backed image insertion to project documents", () => {
    expect(appSource).toContain(
      'const canInsertImage =\n    canUseMarkdownToolbarCommands &&\n    (activeMarkdownDocument?.kind === "project" ||\n      isGlossaryDescriptionEditorActive);'
    );
  });
});
