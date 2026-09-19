import { describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult
} from "../../src/shared/api";
import {
  collectExportCandidatesFromOrigin,
  createExportCandidateTextDetails,
  createExportPreviewText,
  exportDocumentKindForPath,
  isExportableDocumentForExport,
  summarizeExportCandidates,
  type CollectExportCandidatesDeps
} from "../../src/renderer/exportCandidates";

function file(relativePath: string): FileExplorerEntry {
  const parts = relativePath.split("/");
  return {
    kind: "file",
    name: parts[parts.length - 1] ?? relativePath,
    relativePath
  };
}

function folder(relativePath: string): FileExplorerEntry {
  const parts = relativePath.split("/");
  return {
    kind: "folder",
    name: parts[parts.length - 1] ?? relativePath,
    relativePath
  };
}

function ok(
  directoryRelativePath: string | null,
  entries: readonly FileExplorerEntry[]
): ListFileExplorerChildrenResult {
  return { kind: "ok", directoryRelativePath, entries: [...entries] };
}

function depsFor(
  entriesByDirectory: Record<string, readonly FileExplorerEntry[]>,
  textByRelativePath: Record<string, string> = {}
): CollectExportCandidatesDeps & {
  readonly listFileExplorerChildren: ReturnType<typeof vi.fn>;
  readonly readProjectDocumentContent: ReturnType<typeof vi.fn>;
} {
  return {
    listFileExplorerChildren: vi.fn(
      async (
        directoryRelativePath: string | null
      ): Promise<ListFileExplorerChildrenResult> =>
        ok(
          directoryRelativePath,
          entriesByDirectory[directoryRelativePath ?? ""] ?? []
        )
    ),
    readProjectDocumentContent: vi.fn(
      async (relativePath: string): Promise<string> =>
        textByRelativePath[relativePath] ?? ""
    )
  };
}

