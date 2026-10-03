// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import {
  createFileEditorIdForPath,
  createGlossaryDescriptionEditorId,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  type EditorId
} from "../../src/shared/editorId";
import { resolveTabExportTarget } from "../../src/renderer/glossaryExport/tabExportTarget";
import {
  glossaryExportEntryTitle,
  type GlossaryExportEntry
} from "../../src/shared/glossaryExportEntry";
import {
  createGlossaryDescriptionCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE } from "../../src/renderer/glossaryEntryTabCommands";
import { createGlossaryDescriptionExportSnapshot } from "../../src/renderer/glossaryExport/glossaryExportSnapshot";
import { defaultGlossaryExportBaseFileName } from "../../src/renderer/glossaryExport/glossaryExportModel";
import { countGlossaryEntryOccurrences } from "../../src/renderer/glossaryExport/glossaryExportOccurrences";
import { runCombinedGlossaryExport } from "../../src/renderer/glossaryExport/glossaryExportRunner";
import type { GlossaryExportDocumentLabels } from "../../src/renderer/glossaryExport/glossaryExportHtml";

const entryId = "0190b6a1-1c2d-7e3f-8a4b-0000000000e1";
const stamp = "2026-09-24T00:00:00.000Z";

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: stamp,
    updatedAt: stamp
  };
}

const tagA = tag("tag-a", "Tag A");
const tagB = tag("tag-b", "Tag B");
const tagC = tag("tag-c", "Tag C");
const projectTags = [tagA, tagB, tagC];

function savedEntry(): GlossaryEntry {
  return {
    id: entryId,
    description: "保存済みの古い説明。",
    atoms: [
      {
        id: "atom-saved",
        entryId,
        sortOrder: 0,
        value: "アリス",
        matchFlags: 0,
        createdAt: stamp,
        updatedAt: stamp
      }
    ],
    tags: [tagA],
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-02-03T00:00:00.000Z"
  };
}

/** The saved entry's tab, edited but not saved. */
function dirtyDraft() {
  const editor = createGlossaryDescriptionCurrentEditor(savedEntry());

  editor.draft.description = "未保存の新しい説明。";
  editor.draft.atoms = [
    { id: "local:alice", value: "Alice", matchFlags: 2 },
    { id: "atom-saved", value: "アリス", matchFlags: 0 }
  ];
  editor.draft.tagIds = ["tag-c", "tag-b"];

  return editor;
}

function snapshotOf(editor = dirtyDraft()): GlossaryExportEntry {
  return createGlossaryDescriptionExportSnapshot({
    tabEntryId: editor.entryId,
    draft: editor.draft,
    projectTags
  });
}

