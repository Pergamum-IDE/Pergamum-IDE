import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import {
  executeCopyPlan,
  type ExecuteCopyPlanDeps
} from "../../src/main/projectCopyExecution";
import type {
  FileExplorerCopyPlan,
  FileExplorerCopyPlanRow
} from "../../src/shared/projectCopy";

const PROJECT_ROOT = path.resolve("/mem/project");

type MemNode =
  | { kind: "file" }
  | { kind: "dir"; children: Record<string, MemNode> }
  | { kind: "symlink" }
  | { kind: "other" };

function dir(children: Record<string, MemNode> = {}): MemNode {
  return { kind: "dir", children };
}
function file(): MemNode {
  return { kind: "file" };
}
function symlink(): MemNode {
  return { kind: "symlink" };
}

function resolveNode(root: MemNode, absolutePath: string): MemNode | null {
  const rel = path.relative(PROJECT_ROOT, absolutePath);
  if (rel === "") {
    return root;
  }
  if (rel.startsWith("..")) {
    return null;
  }
  let node: MemNode = root;
  for (const segment of rel.split(path.sep)) {
    if (node.kind !== "dir" || !(segment in node.children)) {
      return null;
    }
    node = node.children[segment];
  }
  return node;
}

function row(
  overrides: Partial<FileExplorerCopyPlanRow> = {}
): FileExplorerCopyPlanRow {
  return {
    sourceRelativePath: "chapter.md",
    sourceName: "chapter.md",
    sourceKind: "file",
    sourceSizeBytes: 10,
    sourceModifiedAt: null,
    destinationName: "chapter copy.md",
    destinationRelativePath: "Archive/chapter copy.md",
    wasAutoRenamed: false,
    collisionSizeBytes: null,
    collisionModifiedAt: null,
    status: "ready",
    ...overrides
  };
}

function plan(rows: FileExplorerCopyPlanRow[]): FileExplorerCopyPlan {
  return {
    planId: "plan-1",
    destinationFolderRelativePath: "Archive",
    rows,
    hasCollisions: rows.some((r) => r.status === "will-auto-rename"),
    hasBlockingIssues: rows.some((r) => r.status === "blocked")
  };
}

