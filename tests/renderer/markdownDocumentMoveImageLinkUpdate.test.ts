import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import {
  applyMarkdownImageLinkRewritesToText,
  buildMarkdownDocumentMoveImageLinkUpdateBatch,
  markdownImageLinkRewriteChangeSpecs,
  resolveMarkdownDocumentMoves,
  resolveMarkdownImageLinkMoveUpdateChoice,
  type MarkdownDocumentMoveImageLinkUpdateBatch,
  type MarkdownDocumentMoveImageLinkUpdatePlan
} from "../../src/renderer/markdownDocumentMoveImageLinkUpdate";
import type { MarkdownImageLinkMoveRewrite } from "../../src/shared/markdownImageLinkMoveRewrite";

function fileEntry(relativePath: string): FileExplorerEntry {
  const slash = relativePath.lastIndexOf("/");
  return {
    kind: "file",
    name: slash === -1 ? relativePath : relativePath.slice(slash + 1),
    relativePath
  } as FileExplorerEntry;
}

function folderEntry(relativePath: string): FileExplorerEntry {
  const slash = relativePath.lastIndexOf("/");
  return {
    kind: "folder",
    name: slash === -1 ? relativePath : relativePath.slice(slash + 1),
    relativePath
  } as FileExplorerEntry;
}

