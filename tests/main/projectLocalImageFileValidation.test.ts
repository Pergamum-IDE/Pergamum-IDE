import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateProjectLocalImageFile,
  type ProjectLocalImageFileSystem
} from "../../src/main/projectLocalImageFileValidation";

const PLATFORM: "windows" | "linux" =
  process.platform === "win32" ? "windows" : "linux";
const PROJECT_ROOT = nodePath.resolve("/projects/novel");
const OUTSIDE_FILE = nodePath.resolve("/etc/secret.png");

function insideProject(relativePath: string): string {
  return nodePath.resolve(PROJECT_ROOT, ...relativePath.split("/"));
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
]);

interface FakeEntry {
  readonly bytes?: Uint8Array;
  readonly isDirectory?: boolean;
  readonly realpath?: string;
  readonly size?: number;
}

function fakeFileSystem(
  entries: Record<string, FakeEntry>
): ProjectLocalImageFileSystem {
  const enoent = () => {
    const error = new Error("ENOENT") as Error & { code: string };
    error.code = "ENOENT";
    return error;
  };
  return {
    realpath: async (target) => {
      const entry = entries[target];
      if (!entry) throw enoent();
      return entry.realpath ?? target;
    },
    stat: async (target) => {
      const entry = entries[target];
      if (!entry) throw enoent();
      const isDir = entry.isDirectory === true;
      return {
        isDirectory: () => isDir,
        isFile: () => !isDir,
        size: entry.size ?? entry.bytes?.byteLength ?? 0
      };
    },
    readFile: async (target) => {
      const entry = entries[target];
      if (!entry || !entry.bytes) throw enoent();
      return entry.bytes;
    }
  };
}

function run(
  segments: string[],
  entries: Record<string, FakeEntry>,
  extra?: { maxBytes?: number }
) {
  return validateProjectLocalImageFile({
    projectRootPath: PROJECT_ROOT,
    projectRelativeSegments: segments,
    fileSystem: fakeFileSystem({
      [PROJECT_ROOT]: { isDirectory: true, realpath: PROJECT_ROOT },
      ...entries
    }),
    platform: PLATFORM,
    maxBytes: extra?.maxBytes
  });
}

describe("validateProjectLocalImageFile (#411)", () => {
  it.each([
    ["png", PNG_BYTES, "png"],
    ["jpg", JPEG_BYTES, "jpeg"],
    ["gif", GIF_BYTES, "gif"],
    ["webp", WEBP_BYTES, "webp"]
  ])("accepts a valid %s that lives inside the project root", async (ext, bytes, format) => {
    const result = await run([`a.${ext}`], {
      [insideProject(`a.${ext}`)]: { bytes }
    });
    expect(result).toMatchObject({ ok: true, format });
  });

  it("reports `missing` for a nonexistent file", async () => {
    const result = await run(["assets", "images", "missing.png"], {});
    expect(result).toEqual({ ok: false, reason: "missing" });
  });

  it("reports `directory` for a directory target named like an image", async () => {
    const result = await run(["weird.png"], {
      [insideProject("weird.png")]: { isDirectory: true }
    });
    expect(result).toEqual({ ok: false, reason: "directory" });
  });

  it("reports `outsideProject` when the resolved realpath escapes the root (symlink)", async () => {
    const result = await run(["assets", "link.png"], {
      [insideProject("assets/link.png")]: {
        bytes: PNG_BYTES,
        realpath: OUTSIDE_FILE
      }
    });
    expect(result).toEqual({ ok: false, reason: "outsideProject" });
  });

  it.each([
    ["nested", "thing.pergamum-wal"],
    [".pergamum", "secret.png"],
    [".pergamum-journal", "secret.png"],
    ["nested", ".pergamum", "deep", "secret.png"]
  ])("reports `protectedLocation` for a `.pergamum*` segment (%s)", async (...segments) => {
    const result = await run(segments as string[], {});
    expect(result).toEqual({ ok: false, reason: "protectedLocation" });
  });

  it("reports `unsupportedFormat` for an unsupported extension without reading the file", async () => {
    let readCount = 0;
    const fileSystem = fakeFileSystem({
      [PROJECT_ROOT]: { isDirectory: true, realpath: PROJECT_ROOT },
      [insideProject("diagram.svg")]: { bytes: PNG_BYTES }
    });
    const result = await validateProjectLocalImageFile({
      projectRootPath: PROJECT_ROOT,
      projectRelativeSegments: ["diagram.svg"],
      fileSystem: {
        ...fileSystem,
        readFile: async (t) => {
          readCount += 1;
          return fileSystem.readFile(t);
        }
      },
      platform: PLATFORM
    });
    expect(result).toEqual({ ok: false, reason: "unsupportedFormat" });
    expect(readCount).toBe(0);
  });

  it("reports `formatMismatch` when the magic bytes disagree with the extension", async () => {
    const result = await run(["a.png"], {
      [insideProject("a.png")]: { bytes: JPEG_BYTES }
    });
    expect(result).toEqual({ ok: false, reason: "formatMismatch" });
  });

  it("reports `formatMismatch` when the bytes are not a supported image at all", async () => {
    const result = await run(["a.png"], {
      [insideProject("a.png")]: { bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) }
    });
    expect(result).toEqual({ ok: false, reason: "formatMismatch" });
  });

  it("reports `tooLarge` for a file over the size cap without reading it", async () => {
    let readCount = 0;
    const fileSystem = fakeFileSystem({
      [PROJECT_ROOT]: { isDirectory: true, realpath: PROJECT_ROOT },
      [insideProject("big.png")]: { bytes: PNG_BYTES, size: 11 }
    });
    const result = await validateProjectLocalImageFile({
      projectRootPath: PROJECT_ROOT,
      projectRelativeSegments: ["big.png"],
      fileSystem: {
        ...fileSystem,
        readFile: async (t) => {
          readCount += 1;
          return fileSystem.readFile(t);
        }
      },
      platform: PLATFORM,
      maxBytes: 10
    });
    expect(result).toEqual({ ok: false, reason: "tooLarge" });
    expect(readCount).toBe(0);
  });
});
