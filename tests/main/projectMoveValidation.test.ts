import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MOVE_DESTINATION_MAX_ABSOLUTE_PATH_LENGTH,
  MOVE_ENTRIES_VALIDATION_ERROR_REASONS,
  isMoveDestinationPathTooLong,
  moveEntryNamesConflict,
  type MoveEntriesValidationResult
} from "../../src/shared/projectMove";
import {
  moveEntryParentRelativePath,
  normalizeMoveDestinationFolderRelativePath,
  normalizeMoveSourceRelativePath,
  validateMoveEntries,
  type ValidateMoveEntriesInput
} from "../../src/main/projectMoveValidation";

let projectRoot = "";

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-move-"));
  // A small project tree:
  //   chapter-01.md
  //   chapter-02.md
  //   notes.txt
  //   Drafts/           (folder, has draft-01.md)
  //   Drafts/draft-01.md
  //   Archive/          (empty folder)
  //   Chapters/         (folder, has chapter-01.md → name collision fixture)
  //   Chapters/chapter-01.md
  await fs.writeFile(path.join(projectRoot, "chapter-01.md"), "# 1\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "chapter-02.md"), "# 2\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "notes.txt"), "x\n", "utf8");
  await fs.mkdir(path.join(projectRoot, "Drafts"));
  await fs.writeFile(
    path.join(projectRoot, "Drafts", "draft-01.md"),
    "# d\n",
    "utf8"
  );
  await fs.mkdir(path.join(projectRoot, "Archive"));
  await fs.mkdir(path.join(projectRoot, "Chapters"));
  await fs.writeFile(
    path.join(projectRoot, "Chapters", "chapter-01.md"),
    "# c\n",
    "utf8"
  );
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 3 });
});

function input(
  overrides: Partial<ValidateMoveEntriesInput> = {}
): ValidateMoveEntriesInput {
  return {
    projectRootPath: projectRoot,
    sourceRelativePaths: ["chapter-01.md"],
    destinationFolderRelativePath: "Drafts",
    dirtyProjectDocumentRelativePaths: [],
    ...overrides
  };
}

function reasons(result: MoveEntriesValidationResult): string[] {
  return result.ok ? [] : result.errors.map((error) => error.reason).sort();
}

describe("validateMoveEntries (#324) — source rules", () => {
  it("rejects an empty source list", async () => {
    expect(
      reasons(await validateMoveEntries(input({ sourceRelativePaths: [] })))
    ).toEqual(["empty-sources"]);
  });

  it("rejects duplicate sources (case- and NFC-insensitive)", async () => {
    const result = await validateMoveEntries(
      input({ sourceRelativePaths: ["chapter-01.md", "Chapter-01.md"] })
    );
    expect(reasons(result)).toEqual(["duplicate-source"]);
  });

  it("rejects an absolute source path", async () => {
    const windowsAbsolute = await validateMoveEntries(
      input({ sourceRelativePaths: ["C:\\outside.md"] })
    );
    const posixAbsolute = await validateMoveEntries(
      input({ sourceRelativePaths: ["/absolute/path.md"] })
    );

    expect(reasons(windowsAbsolute)).toEqual(["source-outside-project"]);
    expect(reasons(posixAbsolute)).toEqual(["source-outside-project"]);
  });

  it("rejects a path-traversal source", async () => {
    const parentEscape = await validateMoveEntries(
      input({ sourceRelativePaths: ["../outside.md"] })
    );
    const deepEscape = await validateMoveEntries(
      input({ sourceRelativePaths: ["Drafts/../../outside.md"] })
    );

    expect(reasons(parentEscape)).toEqual(["path-traversal"]);
    expect(reasons(deepEscape)).toEqual(["path-traversal"]);
  });

  it("rejects a missing source", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({ sourceRelativePaths: ["does-not-exist.md"] })
        )
      )
    ).toEqual(["source-not-found"]);
  });

  it("rejects a folder source (files only in Move v1)", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts"],
            destinationFolderRelativePath: "Archive"
          })
        )
      )
    ).toEqual(["source-not-file"]);
  });

  it("rejects a dirty open document source", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        dirtyProjectDocumentRelativePaths: ["chapter-01.md"]
      })
    );
    expect(reasons(result)).toEqual(["source-dirty-open-document"]);
  });

  it("matches dirty paths case- / separator-insensitively", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Drafts/draft-01.md"],
        destinationFolderRelativePath: "Archive",
        dirtyProjectDocumentRelativePaths: ["drafts\\Draft-01.md"]
      })
    );
    expect(reasons(result)).toEqual(["source-dirty-open-document"]);
  });
});

