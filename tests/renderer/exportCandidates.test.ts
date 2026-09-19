import { describe, expect, it, vi } from "vitest";
import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult
} from "../../src/shared/api";
import {
  collectExportCandidatesFromOrigin,
  exportDocumentKindForPath,
  isExportableDocumentForExport,
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
  entriesByDirectory: Record<string, readonly FileExplorerEntry[]>
): CollectExportCandidatesDeps & {
  readonly listFileExplorerChildren: ReturnType<typeof vi.fn>;
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
    )
  };
}

describe("export candidate collection (#523 Slice 1)", () => {
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
        kind: "markdown"
      },
      {
        documentKey: "First/Nested/03_Memo.txt",
        filePath: "First/Nested/03_Memo.txt",
        parentPath: "First/Nested",
        fileName: "03_Memo.txt",
        kind: "text"
      },
      {
        documentKey: "First/02_Escape.markdown",
        filePath: "First/02_Escape.markdown",
        parentPath: "First",
        fileName: "02_Escape.markdown",
        kind: "markdown"
      },
      {
        documentKey: "root.md",
        filePath: "root.md",
        parentPath: "",
        fileName: "root.md",
        kind: "markdown"
      },
      {
        documentKey: "notes.txt",
        filePath: "notes.txt",
        parentPath: "",
        fileName: "notes.txt",
        kind: "text"
      }
    ]);
    expect(deps.listFileExplorerChildren.mock.calls).toEqual([
      [null],
      ["First"],
      ["First/Nested"]
    ]);
  });

  it("collects only documents under a folder origin", async () => {
    const deps = depsFor({
      "": [file("root.md")],
      First: [folder("First/Nested"), file("First/01.md")],
      "First/Nested": [file("First/Nested/02.markdown")]
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
    const deps = depsFor({});

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
        kind: "markdown"
      }
    ]);
    expect(deps.listFileExplorerChildren).not.toHaveBeenCalled();
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
});