describe("resolveMarkdownDocumentMoves", () => {
  const entries: Record<string, FileExplorerEntry[]> = {
    "": [
      folderEntry("chapters"),
      folderEntry("assets"),
      fileEntry("a.md"),
      fileEntry("b.md"),
      fileEntry("notes.txt"),
      fileEntry("cover.png")
    ],
    chapters: [fileEntry("chapters/ch01.md"), folderEntry("chapters/part1")]
  };

  it("resolves a single Markdown file moving to a different folder", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["chapters/ch01.md"],
        destinationFolderRelativePath: "chapters/part1",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      {
        oldProjectRelativePath: "chapters/ch01.md",
        newProjectRelativePath: "chapters/part1/ch01.md"
      }
    ]);
  });

  it("resolves EVERY selected Markdown file in a multi-selection", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["a.md", "b.md"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "chapters/a.md" },
      { oldProjectRelativePath: "b.md", newProjectRelativePath: "chapters/b.md" }
    ]);
  });

  it("keeps only the explicit Markdown files in a mixed selection", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["a.md", "notes.txt", "cover.png"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "chapters/a.md" }
    ]);
  });

  it("never expands a directory source (no recursive scan)", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["chapters"],
        destinationFolderRelativePath: "assets",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });

  it("keeps the explicit Markdown files even when a folder is also selected", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["a.md", "chapters"],
        destinationFolderRelativePath: "assets",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      { oldProjectRelativePath: "a.md", newProjectRelativePath: "assets/a.md" }
    ]);
  });

  it("drops a Markdown file already living in the destination folder", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["chapters/ch01.md"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });

  it("drops an entry whose kind cannot be confirmed as a file", () => {
    expect(
      resolveMarkdownDocumentMoves({
        sourceRelativePaths: ["chapters/ghost.md"],
        destinationFolderRelativePath: "chapters/part1",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });
});

describe("buildMarkdownDocumentMoveImageLinkUpdateBatch", () => {
  const rw = (n: number): MarkdownImageLinkMoveRewrite[] =>
    Array.from({ length: n }, (_unused, i) => ({
      from: i,
      to: i + 1,
      oldDestination: "x",
      newDestination: "y"
    }));
  const plan = (
    path: string,
    n: number
  ): MarkdownDocumentMoveImageLinkUpdatePlan => ({
    oldProjectRelativePath: path,
    newProjectRelativePath: `Drafts/${path}`,
    rewrites: rw(n)
  });

  it("sums the rewrite count and drops documents with nothing to rewrite", () => {
    const batch = buildMarkdownDocumentMoveImageLinkUpdateBatch([
      plan("a.md", 3),
      plan("b.md", 0),
      plan("c.md", 2)
    ]);
    expect(batch.plans.map((p) => p.oldProjectRelativePath)).toEqual([
      "a.md",
      "c.md"
    ]);
    expect(batch.totalRewriteCount).toBe(5);
  });

  it("produces an empty batch when every document has zero rewrites", () => {
    const batch = buildMarkdownDocumentMoveImageLinkUpdateBatch([
      plan("a.md", 0),
      plan("b.md", 0)
    ]);
    expect(batch.plans).toEqual([]);
    expect(batch.totalRewriteCount).toBe(0);
  });
});

describe("resolveMarkdownImageLinkMoveUpdateChoice", () => {
  const batch: MarkdownDocumentMoveImageLinkUpdateBatch = {
    plans: [
      {
        oldProjectRelativePath: "a.md",
        newProjectRelativePath: "Drafts/a.md",
        rewrites: [
          { from: 0, to: 1, oldDestination: "x", newDestination: "y" }
        ]
      }
    ],
    totalRewriteCount: 1
  };

  it("`update` proceeds with the move AND stages the batch", () => {
    expect(resolveMarkdownImageLinkMoveUpdateChoice("update", batch)).toEqual({
      moveDecision: "proceed",
      stagedBatch: batch
    });
  });

  it("`skip` proceeds with the move but stages NOTHING (no body rewrite)", () => {
    expect(resolveMarkdownImageLinkMoveUpdateChoice("skip", batch)).toEqual({
      moveDecision: "proceed",
      stagedBatch: null
    });
  });

  it("`cancel` aborts the move and stages nothing", () => {
    expect(resolveMarkdownImageLinkMoveUpdateChoice("cancel", batch)).toEqual({
      moveDecision: "cancel",
      stagedBatch: null
    });
  });

  it("only `update` ever stages a batch", () => {
    const choices = ["update", "skip", "cancel"] as const;
    const staging = choices.filter(
      (choice) =>
        resolveMarkdownImageLinkMoveUpdateChoice(choice, batch).stagedBatch !==
        null
    );
    expect(staging).toEqual(["update"]);
  });
});

describe("applyMarkdownImageLinkRewritesToText / markdownImageLinkRewriteChangeSpecs", () => {
  const md = "intro ![](../assets/a.png) mid ![](img/b.png) end";
  const first = md.indexOf("../assets/a.png");
  const second = md.indexOf("img/b.png");
  const rewrites: MarkdownImageLinkMoveRewrite[] = [
    {
      from: first,
      to: first + "../assets/a.png".length,
      oldDestination: "../assets/a.png",
      newDestination: "../../assets/a.png"
    },
    {
      from: second,
      to: second + "img/b.png".length,
      oldDestination: "img/b.png",
      newDestination: "../img/b.png"
    }
  ];

  it("applies every rewrite, left to right", () => {
    expect(applyMarkdownImageLinkRewritesToText(md, rewrites)).toBe(
      "intro ![](../../assets/a.png) mid ![](../img/b.png) end"
    );
  });

  it("returns null (stale) when an oldDestination no longer matches", () => {
    const stale: MarkdownImageLinkMoveRewrite[] = [
      { ...rewrites[0], oldDestination: "../assets/DIFFERENT.png" }
    ];
    expect(markdownImageLinkRewriteChangeSpecs(md, stale)).toBeNull();
    expect(applyMarkdownImageLinkRewritesToText(md, stale)).toBeNull();
  });

  it("returns ascending non-overlapping change specs", () => {
    const specs = markdownImageLinkRewriteChangeSpecs(md, rewrites);
    expect(specs).not.toBeNull();
    expect(specs).toEqual([
      { from: first, to: first + 15, insert: "../../assets/a.png" },
      { from: second, to: second + 9, insert: "../img/b.png" }
    ]);
  });
});

describe("#413 File Explorer / App wiring", () => {
  const fileExplorerSource = readFileSync(
    "src/renderer/FileExplorer.tsx",
    "utf8"
  );
  const workspaceSidebarSource = readFileSync(
    "src/renderer/WorkspaceSidebar.tsx",
    "utf8"
  );
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("every FileExplorer move route shares the batch pre-move hook, and the post-move apply hook runs once", () => {
    expect(fileExplorerSource).toContain("onPrepareMarkdownDocumentMoves");
    expect(fileExplorerSource).toContain("resolveMarkdownDocumentMoves(");
    expect(fileExplorerSource).toContain(
      "const confirmMarkdownDocumentMoves = useCallback("
    );
    // Consulted by the Move… menu, Drag & Drop, and Cut/Paste routes.
    const gateCalls = fileExplorerSource.match(
      /await confirmMarkdownDocumentMoves\(/g
    );
    expect(gateCalls?.length).toBe(3);
    expect(fileExplorerSource).toContain(') === "cancel"');
    // #414: one combined C1+C2 apply.
    expect(fileExplorerSource).toContain(
      "onApplyMoveImageRewrites?.({ relocations, completedImageMoves })"
    );
  });

  it("WorkspaceSidebar threads the C1 prepare hook + the combined apply", () => {
    expect(workspaceSidebarSource).toContain(
      "onFileExplorerPrepareMarkdownDocumentMoves"
    );
    expect(workspaceSidebarSource).toContain(
      "onPrepareMarkdownDocumentMoves={"
    );
    expect(workspaceSidebarSource).toContain("onApplyMoveImageRewrites={");
  });

  it("App plans a batch, shows one dialog, and applies per-document via transaction or file write", () => {
    expect(appSource).toContain(
      "planMarkdownImageLinkRewritesForDocumentMove"
    );
    expect(appSource).toContain("buildMarkdownDocumentMoveImageLinkUpdateBatch");
    expect(appSource).toContain("handlePrepareMarkdownDocumentMoves");
    expect(appSource).toContain("applyImageLinkRewritesToProjectDocument");
    expect(appSource).toContain("function handleApplyMoveImageRewrites");
    expect(appSource).toContain("<MarkdownImageLinkMoveUpdateDialog");
    expect(appSource).toContain("applyReplaceInBufferChanges");
    expect(appSource).toContain(
      "window.pergamum.projects.saveProjectDocument("
    );
    // Per-document failure is tracked, never rolls the Move back.
    expect(appSource).toContain("failedDocuments");
  });

  it("App routes the dialog choice through the 3-way resolver and never re-collapses skip into update", () => {
    // The footer buttons emit distinct choices...
    expect(appSource).toContain(
      'markdownMoveImageLinkUpdateResolveRef.current?.("update")'
    );
    expect(appSource).toContain(
      'markdownMoveImageLinkUpdateResolveRef.current?.("skip")'
    );
    expect(appSource).toContain(
      'markdownMoveImageLinkUpdateResolveRef.current?.("cancel")'
    );
    // ...and a single helper decides what each does.
    expect(appSource).toContain("resolveMarkdownImageLinkMoveUpdateChoice(");
    // The old bug shape: "skip" must NOT manually re-stage / proceed inline.
    expect(appSource).not.toContain('resolve?.("proceed")');
    // pending batch is cleared at the start of every prepare and at the top
    // of every apply.
    const prepareIdx = appSource.indexOf(
      "async function handlePrepareMarkdownDocumentMoves"
    );
    expect(
      appSource
        .slice(prepareIdx, prepareIdx + 400)
        .includes("pendingMarkdownMoveImageLinkUpdateRef.current = null")
    ).toBe(true);
    const applyIdx = appSource.indexOf(
      "function handleApplyMoveImageRewrites"
    );
    expect(
      appSource
        .slice(applyIdx, applyIdx + 700)
        .includes("pendingMarkdownMoveImageLinkUpdateRef.current = null")
    ).toBe(true);
  });
});
