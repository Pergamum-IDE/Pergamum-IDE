import { describe, expect, it } from "vitest";
import {
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import {
  documentRelativeIndexInOrder,
  documentWorkspaceTabId,
  orderedWorkspaceTabs,
  reorderWorkspaceTabOrder,
  specialWorkspaceTabId,
  syncWorkspaceTabOrder,
  workspaceTabIdEquals,
  workspaceTabIdForTab,
  workspaceTabKey,
  workspaceTabs,
  type SpecialWorkspaceTab,
  type WorkspaceTabId
} from "../../src/renderer/workspaceTabs";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };
const documentEditorId = createProjectDocumentEditorId(
  "chapter-01.md",
  projectContext
);
const settingsTab: SpecialWorkspaceTab = {
  kind: "special",
  id: "settings",
  title: "Settings"
};
const debugLogTab: SpecialWorkspaceTab = {
  kind: "special",
  id: "debugLog",
  title: "Debug Log"
};

function docTab(id: EditorId, title: string): DocumentTab {
  return { id, title, isDirty: false, isExternalMarkdownFile: false };
}

describe("workspace tabs (#181)", () => {
  it("keeps Settings as a named special tab identity outside EditorId", () => {
    expect(specialWorkspaceTabId("settings")).toEqual({
      kind: "special",
      id: "settings"
    });
    expect(documentWorkspaceTabId(documentEditorId)).toEqual({
      kind: "document",
      editorId: documentEditorId
    });
  });

  it("does not consider Settings equal to a document workspace tab", () => {
    expect(
      workspaceTabIdEquals(
        specialWorkspaceTabId("settings"),
        documentWorkspaceTabId(documentEditorId)
      )
    ).toBe(false);
  });

  it("appends special tabs after document tabs without duplicating document state", () => {
    expect(
      workspaceTabs(
        [
          {
            id: documentEditorId,
            title: "chapter-01.md",
            isDirty: false,
            isExternalMarkdownFile: false
          }
        ],
        [settingsTab]
      )
    ).toEqual([
      {
        kind: "document",
        id: documentEditorId,
        title: "chapter-01.md",
        isDirty: false,
        isExternalMarkdownFile: false
      },
      settingsTab
    ]);
  });

  it("uses distinct stable keys for document and special tabs", () => {
    expect(workspaceTabKey(documentWorkspaceTabId(documentEditorId))).toContain(
      "document:"
    );
    expect(workspaceTabKey(specialWorkspaceTabId("settings"))).toBe(
      "special:settings"
    );
  });
});

describe("workspaceTabIdForTab (#398)", () => {
  it("recovers the stable id from a rendered document tab", () => {
    const tab = { ...docTab(documentEditorId, "chapter-01.md"), kind: "document" as const };
    expect(workspaceTabIdForTab(tab)).toEqual(
      documentWorkspaceTabId(documentEditorId)
    );
  });

  it("recovers the stable id from a rendered special tab", () => {
    expect(workspaceTabIdForTab(settingsTab)).toEqual(
      specialWorkspaceTabId("settings")
    );
  });
});

