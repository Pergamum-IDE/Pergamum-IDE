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

describe("moveEntries — module boundaries (#325 / #326)", () => {
  it("stays free of Recovery Store internals, IPC, and renderer code; mutates only via fs.rename", () => {
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

    // #326 re-key is an injected hook only — never a direct call into the
    // Recovery Store. A type-only import from the shared recoveryDocument
    // module is fine; the Store module / helper are not touched.
    expect(source).not.toContain("rekeyRecoveryDocumentPaths(");
    expect(importLines.join("\n")).not.toMatch(/recoveryDocumentPathRekey/);
    expect(importLines.join("\n")).not.toMatch(/recoveryStore/i);
    expect(importLines.join("\n")).not.toMatch(/better-sqlite3/);
    // No IPC / renderer wiring.
    expect(importLines.join("\n")).not.toMatch(/electron|\.\.\/renderer/);
    expect(source).not.toContain("ipcMain.handle");
    // The ONLY filesystem call is fs.rename.
    expect([...new Set(fsCalls)]).toEqual(["rename"]);
  });
});

describe("moveEntries (#326) — Recovery re-key integration", () => {
  function okRekey(): {
    ok: true;
    rekeyed: number;
    noRow: number;
    collisions: number;
    errors: number;
    outcomes: [];
  } {
    return {
      ok: true,
      rekeyed: 0,
      noRow: 0,
      collisions: 0,
      errors: 0,
      outcomes: []
    };
  }

  it("does not call Recovery re-key on a validation failure", async () => {
    const rekeyRecoveryPaths = vi.fn(() => okRekey());

    const result = await moveEntries(
      input({ sourceRelativePaths: ["missing.md"] }),
      { rekeyRecoveryPaths }
    );

    expect(rekeyRecoveryPaths).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect("recoveryRekey" in result).toBe(false);
  });

  it("does not call Recovery re-key when every rename failed", async () => {
    const rekeyRecoveryPaths = vi.fn(() => okRekey());

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md"] }),
      {
        rename: () => {
          const error = new Error("x") as NodeJS.ErrnoException;
          error.code = "EPERM";
          return Promise.reject(error);
        },
        rekeyRecoveryPaths
      }
    );

    expect(rekeyRecoveryPaths).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.successfulPathPairs).toEqual([]);
    expect(result.recoveryRekey).toEqual({
      skipped: "no-successful-path-pairs"
    });
  });

  it("calls Recovery re-key with ALL successful path pairs on a full success", async () => {
    const rekeyRecoveryPaths = vi.fn(() => okRekey());

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rekeyRecoveryPaths }
    );

    expect(result.ok).toBe(true);
    expect(rekeyRecoveryPaths).toHaveBeenCalledTimes(1);
    expect(rekeyRecoveryPaths).toHaveBeenCalledWith([
      {
        oldAbsolutePath: path.join(projectRoot, "a.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "a.md")
      },
      {
        oldAbsolutePath: path.join(projectRoot, "b.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "b.md")
      },
      {
        oldAbsolutePath: path.join(projectRoot, "c.md"),
        newAbsolutePath: path.join(projectRoot, "Dest", "c.md")
      }
    ]);
    // The pair list handed to the caller is unchanged by re-key.
    expect(result.successfulPathPairs).toEqual(
      rekeyRecoveryPaths.mock.calls[0][0]
    );
  });

  it("calls Recovery re-key with the moved entries only on a partial failure", async () => {
    const rekeyRecoveryPaths = vi.fn(() => okRekey());
    const rename: NonNullable<MoveEntriesDeps["rename"]> = async (
      oldPath,
      newPath
    ) => {
      if (path.basename(oldPath) === "b.md") {
        const error = new Error("x") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      await fs.rename(oldPath, newPath);
    };

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md", "c.md"] }),
      { rename, rekeyRecoveryPaths }
    );

    expect(result.ok).toBe(false);
    expect(rekeyRecoveryPaths).toHaveBeenCalledWith([
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

  it("keeps an all-successful Move ok:true when Recovery re-key reports failure", async () => {
    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md"] }),
      {
        rekeyRecoveryPaths: () => ({
          ok: true,
          rekeyed: 0,
          noRow: 0,
          collisions: 1,
          errors: 2,
          outcomes: []
        })
      }
    );

    expect(result.ok).toBe(true);
    expect(result.recoveryRekey).toMatchObject({
      ok: true,
      collisions: 1,
      errors: 2
    });
  });

  it("keeps an all-successful Move ok:true when the re-key hook throws", async () => {
    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md"] }),
      {
        rekeyRecoveryPaths: () => {
          throw new Error("recovery store exploded");
        }
      }
    );

    expect(result.ok).toBe(true);
    expect(result.validation).toEqual({ ok: true });
    expect(result.recoveryRekey).toEqual({ failed: "threw" });
    // The move itself really happened.
    expect(await exists("Dest/a.md")).toBe(true);
  });

  it("does not alter partial-failure semantics when the re-key hook throws", async () => {
    const rename: NonNullable<MoveEntriesDeps["rename"]> = async (
      oldPath,
      newPath
    ) => {
      if (path.basename(oldPath) === "b.md") {
        const error = new Error("x") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      await fs.rename(oldPath, newPath);
    };

    const result = await moveEntries(
      input({ sourceRelativePaths: ["a.md", "b.md"] }),
      {
        rename,
        rekeyRecoveryPaths: () => Promise.reject(new Error("boom"))
      }
    );

    expect(result.ok).toBe(false); // still partial failure, from execution only
    expect(result.validation).toEqual({ ok: true });
    expect(result.results.map((r) => [r.sourceRelativePath, r.status])).toEqual([
      ["a.md", "moved"],
      ["b.md", "failed"]
    ]);
    expect(result.recoveryRekey).toEqual({ failed: "threw" });
  });

  it("passes a store-skipped re-key result through as diagnostic metadata", async () => {
    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }), {
      rekeyRecoveryPaths: () => ({ ok: false, skipped: "not-owner" })
    });

    expect(result.ok).toBe(true);
    expect(result.recoveryRekey).toEqual({ ok: false, skipped: "not-owner" });
  });

  it("omits recoveryRekey entirely when no hook is supplied", async () => {
    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }));

    expect(result.ok).toBe(true);
    expect("recoveryRekey" in result).toBe(false);
  });

  it("awaits an async re-key hook", async () => {
    const rekeyRecoveryPaths = vi.fn(
      async (): Promise<ReturnType<typeof okRekey>> => {
        await Promise.resolve();
        return okRekey();
      }
    );

    const result = await moveEntries(input({ sourceRelativePaths: ["a.md"] }), {
      rekeyRecoveryPaths
    });

    expect(rekeyRecoveryPaths).toHaveBeenCalledTimes(1);
    expect(result.recoveryRekey).toMatchObject({ ok: true });
  });
});