describe("current-draft snapshot (#695)", () => {
  it("takes the Description, Atoms and tags from the draft, not the saved entry", () => {
    const editor = dirtyDraft();
    const snapshot = snapshotOf(editor);

    expect(editor.draft.entry.description).toBe("保存済みの古い説明。");
    expect(snapshot.description).toBe("未保存の新しい説明。");
    expect(snapshot.atoms.map((atom) => atom.value)).toEqual(["Alice", "アリス"]);
    expect(snapshot.tags.map((t) => t.label)).toEqual(["Tag C", "Tag B"]);
    expect(snapshot.tags.map((t) => t.label)).not.toContain("Tag A");
  });

  it("keeps the draft's Atom order, flags and local ids; index 0 is the representative", () => {
    const snapshot = snapshotOf();

    expect(snapshot.atoms).toEqual([
      { id: "local:alice", value: "Alice", matchFlags: 2, sortOrder: 0 },
      { id: "atom-saved", value: "アリス", matchFlags: 0, sortOrder: 1 }
    ]);
    expect(glossaryExportEntryTitle(snapshot)).toBe("Alice");
  });

  it("follows a reordered representative", () => {
    const editor = dirtyDraft();

    editor.draft.atoms = [...editor.draft.atoms].reverse();

    const snapshot = snapshotOf(editor);

    expect(snapshot.atoms.map((atom) => atom.value)).toEqual(["アリス", "Alice"]);
    expect(glossaryExportEntryTitle(snapshot)).toBe("アリス");
    expect(defaultGlossaryExportBaseFileName(glossaryExportEntryTitle(snapshot))).toBe(
      "アリス"
    );
  });

  it("keeps the draft's tag assignment order and ignores a tag that no longer exists", () => {
    const editor = dirtyDraft();

    editor.draft.tagIds = ["tag-b", "gone", "tag-a", "tag-c"];

    expect(snapshotOf(editor).tags.map((t) => t.id)).toEqual([
      "tag-b",
      "tag-a",
      "tag-c"
    ]);
  });

  it("works for a never-saved entry: no stored dates, no persisted id needed", () => {
    const editor = createNewGlossaryDescriptionCurrentEditor(
      "新しい語彙",
      "0190b6a1-1c2d-7e3f-8a4b-00000000ffff"
    );

    editor.draft.description = "書きかけ。";
    editor.draft.atoms = [{ id: "local:1", value: "AC/DC", matchFlags: 0 }];
    editor.draft.tagIds = ["tag-a"];

    const snapshot = snapshotOf(editor);

    expect(snapshot.createdAt).toBeNull();
    expect(snapshot.updatedAt).toBeNull();
    expect(snapshot.id).toBe("description-draft-0190b6a1-1c2d-7e3f-8a4b-00000000ffff");
    expect(snapshot.description).toBe("書きかけ。");
    expect(snapshot.tags.map((t) => t.label)).toEqual(["Tag A"]);
    expect(glossaryExportEntryTitle(snapshot)).toBe("AC/DC");
  });

  it("shows a saved entry's stored dates as they are", () => {
    const snapshot = snapshotOf();

    expect(snapshot.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(snapshot.updatedAt).toBe("2026-02-03T00:00:00.000Z");
  });

  it("falls back to the usual name when the representative Atom is empty, without altering it", () => {
    const editor = dirtyDraft();

    editor.draft.atoms = [{ id: "local:x", value: "   ", matchFlags: 0 }];

    const snapshot = snapshotOf(editor);

    expect(glossaryExportEntryTitle(snapshot)).toBe(
      DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
    );
    expect(snapshot.atoms[0]?.value).toBe("   ");
  });

  it("is detached: changing the draft afterwards does not change it", () => {
    const editor = dirtyDraft();
    const snapshot = snapshotOf(editor);
    const before = JSON.stringify(snapshot);

    editor.draft.description = "さらに書き換えた説明。";
    editor.draft.atoms[0]!.value = "Alicia";
    editor.draft.atoms.push({ id: "local:z", value: "Z", matchFlags: 0 });
    editor.draft.tagIds = [];

    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("carries only export data: no save state, baseline or entry", () => {
    expect(Object.keys(snapshotOf()).sort()).toEqual([
      "atoms",
      "createdAt",
      "description",
      "fallbackTitle",
      "id",
      "tags",
      "updatedAt"
    ]);
  });

  it("uses a tab-local key as its id, never the saved entry's", () => {
    expect(snapshotOf().id).toBe(`description-draft-${entryId}`);
    expect(snapshotOf().id).not.toBe(entryId);
  });
});

describe("occurrence count uses the current draft's Atoms (#695)", () => {
  const documents: ProjectDocument[] = [{ relativePath: "a.md", name: "a.md" }];

  it("counts Alice, not the saved アリス", async () => {
    const editor = dirtyDraft();

    editor.draft.atoms = [{ id: "local:alice", value: "Alice", matchFlags: 0 }];

    const counts = await countGlossaryEntryOccurrences({
      entry: snapshotOf(editor),
      documents,
      readText: async () => "Alice と アリス と Alice。"
    });

    expect(counts.atoms).toEqual([
      { atomId: "local:alice", value: "Alice", count: 2 }
    ]);
    expect(counts.total).toBe(2);
  });

  it("ignores an empty Atom instead of failing", async () => {
    const editor = dirtyDraft();

    editor.draft.atoms = [
      { id: "local:e", value: "", matchFlags: 0 },
      { id: "local:a", value: "Alice", matchFlags: 0 }
    ];

    const counts = await countGlossaryEntryOccurrences({
      entry: snapshotOf(editor),
      documents,
      readText: async () => "Alice"
    });

    expect(counts.total).toBe(1);
  });
});

describe("single snapshot through the combined export (#695)", () => {
  const labels: GlossaryExportDocumentLabels = {
    infoHeading: "語彙情報",
    representative: "代表表記",
    atoms: "表記",
    tags: "タグ",
    noTags: "タグなし",
    createdAt: "作成日",
    updatedAt: "更新日",
    occurrencesHeading: "表記ごとの出現数",
    atomColumn: "表記",
    countColumn: "出現回数",
    total: "合計",
    occurrenceScope: "文書 1 件",
    occurrenceSkipped: null,
    descriptionHeading: "Description",
    emptyDescription: "（なし）"
  };

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      renderDescription: vi.fn(async (description: string) => ({
        html: `<p>${description}</p>`,
        imageAssets: [],
        usesMath: false
      })),
      loadKatexCss: vi.fn(async () => ""),
      labels: () => labels,
      lang: "ja",
      writeHtml: vi.fn(async () => ({
        ok: true as const,
        outputPath: "/out/Alice.html",
        warningCount: 0
      })),
      writePdf: vi.fn(async () => ({
        ok: true as const,
        outputPath: "/out/Alice.pdf",
        warningCount: 0
      })),
      ...overrides
    };
  }

  const basePlan = {
    imageAssetFolderName: "Alice.assets",
    includeToc: false,
    tocPosition: "front" as const
  };

  it("HTML: renders the current draft, titled by the representative Atom", async () => {
    const d = deps();
    const snapshot = snapshotOf();
    const result = await runCombinedGlossaryExport(
      {
        ...basePlan,
        format: "html",
        entries: [snapshot],
        outputFilePath: "/out/Alice.html",
        fileName: "Alice.html",
        documentTitle: glossaryExportEntryTitle(snapshot)
      },
      d
    );

    expect(result).toEqual({ ok: true, outputPath: "/out/Alice.html", warningCount: 0 });
    expect(d.renderDescription).toHaveBeenCalledTimes(1);
    expect(d.renderDescription.mock.calls[0]?.[0]).toBe("未保存の新しい説明。");

    const html = (d.writeHtml.mock.calls[0] as unknown as [{ htmlContent: string }])[0]
      .htmlContent;

    expect(html).toContain("<title>Alice</title>");
    expect(html).toContain("未保存の新しい説明。");
    expect(html).not.toContain("保存済みの古い説明。");
    expect(html).toContain("Tag C");
    expect(html).toContain("Tag B");
    expect(html).not.toContain("Tag A");
    expect(d.writePdf).not.toHaveBeenCalled();
  });

  it("PDF: goes through the same combined path", async () => {
    const d = deps();
    const result = await runCombinedGlossaryExport(
      {
        ...basePlan,
        format: "pdf",
        entries: [snapshotOf()],
        outputFilePath: "/out/Alice.pdf",
        fileName: "Alice.pdf"
      },
      d
    );

    expect(result).toEqual({ ok: true, outputPath: "/out/Alice.pdf", warningCount: 0 });
    expect(d.writePdf).toHaveBeenCalledTimes(1);
    expect(d.writeHtml).not.toHaveBeenCalled();
  });

  it("a never-saved entry exports with a working anchor and TOC link, and no stored dates", async () => {
    const editor = createNewGlossaryDescriptionCurrentEditor(
      "新しい語彙",
      "0190b6a1-1c2d-7e3f-8a4b-00000000ffff"
    );

    editor.draft.description = "書きかけ。";
    editor.draft.atoms = [{ id: "local:1", value: "AC/DC", matchFlags: 0 }];

    const d = deps();
    const snapshot = snapshotOf(editor);

    await runCombinedGlossaryExport(
      {
        ...basePlan,
        includeToc: true,
        format: "html",
        entries: [snapshot],
        outputFilePath: "/out/AC_DC.html",
        fileName: "AC_DC.html",
        documentTitle: glossaryExportEntryTitle(snapshot)
      },
      d
    );

    const html = (d.writeHtml.mock.calls[0] as unknown as [{ htmlContent: string }])[0]
      .htmlContent;
    const anchor = "glossary-entry-description-draft-0190b6a1-1c2d-7e3f-8a4b-00000000ffff";

    expect(html).toContain(`id="${anchor}"`);
    expect(html).toContain(`href="#${anchor}"`);
    // Title and content keep the name as is; only the file name was made safe.
    expect(html).toContain("<title>AC/DC</title>");
    expect(html).toContain("AC/DC");
    expect(defaultGlossaryExportBaseFileName("AC/DC")).toBe("AC_DC");
    expect(html).not.toMatch(/undefined|null|Invalid Date/);
  });

  it("an empty Description or empty Atom does not break the document", async () => {
    const editor = dirtyDraft();

    editor.draft.description = "";
    editor.draft.atoms = [{ id: "local:e", value: "", matchFlags: 0 }];

    const d = deps();

    const result = await runCombinedGlossaryExport(
      {
        ...basePlan,
        format: "html",
        entries: [snapshotOf(editor)],
        outputFilePath: "/out/x.html",
        fileName: "x.html"
      },
      d
    );

    expect(result.ok).toBe(true);
    expect(d.renderDescription).not.toHaveBeenCalled();
  });
});

describe("App wiring (#695)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("opens the Wizard through the existing Export command, with a snapshot taken at that moment", () => {
    expect(app).toContain("assistCommandIds.openExportDialog");
    expect(app).toContain("resolveTabExportTarget(tab, {");
    expect(app).toContain('target?.kind === "glossaryDescription"');
    expect(app).toContain(
      'startGlossaryExportWizard({ kind: "single", snapshot: target.snapshot });'
    );
  });

  it("counts only the session's entries (one for a single export)", () => {
    expect(app).toContain(
      'session.kind === "single" ? [session.snapshot] : glossaryEntries'
    );
    expect(app).toContain("for (const entry of entriesToCount)");
  });

  it("keeps the all-entries Wizard and the zero-argument export as they were", () => {
    expect(app).toContain('startGlossaryExportWizard({ kind: "all" });');
    expect(app).toContain(
      'void handleFileExplorerExport(target?.origin ?? { kind: "projectRoot" });'
    );
  });

  it("neither saves nor reads the database to export a draft", () => {
    const start = app.indexOf("function exportTargetForTab(");
    const end = app.indexOf("function japaneseMachineCheckTargetForTab(", start);
    const helper = readFileSync(
      "src/renderer/glossaryExport/tabExportTarget.ts",
      "utf8"
    );
    const block = app.slice(start, end) + helper;

    expect(block).not.toMatch(/glossary\.(create|update|getById|save)|saveGlossary/i);
    expect(block).not.toContain("window.pergamum");
  });

  it("logs nothing about the exported entry", () => {
    const snapshot = readFileSync(
      "src/renderer/glossaryExport/glossaryExportSnapshot.ts",
      "utf8"
    );

    expect(snapshot).not.toMatch(/logRendererDebugEvent|console\./);
  });
});