describe("validateMoveEntries (#324) — destination rules", () => {
  it("rejects a destination outside the project", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({ destinationFolderRelativePath: "C:\\elsewhere" })
        )
      )
    ).toEqual(["destination-outside-project"]);
  });

  it("rejects a missing destination folder", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({ destinationFolderRelativePath: "NoSuchFolder" })
        )
      )
    ).toEqual(["destination-not-found"]);
  });

  it("rejects a destination that exists but is a file", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({ destinationFolderRelativePath: "chapter-02.md" })
        )
      )
    ).toEqual(["destination-not-folder"]);
  });

  it("accepts the project root destination \"\"", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Drafts/draft-01.md"],
        destinationFolderRelativePath: ""
      })
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries[0].destinationRelativePath).toBe(
      "draft-01.md"
    );
  });

  it("rejects a null destination (untrusted-input shape)", async () => {
    const result = await validateMoveEntries(
      input({
        destinationFolderRelativePath: null as unknown as string
      })
    );
    expect(reasons(result)).toEqual(["invalid-path"]);
  });
});

describe("validateMoveEntries (#324) — same-parent and conflict ordering", () => {
  it("rejects a source already in the destination folder as same-parent (before conflict)", async () => {
    // chapter-01.md → project root, where chapter-01.md already lives.
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        destinationFolderRelativePath: ""
      })
    );
    expect(reasons(result)).toEqual(["same-parent"]);
  });

  it("rejects a genuine destination conflict", async () => {
    // Chapters/ already contains chapter-01.md.
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        destinationFolderRelativePath: "Chapters"
      })
    );
    expect(reasons(result)).toEqual(["destination-conflict"]);
  });

  it("treats a conflict as case-insensitive", async () => {
    await fs.writeFile(
      path.join(projectRoot, "Archive", "Chapter-01.MD"),
      "x\n",
      "utf8"
    );
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        destinationFolderRelativePath: "Archive"
      })
    );
    expect(reasons(result)).toEqual(["destination-conflict"]);
  });

  it("treats a conflict as NFC-normalized", async () => {
    const nfc = "こんにちは.md".normalize("NFC");
    const nfd = "こんにちは.md".normalize("NFD");
    await fs.writeFile(path.join(projectRoot, nfc), "x\n", "utf8");
    await fs.writeFile(
      path.join(projectRoot, "Archive", nfd),
      "x\n",
      "utf8"
    );

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: [nfc],
        destinationFolderRelativePath: "Archive"
      })
    );
    expect(reasons(result)).toEqual(["destination-conflict"]);
  });
});

describe("validateMoveEntries (#324) — success and all-or-nothing", () => {
  it("passes a single valid file move and returns absolute paths", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        destinationFolderRelativePath: "Drafts"
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([
      {
        sourceRelativePath: "chapter-01.md",
        destinationFolderRelativePath: "Drafts",
        destinationRelativePath: "Drafts/chapter-01.md",
        sourceAbsolutePath: path.join(projectRoot, "chapter-01.md"),
        destinationAbsolutePath: path.join(
          projectRoot,
          "Drafts",
          "chapter-01.md"
        )
      }
    ]);
  });

  it("passes a multi-file move", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md", "chapter-02.md", "notes.txt"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.entries.map((e) => e.sourceRelativePath)).toEqual(
      ["chapter-01.md", "chapter-02.md", "notes.txt"]
    );
  });

  it("normalizes Windows separators in accepted sources", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Drafts\\draft-01.md"],
        destinationFolderRelativePath: "Archive"
      })
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.entries[0].sourceRelativePath).toBe(
      "Drafts/draft-01.md"
    );
  });

  it("fails the whole batch when one source is invalid, returning no entries", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md", "missing.md"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(result.ok).toBe(false);
    expect(reasons(result)).toEqual(["source-not-found"]);
    expect("entries" in result).toBe(false);
  });

  it("reports one error per distinct failing source", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["missing-a.md", "missing-b.md"],
        destinationFolderRelativePath: "Archive"
      })
    );
    expect(reasons(result)).toEqual(["source-not-found", "source-not-found"]);
  });

  it("does not mutate the filesystem", async () => {
    const before = (await fs.readdir(projectRoot)).sort();
    const draftsBefore = (
      await fs.readdir(path.join(projectRoot, "Drafts"))
    ).sort();

    await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md", "chapter-02.md"],
        destinationFolderRelativePath: "Drafts"
      })
    );
    // Also exercise a rejecting path.
    await validateMoveEntries(
      input({ sourceRelativePaths: ["../x.md"] })
    );

    expect((await fs.readdir(projectRoot)).sort()).toEqual(before);
    expect(
      (await fs.readdir(path.join(projectRoot, "Drafts"))).sort()
    ).toEqual(draftsBefore);
  });
});

