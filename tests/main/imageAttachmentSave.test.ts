import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  saveImageAttachment,
  type ImageAttachmentFileSystem,
  type SaveImageAttachmentDeps
} from "../../src/main/imageAttachmentSave";
import { IMAGE_ATTACHMENT_MAX_BYTES } from "../../src/shared/imageAttachmentFormat";

let projectRoot = "";

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-img-save-"));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
});

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);

const FIXED_NOW = new Date(2026, 8, 7, 9, 52, 13, 42); // local -> 2026-09-07-095213042

function deps(extra: SaveImageAttachmentDeps = {}): SaveImageAttachmentDeps {
  return {
    fileSystem: fs as unknown as ImageAttachmentFileSystem,
    platform: process.platform === "win32" ? "windows" : "linux",
    now: () => FIXED_NOW,
    ...extra
  };
}

describe("saveImageAttachment (#407) — happy path", () => {
  it("lazily creates the directory and writes the image with a timestamp name", async () => {
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: "image/png"
      },
      deps()
    );

    expect(result).toEqual({
      ok: true,
      relativePath: "images/2026-09-07-095213042.png",
      fileName: "2026-09-07-095213042.png",
      format: "png",
      byteLength: PNG.byteLength
    });
    const onDisk = await fs.readFile(
      path.join(projectRoot, "images", "2026-09-07-095213042.png")
    );
    expect(new Uint8Array(onDisk)).toEqual(PNG);
  });

  it("does not create the directory when validation fails first", async () => {
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: JPEG,
        reportedMimeType: "image/png" // mismatch -> reject before any fs work
      },
      deps()
    );

    expect(result).toEqual({ ok: false, reason: "mimeMagicMismatch" });
    await expect(fs.readdir(path.join(projectRoot, "images"))).rejects.toThrow();
  });

  it("suffixes -1, -2 on filename collision", async () => {
    await fs.mkdir(path.join(projectRoot, "images"));
    await fs.writeFile(
      path.join(projectRoot, "images", "2026-09-07-095213042.png"),
      Buffer.from("taken")
    );
    await fs.writeFile(
      path.join(projectRoot, "images", "2026-09-07-095213042-1.png"),
      Buffer.from("taken")
    );

    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: ""
      },
      deps()
    );

    expect(result).toMatchObject({
      ok: true,
      fileName: "2026-09-07-095213042-2.png",
      relativePath: "images/2026-09-07-095213042-2.png"
    });
  });

  it("accepts File.type === '' and identifies the format by magic bytes", async () => {
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "assets/img",
        bytes: JPEG,
        reportedMimeType: ""
      },
      deps()
    );
    expect(result).toMatchObject({ ok: true, format: "jpeg" });
    expect(
      (result as { fileName: string }).fileName.endsWith(".jpg")
    ).toBe(true);
  });
});

describe("saveImageAttachment (#407) — validation & rejection", () => {
  it("rejects an over-limit payload before touching the filesystem", async () => {
    const oversized = new Uint8Array(IMAGE_ATTACHMENT_MAX_BYTES + 1);
    oversized.set(PNG.subarray(0, 8));
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: oversized,
        reportedMimeType: "image/png"
      },
      deps()
    );
    expect(result).toEqual({
      ok: false,
      reason: "sizeOverflow",
      actualBytes: IMAGE_ATTACHMENT_MAX_BYTES + 1
    });
  });

  it("rejects an unsupported format (SVG bytes)", async () => {
    const svg = new TextEncoder().encode("<svg></svg>");
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: svg,
        reportedMimeType: "image/svg+xml"
      },
      deps()
    );
    expect(result).toEqual({ ok: false, reason: "unsupportedFormat" });
  });

  it("rejects an absolute / escaping save directory", async () => {
    for (const saveDirectory of ["/etc", "..\\..\\escape", "C:\\evil"]) {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory,
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps()
      );
      expect(result).toEqual({ ok: false, reason: "invalidPath" });
    }
  });

  it("rejects when the save directory is an existing regular file", async () => {
    await fs.writeFile(path.join(projectRoot, "images"), Buffer.from("i am a file"));
    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: "image/png"
      },
      deps()
    );
    expect(result).toEqual({ ok: false, reason: "saveDirectoryNotDirectory" });
  });

  it("rejects a directory reached through a symlink that escapes the project", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-outside-"));
    try {
      await fs.symlink(outside, path.join(projectRoot, "images"), "dir");
    } catch {
      // dir symlink not permitted on this host (e.g. unprivileged Windows) —
      // the realpath containment path is still covered by the file test above.
      await fs.rm(outside, { recursive: true, force: true });
      return;
    }
    try {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory: "images",
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps()
      );
      expect(result).toEqual({ ok: false, reason: "containmentFailure" });
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("maps ENOSPC/EACCES/EIO write errors to warning reasons and leaves nothing partial", async () => {
    const realFs = fs as unknown as ImageAttachmentFileSystem;
    const makeFailing = (code: string): ImageAttachmentFileSystem => ({
      ...realFs,
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      realpath: (t) => realFs.realpath(t),
      stat: (t) => realFs.stat(t),
      writeFile: () => {
        const error = new Error(code) as Error & { code: string };
        error.code = code;
        return Promise.reject(error);
      },
      link: (a, b) => realFs.link(a, b),
      rm: (f, o) => realFs.rm(f, o),
      open: (f, fl) => realFs.open(f, fl)
    });

    const cases: Array<[string, string]> = [
      ["ENOSPC", "diskFull"],
      ["EACCES", "permissionDenied"],
      ["EIO", "ioError"]
    ];
    for (const [code, reason] of cases) {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory: "images",
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps({ fileSystem: makeFailing(code) })
      );
      expect(result).toEqual({ ok: false, reason });
    }
    // The mkdir side-effect is fine; no image file was produced.
    expect(await fs.readdir(path.join(projectRoot, "images"))).toEqual([]);
  });
});

