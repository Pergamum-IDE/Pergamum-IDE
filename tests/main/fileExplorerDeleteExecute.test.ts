import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteOneFileExplorerEntry,
  defaultFileExplorerDeleteExecuteDeps
} from "../../src/main/fileExplorerDeleteExecute";

let projectRoot = "";

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-del-exec-"));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

async function write(relativePath: string): Promise<void> {
  const abs = path.join(projectRoot, relativePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, "x", "utf8");
}

function run(relativePath: string, kind: "file" | "folder") {
  return deleteOneFileExplorerEntry({
    projectRootPath: projectRoot,
    relativePath,
    kind
  });
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await fs.lstat(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

describe("deleteOneFileExplorerEntry (#351)", () => {
  it("deletes a file", async () => {
    await write("drafts/ch1.md");
    expect(await run("drafts/ch1.md", "file")).toEqual({ ok: true });
    expect(await exists("drafts/ch1.md")).toBe(false);
    expect(await exists("drafts")).toBe(true);
  });

  it("deletes an empty folder with rmdir (non-recursive)", async () => {
    await fs.mkdir(path.join(projectRoot, "drafts", "empty"), {
      recursive: true
    });
    expect(await run("drafts/empty", "folder")).toEqual({ ok: true });
    expect(await exists("drafts/empty")).toBe(false);
  });

  it("reports `not-empty` for a folder that still has children (does NOT recurse)", async () => {
    await write("drafts/keep.md");
    const result = await run("drafts", "folder");
    expect(result).toMatchObject({ ok: false, reason: "not-empty" });
    expect(await exists("drafts/keep.md")).toBe(true);
  });

  it("treats an already-absent entry as a success (alreadyAbsent)", async () => {
    expect(await run("gone.md", "file")).toEqual({
      ok: true,
      alreadyAbsent: true
    });
  });

  it("refuses a protected / reserved path (defense-in-depth)", async () => {
    await write("Book.pergamum");
    const result = await run("Book.pergamum", "file");
    expect(result).toMatchObject({ ok: false, reason: "reserved-or-protected" });
    expect(await exists("Book.pergamum")).toBe(true);
  });

  it("refuses a traversal / outside-root path", async () => {
    const result = await run("../escape.md", "file");
    expect(result.ok).toBe(false);
  });

  it("refuses a symlink target", async () => {
    await write("real.md");
    try {
      await fs.symlink(
        path.join(projectRoot, "real.md"),
        path.join(projectRoot, "link.md")
      );
    } catch {
      return;
    }
    const result = await run("link.md", "file");
    expect(result).toMatchObject({ ok: false, reason: "symlink" });
    expect(await exists("real.md")).toBe(true);
  });

  it("refuses to delete when a file target is now an (empty) folder on disk", async () => {
    await fs.mkdir(path.join(projectRoot, "drafts", "ch1.md"), {
      recursive: true
    });
    const result = await run("drafts/ch1.md", "file");
    expect(result).toMatchObject({ ok: false, reason: "target-changed" });
    expect(await exists("drafts/ch1.md")).toBe(true);
  });

  it("refuses to delete when a folder target is now a file on disk", async () => {
    await write("drafts/sub");
    const result = await run("drafts/sub", "folder");
    expect(result).toMatchObject({ ok: false, reason: "target-changed" });
    expect(await exists("drafts/sub")).toBe(true);
  });

  it("refuses a node that is neither a regular file nor a directory", async () => {
    const unlink = vi.fn(async () => undefined);
    const rmdir = vi.fn(async () => undefined);
    const result = await deleteOneFileExplorerEntry(
      { projectRootPath: projectRoot, relativePath: "weird.sock", kind: "file" },
      {
        lstat: async () => ({
          isFile: () => false,
          isDirectory: () => false,
          isSymbolicLink: () => false
        }),
        unlink,
        rmdir
      }
    );
    expect(result).toMatchObject({ ok: false, reason: "target-changed" });
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
  });

  it("refuses an intermediate symlinked ancestor without touching the target (injected)", async () => {
    // Symlink creation needs privilege on Windows, so drive the ancestor
    // scan through an injected `lstat`: `<root>/link` reports as a symlink.
    const unlink = vi.fn(async () => undefined);
    const rmdir = vi.fn(async () => undefined);
    const lstat = vi.fn(async (target: string) => {
      const isLink = target.endsWith(`${path.sep}link`);
      return {
        isFile: () => !isLink,
        isDirectory: () => false,
        isSymbolicLink: () => isLink
      };
    });

    const result = await deleteOneFileExplorerEntry(
      {
        projectRootPath: projectRoot,
        relativePath: "link/escape.md",
        kind: "file"
      },
      { lstat, unlink, rmdir }
    );

    expect(result).toMatchObject({ ok: false, reason: "symlink" });
    expect(unlink).not.toHaveBeenCalled();
    expect(rmdir).not.toHaveBeenCalled();
  });

  it("refuses a path that traverses a symlinked directory (intermediate escape)", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-outside-"));
    try {
      await fs.writeFile(path.join(outside, "escape.md"), "secret", "utf8");
      try {
        await fs.symlink(outside, path.join(projectRoot, "link"), "dir");
      } catch {
        return; // Windows without symlink privilege — skip.
      }

      const result = await deleteOneFileExplorerEntry({
        projectRootPath: projectRoot,
        relativePath: "link/escape.md",
        kind: "file"
      });

      expect(result).toMatchObject({ ok: false, reason: "symlink" });
      expect(
        await fs
          .lstat(path.join(outside, "escape.md"))
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("still deletes a normal file through the default deps", async () => {
    await write("plain.md");
    const result = await deleteOneFileExplorerEntry(
      { projectRootPath: projectRoot, relativePath: "plain.md", kind: "file" },
      defaultFileExplorerDeleteExecuteDeps
    );
    expect(result).toEqual({ ok: true });
    expect(await exists("plain.md")).toBe(false);
  });

  it("an ordered files-first / folders-deepest-first loop empties then removes", async () => {
    await write("d/a.md");
    await write("d/sub/b.md");
    // The renderer's execution order for this subtree:
    for (const [rel, kind] of [
      ["d/a.md", "file"],
      ["d/sub/b.md", "file"],
      ["d/sub", "folder"],
      ["d", "folder"]
    ] as const) {
      expect((await run(rel, kind)).ok).toBe(true);
    }
    expect(await exists("d")).toBe(false);
  });
});
