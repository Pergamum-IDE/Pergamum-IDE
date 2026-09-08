import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FileExplorerEntry } from "../../src/shared/api";
import type { MarkdownImageReferenceMoveRewrite } from "../../src/shared/markdownImageReferenceMoveRewrite";
import {
  buildImageReferenceMoveUpdateBatch,
  documentMayReferenceMovedImage,
  filterImageReferenceUpdatePlansToCompletedMoves,
  imageReferenceSearchPlan,
  isSupportedProjectImageFileName,
  resolveImageReferenceMoveUpdateChoice,
  resolveMovedImageFiles,
  type ImageReferenceMoveUpdateBatch,
  type ImageReferenceMoveUpdatePlan
} from "../../src/renderer/markdownImageReferenceMoveUpdate";

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

function rw(
  n: number,
  oldImage: string,
  newImage: string
): MarkdownImageReferenceMoveRewrite[] {
  return Array.from({ length: n }, (_v, i) => ({
    markdownDocumentProjectRelativePath: "doc.md",
    from: i,
    to: i + 1,
    oldDestination: "x",
    newDestination: "y",
    oldImageProjectRelativePath: oldImage,
    newImageProjectRelativePath: newImage
  }));
}

describe("isSupportedProjectImageFileName", () => {
  it("accepts png/jpg/jpeg/gif/webp, rejects the rest", () => {
    for (const ok of ["a.png", "a.JPG", "a.jpeg", "a.gif", "a.webp"]) {
      expect(isSupportedProjectImageFileName(ok)).toBe(true);
    }
    for (const no of ["a.svg", "a.bmp", "a.avif", "a.md", "a", "a.png.txt"]) {
      expect(isSupportedProjectImageFileName(no)).toBe(false);
    }
  });
});

describe("resolveMovedImageFiles", () => {
  const entries: Record<string, FileExplorerEntry[]> = {
    "": [folderEntry("assets"), folderEntry("chapters"), fileEntry("a.md")],
    assets: [
      fileEntry("assets/foo.png"),
      fileEntry("assets/bar.jpg"),
      fileEntry("assets/logo.svg"),
      folderEntry("assets/icons")
    ]
  };

  it("resolves a single image file moving to a different folder", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: ["assets/foo.png"],
        destinationFolderRelativePath: "assets/icons",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      {
        oldProjectRelativePath: "assets/foo.png",
        newProjectRelativePath: "assets/icons/foo.png"
      }
    ]);
  });

  it("resolves EVERY selected image file", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: ["assets/foo.png", "assets/bar.jpg"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      {
        oldProjectRelativePath: "assets/foo.png",
        newProjectRelativePath: "chapters/foo.png"
      },
      {
        oldProjectRelativePath: "assets/bar.jpg",
        newProjectRelativePath: "chapters/bar.jpg"
      }
    ]);
  });

  it("keeps only supported image files in a mixed selection", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: [
          "assets/foo.png",
          "assets/logo.svg",
          "a.md",
          "assets/icons"
        ],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([
      {
        oldProjectRelativePath: "assets/foo.png",
        newProjectRelativePath: "chapters/foo.png"
      }
    ]);
  });

  it("never expands a directory source", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: ["assets"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });

  it("drops an image already in the destination folder", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: ["assets/foo.png"],
        destinationFolderRelativePath: "assets",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });

  it("drops an entry whose kind cannot be confirmed as a file", () => {
    expect(
      resolveMovedImageFiles({
        sourceRelativePaths: ["assets/ghost.png"],
        destinationFolderRelativePath: "chapters",
        entriesByDirectoryPath: entries
      })
    ).toEqual([]);
  });
});