describe("orderedWorkspaceTabs (#398)", () => {
  const aId = createProjectDocumentEditorId("a.md", projectContext);
  const bId = createProjectDocumentEditorId("b.md", projectContext);
  const a = docTab(aId, "a.md");
  const b = docTab(bId, "b.md");

  it("A/regression: with no order, behaves exactly like workspaceTabs() (document -> document keeps its existing order)", () => {
    expect(orderedWorkspaceTabs([a, b], [], [])).toEqual(
      workspaceTabs([a, b], [])
    );
  });

  it("B: renders special tabs in whatever order they appear in `order`", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("debugLog"),
      specialWorkspaceTabId("settings")
    ];
    const result = orderedWorkspaceTabs([], [settingsTab, debugLogTab], order);
    expect(result.map((tab) => tab.kind === "special" && tab.id)).toEqual([
      "debugLog",
      "settings"
    ]);
  });

  it("C/D/E: freely interleaves document and special tabs in arbitrary order (both boundary directions at once)", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      documentWorkspaceTabId(aId),
      specialWorkspaceTabId("debugLog"),
      documentWorkspaceTabId(bId)
    ];
    const result = orderedWorkspaceTabs([a, b], [settingsTab, debugLogTab], order);
    expect(
      result.map((tab) => (tab.kind === "document" ? tab.title : tab.id))
    ).toEqual(["settings", "a.md", "debugLog", "b.md"]);
  });

  it("J: an id for a tab that has since closed is silently dropped — no residue", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(bId) // b has "closed" — not passed below
    ];
    const result = orderedWorkspaceTabs([a], [settingsTab], order);
    expect(
      result.map((tab) => (tab.kind === "document" ? tab.title : tab.id))
    ).toEqual(["settings", "a.md"]);
  });

  it("appends a tab that opened but is not yet in `order`, at the end", () => {
    const order: WorkspaceTabId[] = [documentWorkspaceTabId(aId)];
    const result = orderedWorkspaceTabs([a, b], [settingsTab], order);
    expect(
      result.map((tab) => (tab.kind === "document" ? tab.title : tab.id))
    ).toEqual(["a.md", "b.md", "settings"]);
  });
});

describe("syncWorkspaceTabOrder (#398)", () => {
  const aId = createProjectDocumentEditorId("a.md", projectContext);
  const bId = createProjectDocumentEditorId("b.md", projectContext);
  const a = docTab(aId, "a.md");
  const b = docTab(bId, "b.md");

  it("returns the SAME reference when nothing opened or closed (no spurious re-render trigger)", () => {
    const order: WorkspaceTabId[] = [
      documentWorkspaceTabId(aId),
      specialWorkspaceTabId("settings")
    ];
    const result = syncWorkspaceTabOrder(order, [a], [settingsTab]);
    expect(result).toBe(order);
  });

  it("J: drops a closed tab's id without leaving a residue", () => {
    const order: WorkspaceTabId[] = [
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(bId),
      specialWorkspaceTabId("settings")
    ];
    // b closed, settings closed.
    const result = syncWorkspaceTabOrder(order, [a], []);
    expect(result).toEqual([documentWorkspaceTabId(aId)]);
  });

  it("appends a newly-opened tab's id at the end, keeping the existing relative order of the rest", () => {
    const order: WorkspaceTabId[] = [documentWorkspaceTabId(bId)];
    // a opened after b, and Settings opened too.
    const result = syncWorkspaceTabOrder(order, [b, a], [settingsTab]);
    expect(result).toEqual([
      documentWorkspaceTabId(bId),
      documentWorkspaceTabId(aId),
      specialWorkspaceTabId("settings")
    ]);
  });

  it("handles simultaneous close-and-open in one sync (project switch shape)", () => {
    const order: WorkspaceTabId[] = [
      documentWorkspaceTabId(aId),
      specialWorkspaceTabId("glossaryTagManager")
    ];
    // Project switch: a and the Glossary Tag Manager closed, b opened.
    const result = syncWorkspaceTabOrder(order, [b], []);
    expect(result).toEqual([documentWorkspaceTabId(bId)]);
  });
});

