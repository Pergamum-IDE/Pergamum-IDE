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

  it("accepts a folder source (#340: folder Move)", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Drafts"],
        destinationFolderRelativePath: "Archive"
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      sourceRelativePath: "Drafts",
      destinationRelativePath: "Archive/Drafts",
      isDirectory: true
    });
  });

  it("#340: collects moved project-document descendants of a folder source", async () => {
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Drafts"],
        destinationFolderRelativePath: "Archive",
        knownProjectDocumentRelativePaths: [
          "Drafts/draft-01.md",
          "chapter-01.md"
        ]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].movedProjectDocuments).toEqual([
      {
        oldRelativePath: "Drafts/draft-01.md",
        newRelativePath: "Archive/Drafts/draft-01.md"
      }
    ]);
  });

  it("#340: rejects the project root as a folder source", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: [""],
            destinationFolderRelativePath: "Archive"
          })
        )
      )
    ).toEqual(["source-is-project-root"]);
  });

  it("#340: rejects a destination inside the folder source", async () => {
    await fs.mkdir(path.join(projectRoot, "Drafts", "Nested"));
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts"],
            destinationFolderRelativePath: "Drafts/Nested"
          })
        )
      )
    ).toEqual(["destination-inside-source"]);
  });

  it("#340: rejects a destination equal to the folder source", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts"],
            destinationFolderRelativePath: "Drafts"
          })
        )
      )
    ).toEqual(["destination-inside-source"]);
  });

  it("#340: rejects an ancestor + descendant mixed selection", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts", "Drafts/draft-01.md"],
            destinationFolderRelativePath: "Archive"
          })
        )
      )
    ).toEqual(["contains-ancestor-and-descendant"]);
  });

  it("#340: rejects a folder Move whose destination already has that name", async () => {
    await fs.mkdir(path.join(projectRoot, "Archive", "Drafts"));
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts"],
            destinationFolderRelativePath: "Archive"
          })
        )
      )
    ).toEqual(["destination-conflict"]);
  });

  it("#340: rejects a folder Move when a document in the subtree is dirty and open", async () => {
    expect(
      reasons(
        await validateMoveEntries(
          input({
            sourceRelativePaths: ["Drafts"],
            destinationFolderRelativePath: "Archive",
            dirtyProjectDocumentRelativePaths: ["Drafts/draft-01.md"]
          })
        )
      )
    ).toEqual(["source-dirty-open-document"]);
  });

  it("#340: accepts a folder Move whose subtree has only non-Markdown files", async () => {
    await fs.mkdir(path.join(projectRoot, "Assets"));
    await fs.writeFile(
      path.join(projectRoot, "Assets", "cover.png"),
      "x\n",
      "utf8"
    );
    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["Assets"],
        destinationFolderRelativePath: "Archive",
        knownProjectDocumentRelativePaths: []
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0].movedProjectDocuments).toEqual([]);
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
        ),
        isDirectory: false,
        movedProjectDocuments: []
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

describe("validateMoveEntries (#340) — intra-batch destination collisions", () => {
  it("rejects two files in the batch that resolve to the same destination", async () => {
    await fs.mkdir(path.join(projectRoot, "A"));
    await fs.mkdir(path.join(projectRoot, "B"));
    await fs.writeFile(path.join(projectRoot, "A", "foo.md"), "a\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "B", "foo.md"), "b\n", "utf8");

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["A/foo.md", "B/foo.md"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(result.ok).toBe(false);
    expect(reasons(result)).toEqual([
      "batch-destination-conflict",
      "batch-destination-conflict"
    ]);
    // Every colliding source is named so the failure list can show them.
    expect(
      result.ok
        ? []
        : result.errors.map((error) => error.sourceRelativePath).sort()
    ).toEqual(["A/foo.md", "B/foo.md"]);
  });

  it("rejects two folders in the batch that resolve to the same destination", async () => {
    await fs.mkdir(path.join(projectRoot, "A", "Notes"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, "B", "Notes"), { recursive: true });

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["A/Notes", "B/Notes"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(reasons(result)).toEqual([
      "batch-destination-conflict",
      "batch-destination-conflict"
    ]);
  });

  it("rejects a file and a folder with the same basename resolving to the same destination", async () => {
    await fs.mkdir(path.join(projectRoot, "A"));
    await fs.mkdir(path.join(projectRoot, "B", "foo"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "A", "foo"), "a\n", "utf8");

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["A/foo", "B/foo"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(reasons(result)).toEqual([
      "batch-destination-conflict",
      "batch-destination-conflict"
    ]);
  });

  it("folds case / NFC when comparing batch destinations", async () => {
    await fs.mkdir(path.join(projectRoot, "A"));
    await fs.mkdir(path.join(projectRoot, "B"));
    await fs.writeFile(path.join(projectRoot, "A", "Foo.md"), "a\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "B", "foo.md"), "b\n", "utf8");

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["A/Foo.md", "B/foo.md"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(reasons(result)).toEqual([
      "batch-destination-conflict",
      "batch-destination-conflict"
    ]);
  });

  it("does not flag distinct destinations in the same batch", async () => {
    await fs.mkdir(path.join(projectRoot, "A"));
    await fs.mkdir(path.join(projectRoot, "B"));
    await fs.writeFile(path.join(projectRoot, "A", "foo.md"), "a\n", "utf8");
    await fs.writeFile(path.join(projectRoot, "B", "bar.md"), "b\n", "utf8");

    const result = await validateMoveEntries(
      input({
        sourceRelativePaths: ["A/foo.md", "B/bar.md"],
        destinationFolderRelativePath: "Archive"
      })
    );

    expect(result.ok).toBe(true);
  });
});

describe("Move validation pure helpers (#324)", () => {
  it("exposes the full reason taxonomy", () => {
    expect([...MOVE_ENTRIES_VALIDATION_ERROR_REASONS].sort()).toEqual(
      [
        "batch-destination-conflict",
        "contains-ancestor-and-descendant",
        "destination-conflict",
        "destination-inside-source",
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
        "source-is-project-root",
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