describe("export candidate collection (#523)", () => {
  it("collects project-root candidates in File Explorer visible depth-first order", async () => {
    const deps = depsFor({
      "": [
        folder("First"),
        file("root.md"),
        file("cover.png"),
        file("notes.txt"),
        file("draft.docx")
      ],
      First: [
        file("First/01_Encounter.md"),
        folder("First/Nested"),
        file("First/02_Escape.markdown")
      ],
      "First/Nested": [
        file("First/Nested/03_Memo.txt"),
        file("First/Nested/image.jpg"),
        file("First/Nested/raw.csv")
      ]
    }, {
      "First/01_Encounter.md": "吾輩は猫である。名前はまだない。",
      "First/Nested/03_Memo.txt": "plain text memo",
      "First/02_Escape.markdown": "逃げる。",
      "root.md": "root body",
      "notes.txt": "notes body"
    });

    const candidates = await collectExportCandidatesFromOrigin(
      { kind: "projectRoot" },
      deps,
      { enablePlainTextDocuments: true }
    );

    expect(candidates).toEqual([
      {
        documentKey: "First/01_Encounter.md",
        filePath: "First/01_Encounter.md",
        parentPath: "First",
        fileName: "01_Encounter.md",
        kind: "markdown",
        previewStart: "吾輩は猫である。名前",
        previewEnd: "る。名前はまだない。",
        characterCount: 16,
        included: true
      },
      {
        documentKey: "First/Nested/03_Memo.txt",
        filePath: "First/Nested/03_Memo.txt",
        parentPath: "First/Nested",
        fileName: "03_Memo.txt",
        kind: "text",
        previewStart: "plain text",
        previewEnd: " text memo",
        characterCount: 15,
        included: true
      },
      {
        documentKey: "First/02_Escape.markdown",
        filePath: "First/02_Escape.markdown",
        parentPath: "First",
        fileName: "02_Escape.markdown",
        kind: "markdown",
        previewStart: "逃げる。",
        previewEnd: "逃げる。",
        characterCount: 4,
        included: true
      },
      {
        documentKey: "root.md",
        filePath: "root.md",
        parentPath: "",
        fileName: "root.md",
        kind: "markdown",
        previewStart: "root body",
        previewEnd: "root body",
        characterCount: 9,
        included: true
      },
      {
        documentKey: "notes.txt",
        filePath: "notes.txt",
        parentPath: "",
        fileName: "notes.txt",
        kind: "text",
        previewStart: "notes body",
        previewEnd: "notes body",
        characterCount: 10,
        included: true
      }
    ]);
    expect(deps.listFileExplorerChildren.mock.calls).toEqual([
      [null],
      ["First"],
      ["First/Nested"]
    ]);
    expect(deps.readProjectDocumentContent.mock.calls).toEqual([
      ["First/01_Encounter.md"],
      ["First/Nested/03_Memo.txt"],
      ["First/02_Escape.markdown"],
      ["root.md"],
      ["notes.txt"]
    ]);
  });

  it("collects only documents under a folder origin", async () => {
    const deps = depsFor({
      "": [file("root.md")],
      First: [folder("First/Nested"), file("First/01.md")],
      "First/Nested": [file("First/Nested/02.markdown")]
    }, {
      "First/01.md": "one",
      "First/Nested/02.markdown": "two"
    });

    const candidates = await collectExportCandidatesFromOrigin(
      { kind: "folder", folderPath: "First" },
      deps,
      { enablePlainTextDocuments: false }
    );

    expect(candidates.map((candidate) => candidate.filePath)).toEqual([
      "First/Nested/02.markdown",
      "First/01.md"
    ]);
    expect(deps.listFileExplorerChildren.mock.calls).toEqual([
      ["First"],
      ["First/Nested"]
    ]);
  });

  it("returns one item for an exportable file origin", async () => {
    const deps = depsFor(
      {},
      {
        "Drafts/scene.markdown": "Scene body"
      }
    );

    await expect(
      collectExportCandidatesFromOrigin(
        { kind: "file", filePath: "Drafts/scene.markdown" },
        deps,
        { enablePlainTextDocuments: false }
      )
    ).resolves.toEqual([
      {
        documentKey: "Drafts/scene.markdown",
        filePath: "Drafts/scene.markdown",
        parentPath: "Drafts",
        fileName: "scene.markdown",
        kind: "markdown",
        previewStart: "Scene body",
        previewEnd: "Scene body",
        characterCount: 10,
        included: true
      }
    ]);
    expect(deps.listFileExplorerChildren).not.toHaveBeenCalled();
    expect(deps.readProjectDocumentContent).toHaveBeenCalledWith(
      "Drafts/scene.markdown"
    );
  });

  it("returns an empty list for a non-exportable file origin", async () => {
    const deps = depsFor({});

    await expect(
      collectExportCandidatesFromOrigin(
        { kind: "file", filePath: "assets/cover.png" },
        deps,
        { enablePlainTextDocuments: true }
      )
    ).resolves.toEqual([]);
    expect(deps.listFileExplorerChildren).not.toHaveBeenCalled();
    expect(deps.readProjectDocumentContent).not.toHaveBeenCalled();
  });

  it("includes .txt only when plain text documents are enabled", () => {
    expect(
      exportDocumentKindForPath("notes.txt", {
        enablePlainTextDocuments: true
      })
    ).toBe("text");
    expect(
      isExportableDocumentForExport("notes.txt", {
        enablePlainTextDocuments: false
      })
    ).toBe(false);
    expect(
      exportDocumentKindForPath("chapter.md", {
        enablePlainTextDocuments: false
      })
    ).toBe("markdown");
    expect(
      exportDocumentKindForPath("chapter.markdown", {
        enablePlainTextDocuments: false
      })
    ).toBe("markdown");
    expect(
      isExportableDocumentForExport("image.svg", {
        enablePlainTextDocuments: true
      })
    ).toBe(false);
  });

  it("creates one-line previews, character count, and included default from document text", () => {
    expect(createExportPreviewText("  alpha\nbeta\r\ngamma  ", "start")).toBe(
      "alpha beta"
    );
    expect(createExportPreviewText("  alpha\nbeta\r\ngamma  ", "end")).toBe(
      "beta gamma"
    );
    expect(createExportCandidateTextDetails("😀\nabc")).toEqual({
      previewStart: "😀 abc",
      previewEnd: "😀 abc",
      characterCount: 5,
      included: true
    });
  });

  it("uses safe preview placeholders for empty documents", () => {
    expect(createExportCandidateTextDetails(" \n\t ")).toEqual({
      previewStart: "—",
      previewEnd: "—",
      characterCount: 4,
      included: true
    });
  });

  it("summarizes candidate count and included character totals", () => {
    const first = {
      documentKey: "a.md",
      filePath: "a.md",
      parentPath: "",
      fileName: "a.md",
      kind: "markdown" as const,
      previewStart: "a",
      previewEnd: "a",
      characterCount: 10,
      included: true
    };
    const second = {
      documentKey: "b.md",
      filePath: "b.md",
      parentPath: "",
      fileName: "b.md",
      kind: "markdown" as const,
      previewStart: "b",
      previewEnd: "b",
      characterCount: 20,
      included: false
    };

    expect(summarizeExportCandidates([first, second])).toEqual({
      candidateCount: 2,
      includedCount: 1,
      includedCharacterCount: 10
    });
  });
});