describe("reorderWorkspaceTabOrder (#398)", () => {
  const aId = createProjectDocumentEditorId("a.md", projectContext);
  const bId = createProjectDocumentEditorId("b.md", projectContext);
  const cId = createProjectDocumentEditorId("c.md", projectContext);

  function order3(): WorkspaceTabId[] {
    return [
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(bId),
      documentWorkspaceTabId(cId)
    ];
  }

  it("A/regression: document -> document reorder, e.g. [A,B,C] -> [C,A,B]", () => {
    const result = reorderWorkspaceTabOrder(
      order3(),
      documentWorkspaceTabId(cId),
      0
    );
    expect(result).toEqual([
      documentWorkspaceTabId(cId),
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(bId)
    ]);
  });

  it("B: special -> special reorder", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      specialWorkspaceTabId("debugLog")
    ];
    const result = reorderWorkspaceTabOrder(
      order,
      specialWorkspaceTabId("settings"),
      1
    );
    expect(result).toEqual([
      specialWorkspaceTabId("debugLog"),
      specialWorkspaceTabId("settings")
    ]);
  });

  it("returns the SAME reference for a no-op move (already at targetIndex)", () => {
    const order = order3();
    const result = reorderWorkspaceTabOrder(
      order,
      documentWorkspaceTabId(aId),
      0
    );
    expect(result).toBe(order);
  });

  it("returns the SAME reference when the moved id is not present", () => {
    const order = order3();
    const result = reorderWorkspaceTabOrder(
      order,
      documentWorkspaceTabId(
        createProjectDocumentEditorId("missing.md", projectContext)
      ),
      1
    );
    expect(result).toBe(order);
  });

  it("clamps an out-of-range targetIndex", () => {
    const result = reorderWorkspaceTabOrder(
      order3(),
      documentWorkspaceTabId(aId),
      999
    );
    expect(result).toEqual([
      documentWorkspaceTabId(bId),
      documentWorkspaceTabId(cId),
      documentWorkspaceTabId(aId)
    ]);
  });

  it("I: preserves a Glossary Entry Editor document tab's identity through a reorder (never swapped or dropped)", () => {
    const entryEditorId = createGlossaryEntryEditorId(
      "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      projectContext
    );
    const order: WorkspaceTabId[] = [
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(entryEditorId),
      specialWorkspaceTabId("glossaryEntryManager")
    ];
    const result = reorderWorkspaceTabOrder(
      order,
      specialWorkspaceTabId("glossaryEntryManager"),
      0
    );
    expect(result).toEqual([
      specialWorkspaceTabId("glossaryEntryManager"),
      documentWorkspaceTabId(aId),
      documentWorkspaceTabId(entryEditorId)
    ]);
    // The moved-past glossary entry tab still carries the SAME entryId.
    const preserved = result.find(
      (id) => id.kind === "document" && id.editorId.kind === "glossaryEntry"
    );
    expect(
      preserved?.kind === "document" &&
        preserved.editorId.kind === "glossaryEntry" &&
        preserved.editorId.entryId
    ).toBe("018f4b8c-7a2b-7c3d-8e4f-123456789abc");
  });
});

describe("documentRelativeIndexInOrder (#398 — keeps documents' own array order, and therefore Session order, in sync with a mixed-order reorder)", () => {
  const aId = createProjectDocumentEditorId("a.md", projectContext);
  const bId = createProjectDocumentEditorId("b.md", projectContext);

  it("returns null for a special tab (nothing to sync)", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      documentWorkspaceTabId(aId)
    ];
    expect(
      documentRelativeIndexInOrder(order, specialWorkspaceTabId("settings"))
    ).toBeNull();
  });

  it("returns null when the moved id is absent from order", () => {
    expect(
      documentRelativeIndexInOrder([], documentWorkspaceTabId(aId))
    ).toBeNull();
  });

  it("counts only document tabs, ignoring interleaved special tabs", () => {
    const order: WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      documentWorkspaceTabId(bId),
      specialWorkspaceTabId("debugLog"),
      documentWorkspaceTabId(aId)
    ];
    // a.md is the SECOND document tab, even though it's the fourth entry
    // overall — special tabs never occupy a "document slot".
    expect(documentRelativeIndexInOrder(order, documentWorkspaceTabId(aId))).toBe(
      1
    );
    expect(documentRelativeIndexInOrder(order, documentWorkspaceTabId(bId))).toBe(
      0
    );
  });
});