describe("document tab Export target is the clicked tab's (#684 / #695)", () => {
  // The ACTIVE editor is never consulted: only the clicked tab's own data.
  const deps = {
    projectDocumentRelativePath: (id: EditorId) =>
      id.kind === "projectDocument" ? `real/${id.relativePath}` : null,
    openEditor: (id: EditorId) =>
      id.kind === "glossaryDescription" ? dirtyDraft() : null,
    projectTags
  };

  it("a project document: that one file, not a project-root export", () => {
    expect(
      resolveTabExportTarget(
        {
          id: createProjectDocumentEditorId("a.md", { rootPath: "C:\\Novel" })
        },
        deps
      )
    ).toEqual({
      kind: "project",
      origin: { kind: "file", filePath: "real/a.md" }
    });
  });

  it("a glossary Description: a snapshot of THAT tab's current draft", () => {
    const target = resolveTabExportTarget(
      { id: createGlossaryDescriptionEditorId(entryId) },
      deps
    );

    expect(target?.kind).toBe("glossaryDescription");
    expect(target?.kind === "glossaryDescription" && target.snapshot).toEqual(
      snapshotOf()
    );
  });

  it("external files, untitled documents and a missing editor have no target", () => {
    for (const id of [
      createFileEditorIdForPath("C:/Outside/notes.md"),
      createUntitledEditorId(1)
    ]) {
      expect(resolveTabExportTarget({ id }, deps), id.kind).toBeNull();
    }
    expect(
      resolveTabExportTarget(
        { id: createGlossaryDescriptionEditorId(entryId) },
        { ...deps, openEditor: () => null }
      )
    ).toBeNull();
  });
});
