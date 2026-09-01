import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  planCopyEntries,
  type PlanCopyEntriesDeps,
  type PlanCopyEntriesInput
} from "../../src/main/projectCopyValidation";

/**
 * #356: `planCopyEntries` dry-run tests over an in-memory filesystem. Node
 * ids are `"file"` / `"dir"` / `"symlink"` / `"other"`; a directory maps a
 * child name → node.
 */
type MemNode =
  | { kind: "file"; size: number; mtimeMs: number }
  | { kind: "dir"; children: Record<string, MemNode>; mtimeMs: number }
  | { kind: "symlink"; mtimeMs: number }
  | { kind: "other"; mtimeMs: number };

const PROJECT_ROOT = path.resolve("/mem/project");

function dir(children: Record<string, MemNode> = {}, mtimeMs = 1_000): MemNode {
  return { kind: "dir", children, mtimeMs };
}
function file(size = 10, mtimeMs = 2_000): MemNode {
  return { kind: "file", size, mtimeMs };
}
function symlink(mtimeMs = 3_000): MemNode {
  return { kind: "symlink", mtimeMs };
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

function makeDeps(root: MemNode): PlanCopyEntriesDeps {
  return {
    newPlanId: () => "plan-1",
    lstat: async (targetPath) => {
      const node = resolveNode(root, targetPath);
      if (!node) {
        const error = new Error("ENOENT") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return {
        isFile: () => node.kind === "file",
        isDirectory: () => node.kind === "dir",
        isSymbolicLink: () => node.kind === "symlink",
        size: node.kind === "file" ? node.size : 0,
        mtime: new Date(node.mtimeMs)
      };
    },
    readdir: async (directoryPath) => {
      const node = resolveNode(root, directoryPath);
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
    }
  };
}

function input(
  overrides: Partial<PlanCopyEntriesInput> = {}
): PlanCopyEntriesInput {
  return {
    projectRootPath: PROJECT_ROOT,
    sourceRelativePaths: ["chapter.md"],
    destinationFolderRelativePath: "Archive",
    dirtyProjectDocumentRelativePaths: [],
    ...overrides
  };
}

describe("planCopyEntries (#356)", () => {
  it("plans a file copy with the ` copy` name when the destination is free", async () => {
    const root = dir({
      "chapter.md": file(),
      Archive: dir()
    });
    const plan = await planCopyEntries(input(), makeDeps(root));

    expect(plan.hasBlockingIssues).toBe(false);
    expect(plan.hasCollisions).toBe(false);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      sourceRelativePath: "chapter.md",
      sourceKind: "file",
      destinationName: "chapter copy.md",
      destinationRelativePath: "Archive/chapter copy.md",
      wasAutoRenamed: false,
      status: "ready"
    });
    expect(plan.rows[0].sourceSizeBytes).toBe(10);
    expect(plan.rows[0].sourceModifiedAt).not.toBeNull();
  });

  it("advances the ladder and marks a collision when ` copy` is taken", async () => {
    const root = dir({
      "chapter.md": file(),
      Archive: dir({ "chapter copy.md": file(42, 9_999) })
    });
    const plan = await planCopyEntries(input(), makeDeps(root));

    expect(plan.hasCollisions).toBe(true);
    expect(plan.rows[0]).toMatchObject({
      destinationName: "chapter copy 2.md",
      wasAutoRenamed: true,
      status: "will-auto-rename",
      collisionSizeBytes: 42
    });
    expect(plan.rows[0].collisionModifiedAt).toBe(
      new Date(9_999).toISOString()
    );
  });

  it("resolves batch-internal collisions deterministically", async () => {
    const root = dir({
      a: dir({ "note.md": file() }),
      b: dir({ "note.md": file() }),
      Archive: dir()
    });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["a/note.md", "b/note.md"] }),
      makeDeps(root)
    );

    const names = plan.rows.map((r) => r.destinationName).sort();
    expect(names).toEqual(["note copy 2.md", "note copy.md"]);
  });

  it("copies a folder recursively-safe name without extension splitting", async () => {
    const root = dir({
      notes: dir({ "a.md": file() }),
      Archive: dir({ "notes copy": dir() })
    });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["notes"] }),
      makeDeps(root)
    );
    expect(plan.rows[0]).toMatchObject({
      sourceKind: "folder",
      destinationName: "notes copy 2",
      wasAutoRenamed: true
    });
  });

  it("blocks a source outside the project root", async () => {
    const root = dir({ Archive: dir() });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["../escape.md"] }),
      makeDeps(root)
    );
    expect(plan.hasBlockingIssues).toBe(true);
    expect(plan.rows[0].reason).toBe("path-traversal");
  });

  it("blocks traversal / absolute / NUL sources", async () => {
    const root = dir({ Archive: dir(), "a.md": file() });
    const deps = makeDeps(root);
    for (const bad of ["a/../b.md", "C:\\x.md", "a\u0000.md"]) {
      const plan = await planCopyEntries(
        input({ sourceRelativePaths: [bad] }),
        deps
      );
      expect(plan.hasBlockingIssues).toBe(true);
    }
  });

  it("blocks the project root as a source", async () => {
    const root = dir({ Archive: dir() });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["/"] }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("source-is-project-root");
  });

  it("blocks `.pergamum` data / reserved segments", async () => {
    const root = dir({ Archive: dir() });
    const deps = makeDeps(root);
    for (const bad of ["Novel.pergamum", ".pergamum_recovery/x.md", ".git/config"]) {
      const plan = await planCopyEntries(
        input({ sourceRelativePaths: [bad] }),
        deps
      );
      expect(plan.hasBlockingIssues).toBe(true);
      expect(plan.rows[0].reason).toBe("invalid-path");
    }
  });

  it("blocks a symlink source", async () => {
    const root = dir({ link: symlink(), Archive: dir() });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["link"] }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("source-not-file-or-folder");
  });

  it("blocks a folder whose subtree contains a symlink", async () => {
    const root = dir({
      notes: dir({ sub: dir({ evil: symlink() }) }),
      Archive: dir()
    });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["notes"] }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("source-contains-symlink");
  });

  it("blocks a folder whose subtree contains a protected entry", async () => {
    const root = dir({
      notes: dir({ "backup.pergamum": file() }),
      Archive: dir()
    });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["notes"] }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("source-contains-protected");
  });

  it("blocks an intermediate ancestor symlink escape", async () => {
    const root = dir({
      link: symlink(),
      Archive: dir()
    });
    // `link/x.md` — `link` is a symlink, so the ancestor scan rejects it.
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: ["link/x.md"] }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("ancestor-symlink");
  });

  it("blocks when the destination is not a folder / missing", async () => {
    const root = dir({ "chapter.md": file(), "Archive.md": file() });
    const notFolder = await planCopyEntries(
      input({ destinationFolderRelativePath: "Archive.md" }),
      makeDeps(root)
    );
    expect(notFolder.blockingReason).toBe("destination-not-folder");

    const missing = await planCopyEntries(
      input({ destinationFolderRelativePath: "Nope" }),
      makeDeps(root)
    );
    expect(missing.blockingReason).toBe("destination-not-found");
  });

  it("blocks copying a folder into its own subtree", async () => {
    const root = dir({ notes: dir({ sub: dir() }) });
    const plan = await planCopyEntries(
      input({
        sourceRelativePaths: ["notes"],
        destinationFolderRelativePath: "notes/sub"
      }),
      makeDeps(root)
    );
    expect(plan.rows[0].reason).toBe("destination-inside-source");
  });

  it("blocks a dirty file source and a dirty descendant of a folder source", async () => {
    const root = dir({
      "chapter.md": file(),
      notes: dir({ "draft.md": file() }),
      Archive: dir()
    });
    const deps = makeDeps(root);

    const dirtyFile = await planCopyEntries(
      input({ dirtyProjectDocumentRelativePaths: ["chapter.md"] }),
      deps
    );
    expect(dirtyFile.rows[0].reason).toBe("source-dirty-open-document");

    const dirtyDescendant = await planCopyEntries(
      input({
        sourceRelativePaths: ["notes"],
        dirtyProjectDocumentRelativePaths: ["notes/draft.md"]
      }),
      deps
    );
    expect(dirtyDescendant.rows[0].reason).toBe("source-dirty-open-document");
  });

  it("blocks a duplicate source and a mixed ancestor/descendant selection", async () => {
    const root = dir({
      notes: dir({ "a.md": file() }),
      Archive: dir()
    });
    const deps = makeDeps(root);

    const dup = await planCopyEntries(
      input({ sourceRelativePaths: ["notes", "notes"] }),
      deps
    );
    expect(dup.rows.some((r) => r.reason === "duplicate-source")).toBe(true);

    const mixed = await planCopyEntries(
      input({ sourceRelativePaths: ["notes", "notes/a.md"] }),
      deps
    );
    expect(mixed.blockingReason).toBe("contains-ancestor-and-descendant");
  });

  it("blocks an empty selection", async () => {
    const root = dir({ Archive: dir() });
    const plan = await planCopyEntries(
      input({ sourceRelativePaths: [] }),
      makeDeps(root)
    );
    expect(plan.blockingReason).toBe("empty-sources");
  });

  it("copies to the project root when destination is ''", async () => {
    const root = dir({ "chapter.md": file() });
    const plan = await planCopyEntries(
      input({ destinationFolderRelativePath: "" }),
      makeDeps(root)
    );
    expect(plan.rows[0].destinationRelativePath).toBe("chapter copy.md");
  });
});
