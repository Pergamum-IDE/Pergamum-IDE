import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BINARY_ATOMIC_WRITE_TEMP_MARKER,
  writeNewBinaryFileAtomic,
  type BinaryAtomicWriteFileSystem
} from "../../src/main/atomicFileWriteBinary";

let workDir = "";

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-img-atomic-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

const SAMPLE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

describe("writeNewBinaryFileAtomic (#407)", () => {
  it("creates the target file with the exact bytes", async () => {
    const target = path.join(workDir, "2026-09-07-095213042.png");

    await writeNewBinaryFileAtomic(target, SAMPLE);

    const written = await fs.readFile(target);
    expect(new Uint8Array(written)).toEqual(SAMPLE);
    // No temp files left behind.
    const remaining = await fs.readdir(workDir);
    expect(remaining).toEqual(["2026-09-07-095213042.png"]);
  });

  it("does not re-encode: an arbitrary (non-image) byte stream is stored verbatim", async () => {
    const target = path.join(workDir, "blob.bin");
    const bytes = Uint8Array.from({ length: 512 }, (_v, i) => (i * 37) % 256);

    await writeNewBinaryFileAtomic(target, bytes);

    expect(new Uint8Array(await fs.readFile(target))).toEqual(bytes);
  });

  it("throws EEXIST when the target already exists and leaves it untouched", async () => {
    const target = path.join(workDir, "existing.png");
    await fs.writeFile(target, Buffer.from("ORIGINAL"));

    await expect(
      writeNewBinaryFileAtomic(target, SAMPLE)
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(await fs.readFile(target, "utf8")).toBe("ORIGINAL");
    const remaining = await fs.readdir(workDir);
    expect(remaining).toEqual(["existing.png"]);
  });

  it("removes the temp file and rethrows when the link step fails", async () => {
    const target = path.join(workDir, "file.png");
    const realFs = fs;
    const faultyFs: BinaryAtomicWriteFileSystem = {
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      link: () => Promise.reject(new Error("link boom")),
      rm: (file, opts) => realFs.rm(file, opts),
      open: (file, flags) => realFs.open(file, flags)
    };

    await expect(
      writeNewBinaryFileAtomic(target, SAMPLE, { fileSystem: faultyFs })
    ).rejects.toThrow("link boom");

    expect(await fs.readdir(workDir)).toEqual([]);
  });

  it("removes the temp file and rethrows when the fsync step fails (name never claimed)", async () => {
    const target = path.join(workDir, "file.png");
    const realFs = fs;
    const faultyFs: BinaryAtomicWriteFileSystem = {
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      link: (a, b) => realFs.link(a, b),
      rm: (file, opts) => realFs.rm(file, opts),
      open: async (file, flags) => {
        const handle = await realFs.open(file, flags);
        return {
          sync: () => Promise.reject(new Error("fsync boom")),
          close: () => handle.close()
        };
      }
    };

    await expect(
      writeNewBinaryFileAtomic(target, SAMPLE, { fileSystem: faultyFs })
    ).rejects.toThrow("fsync boom");

    expect(await fs.readdir(workDir)).toEqual([]);
  });

  it("uses a marked temp file name during the write", async () => {
    const target = path.join(workDir, "file.png");
    const realFs = fs;
    const seenTempNames: string[] = [];
    const spyFs: BinaryAtomicWriteFileSystem = {
      writeFile: (file, data, opts) => {
        seenTempNames.push(path.basename(file));
        return realFs.writeFile(file, data, opts);
      },
      link: (a, b) => realFs.link(a, b),
      rm: (file, opts) => realFs.rm(file, opts),
      open: (file, flags) => realFs.open(file, flags)
    };

    await writeNewBinaryFileAtomic(target, SAMPLE, {
      fileSystem: spyFs,
      tempSuffix: () => "deadbeef"
    });

    expect(seenTempNames).toHaveLength(1);
    expect(seenTempNames[0]).toContain(BINARY_ATOMIC_WRITE_TEMP_MARKER);
    expect(seenTempNames[0]).not.toBe("file.png");
  });
});

/**
 * A filesystem whose `link()` reports a "cannot hardlink" code, forcing the
 * exclusive-create fallback (exFAT / OneDrive / SMB / ... — remediation §1).
 * Everything else delegates to the real fs, except an optional injected
 * failure for the fallback's exclusive write of the FINAL target.
 */
function hardlinkUnsupportedFs(config: {
  readonly linkCode: string;
  readonly failTargetWriteWith?: string;
  readonly linkCalls?: string[];
}): BinaryAtomicWriteFileSystem {
  const realFs = fs;
  return {
    writeFile: (file, data, opts) => {
      if (
        config.failTargetWriteWith &&
        !path.basename(file).includes(BINARY_ATOMIC_WRITE_TEMP_MARKER)
      ) {
        const error = new Error(config.failTargetWriteWith) as Error & {
          code: string;
        };
        error.code = config.failTargetWriteWith;
        return Promise.reject(error);
      }
      return realFs.writeFile(file, data, opts);
    },
    link: (a, b) => {
      config.linkCalls?.push(path.basename(b));
      const error = new Error(config.linkCode) as Error & { code: string };
      error.code = config.linkCode;
      return Promise.reject(error);
    },
    rm: (file, opts) => realFs.rm(file, opts),
    open: (file, flags) => realFs.open(file, flags)
  };
}

describe("writeNewBinaryFileAtomic — hardlink-unsupported fallback (#407 remediation §1)", () => {
  it.each(["EXDEV", "ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EPERM"])(
    "falls back to an exclusive create when link() reports %s, storing the exact bytes",
    async (linkCode) => {
      const target = path.join(workDir, "2026-09-07-095213042.png");

      await writeNewBinaryFileAtomic(target, SAMPLE, {
        fileSystem: hardlinkUnsupportedFs({ linkCode })
      });

      expect(new Uint8Array(await fs.readFile(target))).toEqual(SAMPLE);
      expect(await fs.readdir(workDir)).toEqual([
        "2026-09-07-095213042.png"
      ]);
    }
  );

  it("hardlink success path is unchanged (no fallback) when link() works", async () => {
    const target = path.join(workDir, "ok.png");
    const linkCalls: string[] = [];
    const realFs = fs;
    const spyFs: BinaryAtomicWriteFileSystem = {
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      link: (a, b) => {
        linkCalls.push(path.basename(b));
        return realFs.link(a, b);
      },
      rm: (file, opts) => realFs.rm(file, opts),
      open: (file, flags) => realFs.open(file, flags)
    };

    await writeNewBinaryFileAtomic(target, SAMPLE, { fileSystem: spyFs });

    expect(linkCalls).toEqual(["ok.png"]);
    expect(new Uint8Array(await fs.readFile(target))).toEqual(SAMPLE);
  });

  it("fallback never overwrites an existing target — rethrows EEXIST for the caller's collision retry", async () => {
    const target = path.join(workDir, "taken.png");
    await fs.writeFile(target, Buffer.from("ORIGINAL"));

    await expect(
      writeNewBinaryFileAtomic(target, SAMPLE, {
        fileSystem: hardlinkUnsupportedFs({ linkCode: "EXDEV" })
      })
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(await fs.readFile(target, "utf8")).toBe("ORIGINAL");
    expect(await fs.readdir(workDir)).toEqual(["taken.png"]);
  });

  it("best-effort cleans the temp file and a partial target when the fallback write itself fails", async () => {
    const target = path.join(workDir, "file.png");

    await expect(
      writeNewBinaryFileAtomic(target, SAMPLE, {
        fileSystem: hardlinkUnsupportedFs({
          linkCode: "EXDEV",
          failTargetWriteWith: "EACCES"
        })
      })
    ).rejects.toMatchObject({ code: "EACCES" });

    // No temp file, no partial target.
    expect(await fs.readdir(workDir)).toEqual([]);
  });
});