function makeDeps(
  root: MemNode,
  cpImpl?: (src: string, dest: string) => Promise<void>
): { deps: ExecuteCopyPlanDeps; cp: ReturnType<typeof vi.fn> } {
  const cp = vi.fn(cpImpl ?? (async () => undefined));
  const deps: ExecuteCopyPlanDeps = {
    lstat: async (targetPath) => {
      const node = resolveNode(root, path.resolve(targetPath));
      if (!node) {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return {
        isFile: () => node.kind === "file",
        isDirectory: () => node.kind === "dir",
        isSymbolicLink: () => node.kind === "symlink"
      };
    },
    readdir: async (directoryPath) => {
      const node = resolveNode(root, path.resolve(directoryPath));
      if (!node || node.kind !== "dir") {
        const error = new Error("ENOTDIR") as NodeJS.ErrnoException;
        error.code = "ENOTDIR";
        throw error;
      }
      return Object.entries(node.children).map(([name, child]) => ({
        name,
        isFile: () => child.kind === "file",
        isDirectory: () => child.kind === "dir",
        isSymbolicLink: () => child.kind === "symlink"
      }));
    },
    cp: cp as unknown as ExecuteCopyPlanDeps["cp"]
  };
  return { deps, cp };
}

describe("executeCopyPlan (#356)", () => {
  it("refuses a blocked plan and never copies", async () => {
    const { deps, cp } = makeDeps(dir({ "chapter.md": file(), Archive: dir() }));
    const result = await executeCopyPlan(
      { projectRootPath: PROJECT_ROOT, plan: plan([row({ status: "blocked" })]) },
      deps
    );
    expect(result.ok).toBe(false);
    expect(result.results).toEqual([]);
    expect(cp).not.toHaveBeenCalled();
  });

  it("copies each ready row to its planned destination and registers markdown files", async () => {
    const { deps, cp } = makeDeps(
      dir({ "chapter.md": file(), notes: dir(), Archive: dir() })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row(),
          row({
            sourceRelativePath: "notes",
            sourceName: "notes",
            sourceKind: "folder",
            destinationName: "notes copy",
            destinationRelativePath: "Archive/notes copy"
          })
        ])
      },
      deps
    );

    expect(result.ok).toBe(true);
    expect(cp).toHaveBeenCalledTimes(2);
    expect(cp).toHaveBeenCalledWith(
      path.resolve(PROJECT_ROOT, "chapter.md"),
      path.resolve(PROJECT_ROOT, "Archive/chapter copy.md")
    );
    expect(result.results.map((r) => r.status)).toEqual(["copied", "copied"]);
    expect(result.registeredDocumentRelativePaths).toEqual([
      "Archive/chapter copy.md"
    ]);
  });

  it("fails a row whose planned destination is taken now, without re-renaming", async () => {
    const { deps, cp } = makeDeps(
      dir({
        "chapter.md": file(),
        Archive: dir({ "chapter copy.md": file() })
      })
    );
    const result = await executeCopyPlan(
      { projectRootPath: PROJECT_ROOT, plan: plan([row()]) },
      deps
    );
    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "destination-conflict-during-execution"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a row whose source vanished since the plan", async () => {
    const { deps, cp } = makeDeps(dir({ Archive: dir() }));
    const result = await executeCopyPlan(
      { projectRootPath: PROJECT_ROOT, plan: plan([row()]) },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "source-missing-during-execution"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("continues past a per-row failure and never rolls back", async () => {
    const { deps, cp } = makeDeps(
      dir({ "a.md": file(), "b.md": file(), "c.md": file(), Archive: dir() }),
      async (_src, dest) => {
        if (dest.endsWith(path.join("Archive", "b copy.md"))) {
          const error = new Error("EACCES") as NodeJS.ErrnoException;
          error.code = "EACCES";
          throw error;
        }
      }
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "a.md",
            destinationRelativePath: "Archive/a copy.md"
          }),
          row({
            sourceRelativePath: "b.md",
            destinationRelativePath: "Archive/b copy.md"
          }),
          row({
            sourceRelativePath: "c.md",
            destinationRelativePath: "Archive/c copy.md"
          })
        ])
      },
      deps
    );

    expect(cp).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(false);
    expect(result.results.map((r) => r.status)).toEqual([
      "copied",
      "failed",
      "copied"
    ]);
    expect(
      result.results.find((r) => r.sourceRelativePath === "b.md")
    ).toMatchObject({ reason: "permission-denied" });
    expect(result.registeredDocumentRelativePaths).toEqual([
      "Archive/a copy.md",
      "Archive/c copy.md"
    ]);
  });

  it("fails a file row that became dirty since the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({ "chapter.md": file(), Archive: dir() })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([row()]),
        dirtyProjectDocumentRelativePaths: ["chapter.md"]
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "source-dirty-open-document"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a FOLDER row when a dirty descendant appears after the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({
        notes: dir({ "draft.md": file() }),
        Archive: dir()
      })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "notes",
            sourceName: "notes",
            sourceKind: "folder",
            destinationRelativePath: "Archive/notes copy"
          })
        ]),
        dirtyProjectDocumentRelativePaths: ["notes/draft.md"]
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "source-dirty-open-document"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a row when the source kind changed since the plan", async () => {
    // plan says `a.md` is a file; on disk it is now a directory.
    const { deps, cp } = makeDeps(
      dir({ "a.md": dir({ "inner.md": file() }), Archive: dir() })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "a.md",
            destinationRelativePath: "Archive/a copy.md"
          })
        ])
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "copy-plan-stale"
    });
    expect(cp).not.toHaveBeenCalled();

    // ...and the reverse: plan says folder, on disk it is now a file.
    const { deps: deps2, cp: cp2 } = makeDeps(
      dir({ notes: file(), Archive: dir() })
    );
    const result2 = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "notes",
            sourceKind: "folder",
            destinationRelativePath: "Archive/notes copy"
          })
        ])
      },
      deps2
    );
    expect(result2.results[0]).toMatchObject({ reason: "copy-plan-stale" });
    expect(cp2).not.toHaveBeenCalled();
  });

  it("fails a row whose source became a symlink since the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({ "chapter.md": symlink(), Archive: dir() })
    );
    const result = await executeCopyPlan(
      { projectRootPath: PROJECT_ROOT, plan: plan([row()]) },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "copy-plan-stale"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a FOLDER row when a symlink appears in its subtree after the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({
        notes: dir({ sub: dir({ evil: symlink() }) }),
        Archive: dir()
      })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "notes",
            sourceKind: "folder",
            destinationRelativePath: "Archive/notes copy"
          })
        ])
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "copy-plan-stale"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a FOLDER row when a protected entry appears in its subtree after the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({
        notes: dir({ "backup.pergamum": file() }),
        Archive: dir()
      })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "notes",
            sourceKind: "folder",
            destinationRelativePath: "Archive/notes copy"
          })
        ])
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "copy-plan-stale"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("fails a row when an ancestor path became a symlink after the plan", async () => {
    const { deps, cp } = makeDeps(
      dir({ link: symlink(), Archive: dir() })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: plan([
          row({
            sourceRelativePath: "link/x.md",
            destinationRelativePath: "Archive/x copy.md"
          })
        ])
      },
      deps
    );
    expect(result.results[0]).toMatchObject({
      status: "failed",
      reason: "copy-plan-stale"
    });
    expect(cp).not.toHaveBeenCalled();
  });

  it("skips blocked rows but still copies the ready ones", async () => {
    const { deps, cp } = makeDeps(
      dir({ "a.md": file(), "b.md": file(), Archive: dir() })
    );
    const result = await executeCopyPlan(
      {
        projectRootPath: PROJECT_ROOT,
        plan: {
          planId: "p",
          destinationFolderRelativePath: "Archive",
          rows: [
            row({
              sourceRelativePath: "a.md",
              destinationRelativePath: "Archive/a copy.md",
              status: "blocked"
            }),
            row({
              sourceRelativePath: "b.md",
              destinationRelativePath: "Archive/b copy.md"
            })
          ],
          hasCollisions: false,
          hasBlockingIssues: false
        }
      },
      deps
    );
    expect(cp).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].sourceRelativePath).toBe("b.md");
  });
});
