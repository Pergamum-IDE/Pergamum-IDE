import { describe, expect, it } from "vitest";
import {
  fileExplorerDeleteExecutionFailureReasonKey,
  fileExplorerDeletePreviewFragment,
  fileExplorerDeleteRejectionReasonKey,
  orderFileExplorerDeleteTargets,
  type FileExplorerDeleteTarget
} from "../../src/shared/fileExplorerDelete";

function folder(relativePath: string): FileExplorerDeleteTarget {
  return {
    kind: "folder",
    relativePath,
    name: relativePath.split("/").pop() ?? relativePath,
    parentRelativePath: relativePath.split("/").slice(0, -1).join("/"),
    lastModifiedIso: null,
    sizeBytes: null,
    previewHead: null,
    previewTail: null,
    previewUnavailable: false
  };
}

function file(relativePath: string): FileExplorerDeleteTarget {
  return { ...folder(relativePath), kind: "file", sizeBytes: 0 };
}

describe("orderFileExplorerDeleteTargets (#351)", () => {
  it("puts every file before every folder", () => {
    const ordered = orderFileExplorerDeleteTargets([
      folder("A"),
      file("A/b.md"),
      folder("A/sub"),
      file("A/sub/c.md")
    ]);

    const kinds = ordered.map((t) => t.kind);
    expect(kinds).toEqual(["file", "file", "folder", "folder"]);
  });

  it("orders folders DEEPEST first, so a parent is emptied before rmdir", () => {
    const ordered = orderFileExplorerDeleteTargets([
      folder("A"),
      folder("A/b"),
      folder("A/b/c"),
      folder("A/x")
    ]);

    expect(ordered.map((t) => t.relativePath)).toEqual([
      "A/b/c",
      "A/b",
      "A/x",
      "A"
    ]);
  });

  it("is deterministic within a kind / depth (path order)", () => {
    const ordered = orderFileExplorerDeleteTargets([
      file("z.md"),
      file("a.md"),
      file("m.md")
    ]);
    expect(ordered.map((t) => t.relativePath)).toEqual([
      "a.md",
      "m.md",
      "z.md"
    ]);
  });
});

describe("fileExplorerDeletePreviewFragment (#351)", () => {
  it("collapses whitespace and returns the first 10 code points with a trailing ellipsis", () => {
    expect(
      fileExplorerDeletePreviewFragment("  Hello\n\tworld  from  Pergamum ", false)
    ).toBe("Hello worl…");
  });

  it("returns the last 10 code points with a leading ellipsis for the tail", () => {
    expect(
      fileExplorerDeletePreviewFragment("abcdefghijklmnopqrstuvwxyz", true)
    ).toBe("…qrstuvwxyz");
  });

  it("returns the whole string (no ellipsis) when it is <= 10 code points", () => {
    expect(fileExplorerDeletePreviewFragment("short", false)).toBe("short");
    expect(fileExplorerDeletePreviewFragment("short", true)).toBe("short");
  });

  it("counts by user-visible code point, not UTF-16 unit", () => {
    // 6 astral code points -> under the limit, returned whole.
    expect(fileExplorerDeletePreviewFragment("😀😁😂🤣😃😄", false)).toBe(
      "😀😁😂🤣😃😄"
    );
  });

  it("returns an empty string for a blank / whitespace-only input", () => {
    expect(fileExplorerDeletePreviewFragment("   \n\t  ", false)).toBe("");
  });
});

describe("reason -> i18n key maps (#351)", () => {
  it("maps every rejection reason to an explorer.delete.reject.* key", () => {
    for (const reason of [
      "empty-selection",
      "project-root",
      "outside-project",
      "path-traversal",
      "invalid-path",
      "reserved-or-protected",
      "symlink",
      "symlinked-path",
      "not-found",
      "unsupported-node",
      "folder-contains-protected",
      "enumeration-failed"
    ] as const) {
      expect(fileExplorerDeleteRejectionReasonKey(reason)).toMatch(
        /^explorer\.delete\.reject\./
      );
    }
  });

  it("maps every execution failure reason to an explorer.delete.failure.* key", () => {
    for (const reason of [
      "permission-denied",
      "not-empty",
      "busy",
      "reserved-or-protected",
      "outside-project",
      "symlink",
      "target-changed",
      "delete-failed"
    ] as const) {
      expect(fileExplorerDeleteExecutionFailureReasonKey(reason)).toMatch(
        /^explorer\.delete\.failure\./
      );
    }
  });
});
