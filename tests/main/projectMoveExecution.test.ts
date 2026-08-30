import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOVE_ENTRY_EXECUTION_FAILURE_REASONS } from "../../src/shared/projectMove";
import {
  moveEntries,
  type MoveEntriesDeps
} from "../../src/main/projectMoveExecution";
import type { ValidateMoveEntriesInput } from "../../src/main/projectMoveValidation";

let projectRoot = "";

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-move-exec-"));
  await fs.writeFile(path.join(projectRoot, "a.md"), "# a\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "b.md"), "# b\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "c.md"), "# c\n", "utf8");
  await fs.mkdir(path.join(projectRoot, "Dest"));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true, maxRetries: 3 });
});

function input(
  overrides: Partial<ValidateMoveEntriesInput> = {}
): ValidateMoveEntriesInput {
  return {
    projectRootPath: projectRoot,
    sourceRelativePaths: ["a.md"],
    destinationFolderRelativePath: "Dest",
    dirtyProjectDocumentRelativePaths: [],
    ...overrides
  };
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("moveEntries (#325) — validation gate", () => {
  it("returns validation errors and never calls fs.rename on a validation failure", async () => {
    const rename = vi.fn<Parameters<NonNullable<MoveEntriesDeps["rename"]>>, Promise<void>>(
      () => Promise.resolve()
    );

    const result = await moveEntries(
      input({ sourceRelativePaths: ["missing.md"] }),
      { rename }
    );

    expect(result.ok).toBe(false);
    expect(result.validation.ok).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.successfulPathPairs).toEqual([]);
    expect(rename).not.toHaveBeenCalled();
  });

  it("does not mutate the filesystem when validation fails", async () => {
    const before = (await fs.readdir(projectRoot)).sort();
    const destBefore = (await fs.readdir(path.join(projectRoot, "Dest"))).sort();

    await moveEntries(
      input({ sourceRelativePaths: ["a.md", "../escape.md"] })
    );

    expect((await fs.readdir(projectRoot)).sort()).toEqual(before);
    expect(
      (await fs.readdir(path.join(projectRoot, "Dest"))).sort()
    ).toEqual(destBefore);
  });
});

describe("moveEntries (#325) — successful execution", () => {
  it("moves a single file with a real fs.rename", async () => {
    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }));

    expect(result.ok).toBe(true);
    expect(result.validation).toEqual({ ok: true });
    expect(result.results).toEqual([
      {
        status: "moved",
        sourceRelativePath: "a.md",
        destinationRelativePath: "Dest/a.md",
        sourceAbsolutePath: path.join(projectRoot, "a.md"),
        destinationAbsolutePath: path.join(projectRoot, "Dest", "a.md")
      }
    ]);
    expect(await exists("a.md")).toBe(false);
    expect(await exists("Dest/a.md")).toBe(true);
  });

  it("moves multiple files with sequential renames in input order", async () => {
    const calls: Array<[string, string]> = [];
    const rename: MoveEntriesDeps["rename"] = async (oldPath, newPath) => {
      calls.push([path.basename(oldPath), path.basename(newPath)]);
      await fs.rename(oldPath, newPath);
    };

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rename }
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      ["a.md", "a.md"],
      ["b.md", "b.md"],
      ["c.md", "c.md"]
    ]);
    expect(result.results.map((r) => r.status)).toEqual([
      "moved",
      "moved",
      "moved"
    ]);
    expect(await exists("Dest/a.md")).toBe(true);
    expect(await exists("Dest/b.md")).toBe(true);
    expect(await exists("Dest/c.md")).toBe(true);
  });

  it("returns successfulPathPairs for every moved entry (old -> new absolute)", async () => {
    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md"] })
    );

    expect(result.successfulPathPairs).toEqual([
      {
        oldAbsolutePath: path.join(projectRoot, "a.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "a.md")
      },
      {
        oldAbsolutePath: path.join(projectRoot, "b.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "b.md")
      }
    ]);
  });

  it("includes relative and absolute source/destination paths in each result", async () => {
    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }));
    const [entry] = result.results;

    expect(entry).toMatchObject({
      sourceRelativePath: "a.md",
      destinationRelativePath: "Dest/a.md",
      sourceAbsolutePath: path.join(projectRoot, "a.md"),
      destinationAbsolutePath: path.join(projectRoot, "Dest", "a.md")
    });
  });
});