describe("saveImageAttachment (#407) — remediation", () => {
  it("rejects a save directory inside the Pergamum write-lock directory (§2)", async () => {
    for (const saveDirectory of [
      ".pergamum.lock",
      ".pergamum.lock/images",
      "./.pergamum.lock/nested/deep"
    ]) {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory,
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps()
      );
      expect(result).toEqual({ ok: false, reason: "protectedLocation" });
    }
    // Never advanced to mkdir / write.
    await expect(
      fs.readdir(path.join(projectRoot, ".pergamum.lock"))
    ).rejects.toThrow();
  });

  it("rejects a save directory shaped like a Pergamum data file (§2)", async () => {
    for (const saveDirectory of [
      ".pergamum",
      "sub/.pergamum-wal",
      "data.pergamum-journal",
      "x.pergamum-shm"
    ]) {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory,
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps()
      );
      expect(result).toEqual({ ok: false, reason: "protectedLocation" });
    }
  });

  it("rejects — deterministically, no OS symlink needed — when realpath escapes the project (§3)", async () => {
    const escapeTargets: string[] = [];
    const realFs = fs as unknown as ImageAttachmentFileSystem;
    const outsideDir = path.resolve(projectRoot, "..", "outside-project");

    const mockFs: ImageAttachmentFileSystem = {
      ...realFs,
      realpath: async (target) => {
        const t = String(target);
        if (t === path.resolve(projectRoot)) {
          return path.resolve(projectRoot);
        }
        // "images" (and anything under it) resolves OUTSIDE the project.
        if (t === path.join(projectRoot, "images") || t.startsWith(path.join(projectRoot, "images") + path.sep)) {
          return outsideDir;
        }
        return realFs.realpath(target);
      },
      mkdir: (dir, opts) => {
        escapeTargets.push(String(dir));
        return realFs.mkdir(dir, opts);
      },
      writeFile: (file, data, opts) => {
        escapeTargets.push(String(file));
        return realFs.writeFile(file, data, opts);
      },
      link: (a, b) => {
        escapeTargets.push(String(b));
        return realFs.link(a, b);
      },
      stat: (t) => realFs.stat(t)
    };

    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: "image/png"
      },
      deps({ fileSystem: mockFs })
    );

    expect(result).toEqual({ ok: false, reason: "containmentFailure" });
    // No mkdir / write was attempted against the escaping location.
    expect(escapeTargets).toEqual([]);
  });

  it("classifies a non-directory intermediate segment as saveDirectoryNotDirectory on every OS (§4)", async () => {
    // `images` is a regular file; the requested save directory is `images/sub`.
    await fs.writeFile(path.join(projectRoot, "images"), Buffer.from("i am a file"));

    for (const platform of ["windows", "linux"] as const) {
      const result = await saveImageAttachment(
        {
          projectRootPath: projectRoot,
          saveDirectory: "images/sub",
          bytes: PNG,
          reportedMimeType: "image/png"
        },
        deps({ platform })
      );
      expect(result).toEqual({ ok: false, reason: "saveDirectoryNotDirectory" });
    }
  });

  it("returns collisionExhausted when every candidate name is taken up to maxCollisionAttempts (§6)", async () => {
    await fs.mkdir(path.join(projectRoot, "images"));
    for (const name of [
      "2026-09-07-095213042.png",
      "2026-09-07-095213042-1.png",
      "2026-09-07-095213042-2.png"
    ]) {
      await fs.writeFile(path.join(projectRoot, "images", name), Buffer.from("x"));
    }

    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: "image/png"
      },
      deps({ maxCollisionAttempts: 3 })
    );

    expect(result).toEqual({ ok: false, reason: "collisionExhausted" });
  });

  it("still saves when the underlying filesystem cannot hardlink (fallback path, §1)", async () => {
    const realFs = fs as unknown as ImageAttachmentFileSystem;
    const noHardlinkFs: ImageAttachmentFileSystem = {
      ...realFs,
      mkdir: (dir, opts) => realFs.mkdir(dir, opts),
      realpath: (t) => realFs.realpath(t),
      stat: (t) => realFs.stat(t),
      writeFile: (file, data, opts) => realFs.writeFile(file, data, opts),
      link: () => {
        const error = new Error("EXDEV") as Error & { code: string };
        error.code = "EXDEV";
        return Promise.reject(error);
      },
      rm: (f, o) => realFs.rm(f, o),
      open: (f, fl) => realFs.open(f, fl)
    };

    const result = await saveImageAttachment(
      {
        projectRootPath: projectRoot,
        saveDirectory: "images",
        bytes: PNG,
        reportedMimeType: "image/png"
      },
      deps({ fileSystem: noHardlinkFs })
    );

    expect(result).toMatchObject({ ok: true, fileName: "2026-09-07-095213042.png" });
    expect(
      new Uint8Array(
        await fs.readFile(path.join(projectRoot, "images", "2026-09-07-095213042.png"))
      )
    ).toEqual(PNG);
  });
});
