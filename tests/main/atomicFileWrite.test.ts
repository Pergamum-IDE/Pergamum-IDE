import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ATOMIC_WRITE_TEMP_MARKER,
  isAtomicWriteTempFileName,
  writeFileAtomic,
  type AtomicWriteFileSystem
} from "../../src/main/atomicFileWrite";

let workDir = "";

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-atomic-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("writeFileAtomic (#272)", () => {
  it("creates the target (and its directory) with the given content", async () => {
    const target = path.join(workDir, "nested", "deep", "file.json");

    await writeFileAtomic(target, '{"a":1}\n');

    expect(await fs.readFile(target, "utf8")).toBe('{"a":1}\n');
  });

  it("replaces existing content atomically", async () => {
    const target = path.join(workDir, "file.json");
    await fs.writeFile(target, "OLD", "utf8");

    await writeFileAtomic(target, "NEW");

    expect(await fs.readFile(target, "utf8")).toBe("NEW");
  });

  it("writes the string byte-for-byte with no line-ending / BOM transform", async () => {
    const target = path.join(workDir, "chapter.md");
    // Mixed CRLF / CR / LF, a leading BOM, and no trailing newline — every
    // byte must survive so a Markdown save through this helper preserves the
    // renderer-reconstructed on-disk line endings exactly.
    const content = "﻿# Title\r\nalpha\rbeta\ngamma";
    await fs.writeFile(target, "stale bytes that must be fully replaced", "utf8");

    await writeFileAtomic(target, content);

    expect(await fs.readFile(target, "utf8")).toBe(content);
    expect(await fs.readFile(target)).toEqual(Buffer.from(content, "utf8"));
  });

  it("leaves the previous target intact and no stray temp when the rename fails", async () => {
    const target = path.join(workDir, "file.json");
    await fs.writeFile(target, "GOOD", "utf8");

    const realFs = (await import("node:fs")).promises;
    const faultyFs: AtomicWriteFileSystem = {
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      rename: () => Promise.reject(new Error("rename boom")),
      rm: (file, opts) => realFs.rm(file, opts),
      open: (file, flags) => realFs.open(file, flags)
    };

    await expect(
      writeFileAtomic(target, "BAD", { fileSystem: faultyFs })
    ).rejects.toThrow("rename boom");

    expect(await fs.readFile(target, "utf8")).toBe("GOOD");
    const remaining = await fs.readdir(workDir);
    expect(remaining).toEqual(["file.json"]);
  });

  it("writes through a distinct temp file name before the rename", async () => {
    const target = path.join(workDir, "file.json");
    const seenTempNames: string[] = [];

    const realFs = (await import("node:fs")).promises;
    const observingFs: AtomicWriteFileSystem = {
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      writeFile: (file, data, opts) => {
        seenTempNames.push(path.basename(file));
        return realFs.writeFile(file, data, opts);
      },
      rename: (from, to) => realFs.rename(from, to),
      rm: (file, opts) => realFs.rm(file, opts),
      open: (file, flags) => realFs.open(file, flags)
    };

    await writeFileAtomic(target, "DATA", {
      fileSystem: observingFs,
      tempSuffix: () => "fixedsuffix"
    });

    expect(seenTempNames).toEqual([
      `file.json${ATOMIC_WRITE_TEMP_MARKER}fixedsuffix`
    ]);
    expect(await fs.readFile(target, "utf8")).toBe("DATA");
  });

  it("does NOT rename when the temp file fsync fails (#272 review durability)", async () => {
    const target = path.join(workDir, "file.json");
    await fs.writeFile(target, "GOOD", "utf8");

    const realFs = (await import("node:fs")).promises;
    let renameCalled = false;
    const syncFailFs: AtomicWriteFileSystem = {
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      rename: (from, to) => {
        renameCalled = true;
        return realFs.rename(from, to);
      },
      rm: (file, opts) => realFs.rm(file, opts),
      open: async (file, flags) => {
        const handle = await realFs.open(file, flags);
        return {
          sync: () => Promise.reject(new Error("fsync failed")),
          close: () => handle.close()
        };
      }
    };

    await expect(
      writeFileAtomic(target, "NEW", { fileSystem: syncFailFs })
    ).rejects.toThrow("fsync failed");

    expect(renameCalled).toBe(false);
    // Previous target preserved, failed temp cleaned up.
    expect(await fs.readFile(target, "utf8")).toBe("GOOD");
    expect(await fs.readdir(workDir)).toEqual(["file.json"]);
  });

  it("still succeeds when only the directory fsync fails (best-effort)", async () => {
    const target = path.join(workDir, "file.json");

    const realFs = (await import("node:fs")).promises;
    const dirSyncFailFs: AtomicWriteFileSystem = {
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      rename: (from, to) => realFs.rename(from, to),
      rm: (file, opts) => realFs.rm(file, opts),
      open: async (file, flags) => {
        // The temp file (`r+`) syncs fine; only the directory (`r`) fails.
        if (flags === "r") {
          return {
            sync: () => Promise.reject(new Error("EINVAL")),
            close: () => Promise.resolve()
          };
        }
        const handle = await realFs.open(file, flags);
        return {
          sync: () => handle.sync(),
          close: () => handle.close()
        };
      }
    };

    await expect(
      writeFileAtomic(target, "DATA", { fileSystem: dirSyncFailFs })
    ).resolves.toBeUndefined();
    expect(await fs.readFile(target, "utf8")).toBe("DATA");
  });

  it("recognizes an in-progress temp file name (never a finished record)", () => {
    expect(
      isAtomicWriteTempFileName(
        `session-1.json${ATOMIC_WRITE_TEMP_MARKER}abc123`
      )
    ).toBe(true);
    expect(isAtomicWriteTempFileName("session-1.json")).toBe(false);
  });
});