describe("moveEntries (#325) — partial failure, no rollback", () => {
  function failingSecondEntryRename(): {
    rename: NonNullable<MoveEntriesDeps["rename"]>;
    calls: string[];
  } {
    const calls: string[] = [];
    const rename: NonNullable<MoveEntriesDeps["rename"]> = async (
      oldPath,
      newPath
    ) => {
      calls.push(path.basename(oldPath));
      if (path.basename(oldPath) === "b.md") {
        const error = new Error("boom") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      await fs.rename(oldPath, newPath);
    };
    return { rename, calls };
  }

  it("keeps going after a failed entry and reports per-entry status", async () => {
    const { rename, calls } = failingSecondEntryRename();

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rename }
    );

    expect(calls).toEqual(["a.md", "b.md", "c.md"]); // c.md still attempted
    expect(result.ok).toBe(false);
    expect(result.validation).toEqual({ ok: true });
    expect(result.results.map((r) => [r.sourceRelativePath, r.status])).toEqual([
      ["a.md", "moved"],
      ["b.md", "failed"],
      ["c.md", "moved"]
    ]);
  });

  it("does not roll back the entries that already moved", async () => {
    const { rename } = failingSecondEntryRename();

    await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rename }
    );

    expect(await exists("Dest/a.md")).toBe(true); // moved, left in place
    expect(await exists("Dest/c.md")).toBe(true); // moved, left in place
    expect(await exists("b.md")).toBe(true); // never moved
    expect(await exists("Dest/b.md")).toBe(false);
  });

  it("returns successfulPathPairs for the moved entries only", async () => {
    const { rename } = failingSecondEntryRename();

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rename }
    );

    expect(result.successfulPathPairs).toEqual([
      {
        oldAbsolutePath: path.join(projectRoot, "a.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "a.md")
      },
      {
        oldAbsolutePath: path.join(projectRoot, "c.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "c.md")
      }
    ]);
  });

  it("partial failure returns ok:false with validation.ok:true", async () => {
    const { rename } = failingSecondEntryRename();

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md"] }),
      { rename }
    );

    expect(result.ok).toBe(false);
    expect(result.validation).toEqual({ ok: true });
  });
});

describe("moveEntries (#325) — error mapping", () => {
  function renameThrowing(code: string | undefined): NonNullable<
    MoveEntriesDeps["rename"]
  > {
    return () => {
      const error = new Error("x") as NodeJS.ErrnoException;
      if (code !== undefined) {
        error.code = code;
      }
      return Promise.reject(error);
    };
  }

  it("maps ENOENT to source-missing-during-execution", async () => {
    const result = await moveEntries(input(), {
      rename: renameThrowing("ENOENT")
    });
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "source-missing-during-execution"
    });
  });

  it("maps EEXIST / ENOTEMPTY to destination-conflict-during-execution", async () => {
    for (const code of ["EEXIST", "ENOTEMPTY"]) {
      const result = await moveEntries(input(), {
        rename: renameThrowing(code)
      });
      expect(result.results[0]).toMatchObject({
        status: "failed",
        reason: "destination-conflict-during-execution"
      });
    }
  });

  it("maps EACCES / EPERM to permission-denied", async () => {
    for (const code of ["EACCES", "EPERM"]) {
      const result = await moveEntries(input(), {
        rename: renameThrowing(code)
      });
      expect(result.results[0]).toMatchObject({
        status: "failed",
        reason: "permission-denied"
      });
    }
  });

  it("maps an unknown / codeless error to rename-failed", async () => {
    const unknownCode = await moveEntries(input(), {
      rename: renameThrowing("EBUSY")
    });
    const noCode = await moveEntries(input(), {
      rename: renameThrowing(undefined)
    });

    expect(unknownCode.results[0]).toMatchObject({
      status: "failed",
      reason: "rename-failed"
    });
    expect(noCode.results[0]).toMatchObject({
      status: "failed",
      reason: "rename-failed"
    });
  });

  it("exposes the full execution failure reason taxonomy", () => {
    expect([...MOVE_ENTRY_EXECUTION_FAILURE_REASONS].sort()).toEqual(
      [
        "destination-conflict-during-execution",
        "permission-denied",
        "rename-failed",
        "source-missing-during-execution"
      ].sort()
    );
  });
});

describe("moveEntries (#325) — real conflict at execution time", () => {
  it("surfaces a same-name file created after validation as a per-entry failure", async () => {
    // A rename that recreates the source name in Dest just before the real
    // rename → EEXIST on a platform that rejects it (or overwrite on POSIX).
    const rename: NonNullable<MoveEntriesDeps["rename"]> = async (
      oldPath,
      newPath
    ) => {
      await fs.writeFile(newPath, "squatter\n", "utf8");
      // node fs.rename overwrites a file target on POSIX; force the conflict
      // shape used by the mapping test via an explicit guard instead.
      const error = new Error("exists") as NodeJS.ErrnoException;
      error.code = "EEXIST";
      throw error;
    };

    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }), {
      rename
    });

    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "destination-conflict-during-execution"
    });
    expect(result.successfulPathPairs).toEqual([]);
    // Source untouched (we threw before any real move).
    expect(await exists("a.md")).toBe(true);
  });
});

describe("moveEntries (#325) — module boundaries", () => {
  it("imports no Recovery / IPC / renderer module and mutates only via fs.rename", () => {
    const source = require("node:fs").readFileSync(
      "src/main/projectMoveExecution.ts",
      "utf8"
    ) as string;
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "));
    const fsCalls = Array.from(
      source.matchAll(/\bnodeFs\.(\w+)/g),
      (match) => match[1]
    );

    // No Recovery re-key (#326 consumes `successfulPathPairs` instead).
    expect(importLines.join("\n")).not.toMatch(/recover/i);
    expect(source).not.toContain("rekeyRecoveryDocumentPaths");
    // No IPC / renderer wiring.
    expect(importLines.join("\n")).not.toMatch(/electron|\.\.\/renderer/);
    expect(source).not.toContain("ipcMain.handle");
    // The ONLY filesystem call is fs.rename.
    expect([...new Set(fsCalls)]).toEqual(["rename"]);
  });
});