describe("Move validation pure helpers (#324)", () => {
  it("exposes the full reason taxonomy", () => {
    expect([...MOVE_ENTRIES_VALIDATION_ERROR_REASONS].sort()).toEqual(
      [
        "destination-conflict",
        "destination-not-folder",
        "destination-not-found",
        "destination-outside-project",
        "destination-path-too-long",
        "duplicate-source",
        "empty-sources",
        "invalid-path",
        "path-traversal",
        "same-parent",
        "source-dirty-open-document",
        "source-not-file",
        "source-not-found",
        "source-outside-project"
      ].sort()
    );
  });

  it("moveEntryParentRelativePath returns the parent folder, \"\" for root level", () => {
    expect(moveEntryParentRelativePath("c.md")).toBe("");
    expect(moveEntryParentRelativePath("a/b/c.md")).toBe("a/b");
  });

  it("normalizeMoveSourceRelativePath classifies bad input", () => {
    expect(normalizeMoveSourceRelativePath("")).toMatchObject({
      ok: false,
      reason: "invalid-path"
    });
    expect(normalizeMoveSourceRelativePath("a/../b.md")).toMatchObject({
      ok: false,
      reason: "path-traversal"
    });
    expect(normalizeMoveSourceRelativePath("/x.md")).toMatchObject({
      ok: false,
      reason: "source-outside-project"
    });
    expect(normalizeMoveSourceRelativePath("a\\b.md")).toEqual({
      ok: true,
      relativePath: "a/b.md"
    });
    expect(normalizeMoveSourceRelativePath(".git/config")).toMatchObject({
      ok: false,
      reason: "invalid-path"
    });
  });

  it("normalizeMoveDestinationFolderRelativePath accepts \"\" as the project root", () => {
    expect(normalizeMoveDestinationFolderRelativePath("")).toEqual({
      ok: true,
      relativePath: ""
    });
    expect(normalizeMoveDestinationFolderRelativePath("a/./b")).toMatchObject({
      ok: false,
      reason: "path-traversal"
    });
  });

  it("moveEntryNamesConflict folds case and Unicode form", () => {
    expect(moveEntryNamesConflict("work.md", "Work.md")).toBe(true);
    expect(
      moveEntryNamesConflict(
        "café.md".normalize("NFC"),
        "café.md".normalize("NFD")
      )
    ).toBe(true);
    expect(moveEntryNamesConflict("work.md", "notes.md")).toBe(false);
  });

  it("isMoveDestinationPathTooLong uses the documented ceiling", () => {
    expect(MOVE_DESTINATION_MAX_ABSOLUTE_PATH_LENGTH).toBe(260);
    expect(isMoveDestinationPathTooLong("a".repeat(260))).toBe(false);
    expect(isMoveDestinationPathTooLong("a".repeat(261))).toBe(true);
  });
});

describe("validateMoveEntries (#324) — destination path length", () => {
  // Creating a genuinely > 260-char real path is not portable (Windows
  // mkdir / writeFile themselves ENAMETOOLONG), so length is proven by the
  // focused `isMoveDestinationPathTooLong` test above; here we only check
  // that `validateMoveEntries` routes a normal case through without a
  // spurious length rejection.
  it("does not flag a normal-length destination path", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["chapter-01.md"],
        destinationFolderRelativePath: "Drafts"
      })
    );
    expect(reasons(result)).not.toContain("destination-path-too-long");
    expect(result.ok).toBe(true);
  });
});