describe("imageReferenceSearchPlan / documentMayReferenceMovedImage (P1-2)", () => {
  const move = (o: string, n: string) => ({
    oldProjectRelativePath: o,
    newProjectRelativePath: n
  });

  it("a URL-safe basename produces just the raw token", () => {
    const plan = imageReferenceSearchPlan([
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    expect(plan.matchAllDocuments).toBe(false);
    expect(plan.tokens).toContain("foo.png");
  });

  it("keeps a document that percent-encoded `#` (figure#1.png)", () => {
    const plan = imageReferenceSearchPlan([
      move("assets/figure#1.png", "assets/x/figure#1.png")
    ]);
    expect(plan.tokens).toContain("figure%231.png");
    expect(plan.tokens).toContain("figure"); // literal leading run
    expect(
      documentMayReferenceMovedImage(
        "![](../assets/figure%231.png)",
        plan
      )
    ).toBe(true);
  });

  it("keeps a document that percent-encoded `%` (100%.png)", () => {
    const plan = imageReferenceSearchPlan([
      move("assets/100%.png", "assets/x/100%.png")
    ]);
    expect(
      documentMayReferenceMovedImage("![](../assets/100%25.png)", plan)
    ).toBe(true);
    expect(
      documentMayReferenceMovedImage("![](<../assets/100%.png>)", plan)
    ).toBe(true);
  });

  it("keeps a document that percent-encoded a leading space (`my image.png`) — falls back to matchAll", () => {
    const plan = imageReferenceSearchPlan([
      move("assets/my image.png", "assets/x/my image.png")
    ]);
    // Leading safe run "my" is too short to be a reliable needle.
    expect(plan.matchAllDocuments).toBe(true);
    expect(documentMayReferenceMovedImage("no reference at all", plan)).toBe(
      true
    );
  });

  it("does not flag an unrelated document for a URL-safe basename", () => {
    const plan = imageReferenceSearchPlan([
      move("assets/foo.png", "assets/x/foo.png")
    ]);
    expect(
      documentMayReferenceMovedImage("![](../assets/bar.png)", plan)
    ).toBe(false);
  });
});

describe("buildImageReferenceMoveUpdateBatch", () => {
  it("sums references, counts documents, counts DISTINCT images", () => {
    const plans: ImageReferenceMoveUpdatePlan[] = [
      {
        markdownDocumentProjectRelativePath: "a.md",
        rewrites: [
          ...rw(2, "assets/foo.png", "assets/x/foo.png"),
          ...rw(1, "assets/bar.png", "assets/x/bar.png")
        ]
      },
      { markdownDocumentProjectRelativePath: "b.md", rewrites: [] },
      {
        markdownDocumentProjectRelativePath: "c.md",
        rewrites: rw(3, "assets/foo.png", "assets/x/foo.png")
      }
    ];
    const batch = buildImageReferenceMoveUpdateBatch(plans);
    expect(batch.plans.map((p) => p.markdownDocumentProjectRelativePath)).toEqual([
      "a.md",
      "c.md"
    ]);
    expect(batch.totalReferenceCount).toBe(6);
    expect(batch.documentCount).toBe(2);
    expect(batch.imageCount).toBe(2); // foo.png + bar.png
  });
});

describe("resolveImageReferenceMoveUpdateChoice", () => {
  const batch: ImageReferenceMoveUpdateBatch = {
    plans: [
      {
        markdownDocumentProjectRelativePath: "a.md",
        rewrites: rw(1, "assets/foo.png", "assets/x/foo.png")
      }
    ],
    totalReferenceCount: 1,
    documentCount: 1,
    imageCount: 1
  };

  it("update proceeds and stages the batch", () => {
    expect(resolveImageReferenceMoveUpdateChoice("update", batch)).toEqual({
      moveDecision: "proceed",
      stagedBatch: batch
    });
  });
  it("skip proceeds and stages nothing", () => {
    expect(resolveImageReferenceMoveUpdateChoice("skip", batch)).toEqual({
      moveDecision: "proceed",
      stagedBatch: null
    });
  });
  it("cancel aborts and stages nothing", () => {
    expect(resolveImageReferenceMoveUpdateChoice("cancel", batch)).toEqual({
      moveDecision: "cancel",
      stagedBatch: null
    });
  });
});

describe("filterImageReferenceUpdatePlansToCompletedMoves", () => {
  it("keeps only rewrites whose image actually completed its move", () => {
    const plans: ImageReferenceMoveUpdatePlan[] = [
      {
        markdownDocumentProjectRelativePath: "a.md",
        rewrites: [
          ...rw(1, "assets/foo.png", "assets/x/foo.png"),
          ...rw(1, "assets/bar.png", "assets/x/bar.png")
        ]
      },
      {
        markdownDocumentProjectRelativePath: "b.md",
        rewrites: rw(1, "assets/bar.png", "assets/x/bar.png")
      }
    ];
    // Only foo.png actually moved.
    const kept = filterImageReferenceUpdatePlansToCompletedMoves(plans, [
      {
        oldProjectRelativePath: "assets/foo.png",
        newProjectRelativePath: "assets/x/foo.png"
      }
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].markdownDocumentProjectRelativePath).toBe("a.md");
    expect(kept[0].rewrites).toHaveLength(1);
    expect(kept[0].rewrites[0].oldImageProjectRelativePath).toBe(
      "assets/foo.png"
    );
  });
});

describe("#414 File Explorer / App wiring", () => {
  const fileExplorerSource = readFileSync(
    "src/renderer/FileExplorer.tsx",
    "utf8"
  );
  const workspaceSidebarSource = readFileSync(
    "src/renderer/WorkspaceSidebar.tsx",
    "utf8"
  );
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("every move route also consults the C2 image-reference gate, Copy does not", () => {
    expect(fileExplorerSource).toContain("resolveMovedImageFiles(");
    expect(fileExplorerSource).toContain(
      "const confirmImageReferenceMoves = useCallback("
    );
    const gateCalls = fileExplorerSource.match(
      /await confirmImageReferenceMoves\(/g
    );
    expect(gateCalls?.length).toBe(3); // Move… menu, D&D, Cut/Paste
    // one combined apply, C1 + C2 merged
    expect(fileExplorerSource).toContain(
      "onApplyMoveImageRewrites?.({ relocations, completedImageMoves })"
    );
    // P0-1: rename route also gated
    expect(fileExplorerSource).toContain(
      "const confirmImageReferenceRename = useCallback("
    );
    // Follow-up: rename dry-run runs BEFORE the C2 confirmation, so a rename
    // that would fail never opens the image-reference dialog.
    expect(fileExplorerSource).toContain(
      "window.pergamum.projects.renameFileExplorerEntryPreflight("
    );
    expect(fileExplorerSource).toMatch(
      /renameFileExplorerEntryPreflight\([\s\S]{0,400}if \(!preflight\.ok\)[\s\S]{0,200}return renameFailureResult\(preflight\.reason\)[\s\S]{0,400}confirmImageReferenceRename\(/
    );
    // Copy routes never wired.
    expect(fileExplorerSource).not.toMatch(
      /performDndCopy[\s\S]{0,400}confirmImageReferenceMoves/
    );
  });

  it("WorkspaceSidebar threads the C2 gate + the combined apply", () => {
    expect(workspaceSidebarSource).toContain(
      "onFileExplorerPrepareImageReferenceMoves"
    );
    expect(workspaceSidebarSource).toContain(
      "onPrepareImageReferenceMoves={"
    );
    expect(workspaceSidebarSource).toContain("onApplyMoveImageRewrites={");
  });

  it("App filename-filters before resolving, fails planning on unreadable docs, merges C1+C2 apply", () => {
    expect(appSource).toContain("imageReferenceSearchPlan(");
    expect(appSource).toContain("documentMayReferenceMovedImage(");
    expect(appSource).toContain(
      "planMarkdownImageReferenceRewritesForImageMove("
    );
    expect(appSource).toContain("resolveImageReferenceMoveUpdateChoice(");
    expect(appSource).toContain(
      "filterImageReferenceUpdatePlansToCompletedMoves("
    );
    expect(appSource).toContain("<MarkdownImageReferenceMoveUpdateDialog");
    // P1-1: read failure aborts planning (throwing reader, no silent skip)
    expect(appSource).toContain("readProjectDocumentTextOrThrow(");
    expect(appSource).toContain(
      "explorer.move.imageReferenceUpdate.status.planningFailed"
    );
    // P0-2: C2 planner told which docs move in the same operation
    expect(appSource).toContain("movedMarkdownDocuments");
    // P0-2: ONE merged apply
    expect(appSource).toContain("function handleApplyMoveImageRewrites");
    // failed docs reported by path (list), not just a count
    expect(appSource).toContain("failedDocuments.push(");
    // pending cleared at prepare start and (both pending refs) at apply start
    const prepIdx = appSource.indexOf(
      "async function handlePrepareImageReferenceMoves"
    );
    expect(
      appSource
        .slice(prepIdx, prepIdx + 300)
        .includes("pendingImageReferenceMoveUpdateRef.current = null")
    ).toBe(true);
    const applyIdx = appSource.indexOf(
      "function handleApplyMoveImageRewrites"
    );
    const applyBody = appSource.slice(applyIdx, applyIdx + 700);
    expect(
      applyBody.includes("pendingMarkdownMoveImageLinkUpdateRef.current = null")
    ).toBe(true);
    expect(
      applyBody.includes("pendingImageReferenceMoveUpdateRef.current = null")
    ).toBe(true);
  });

  it("P1-1: App exposes a clear handler and the File Explorer calls it on every non-landing path", () => {
    // The dedicated clear handler nulls BOTH pending refs.
    const clearIdx = appSource.indexOf(
      "function handleClearMoveImageRewrites"
    );
    expect(clearIdx).toBeGreaterThan(-1);
    const clearBody = appSource.slice(clearIdx, clearIdx + 260);
    expect(
      clearBody.includes("pendingMarkdownMoveImageLinkUpdateRef.current = null")
    ).toBe(true);
    expect(
      clearBody.includes("pendingImageReferenceMoveUpdateRef.current = null")
    ).toBe(true);
    expect(appSource).toContain(
      "onFileExplorerClearMoveImageRewrites={\n                        handleClearMoveImageRewrites"
    );
    // Called on: gate cancel, IPC throw, validation-not-applied, nothing
    // moved, rename preflight / execution failure, rename C2 cancel.
    const calls = (
      fileExplorerSource.match(/onClearMoveImageRewrites\?\.\(\)/g) ?? []
    ).length;
    expect(calls).toBeGreaterThanOrEqual(8);
    // The failure result helper drops the batch for a rename that did not land.
    expect(fileExplorerSource).toMatch(
      /const renameFailureResult = \([\s\S]{0,400}onClearMoveImageRewrites\?\.\(\)/
    );
  });

  it("P1-2: an inactive open document without a usable cached transaction is `failed`, not a plain-splice `updated`", () => {
    const fnIdx = appSource.indexOf(
      "async function applyImageLinkRewritesToProjectDocument"
    );
    // Bound the slice at the next top-level `async function` / `function ` decl.
    const rest = appSource.slice(fnIdx + 1);
    const endIdx = rest.search(/\n {2}(?:async )?function [A-Za-z]/);
    const body = rest.slice(0, endIdx === -1 ? 4000 : endIdx);

    // The open-document branch: no cached transaction ⟹ `failed`.
    expect(body).toMatch(/if \(!transactionResult\) \{\s*return "failed";/);
    // The Undo-less plain content-splice fallback for an OPEN document is gone.
    expect(body).not.toContain("ChangeSet.of(");
    expect(body).not.toContain("CodeMirrorText.of(");
    // The closed-document direct write is still there.
    expect(body).toContain("window.pergamum.projects.saveProjectDocument(");
  });

  it("P1-4: no literal NUL byte in the renderer glue source", () => {
    const raw = readFileSync(
      "src/renderer/markdownImageReferenceMoveUpdate.ts"
    );
    expect(raw.includes(0)).toBe(false);
    expect(
      readFileSync(
        "src/renderer/markdownImageReferenceMoveUpdate.ts",
        "utf8"
      )
    ).toContain("JSON.stringify([oldPath, newPath])");
  });
});
