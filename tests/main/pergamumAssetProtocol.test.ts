import nodePath from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  handlePergamumAssetRequest,
  registerPergamumAssetProtocol,
  type PergamumAssetProtocolFileSystem
} from "../../src/main/pergamumAssetProtocol";
import { PERGAMUM_ASSET_SCHEME } from "../../src/shared/pergamumAssetUrl";

// Built with the real `path.resolve` so the fake-fs keys line up with what
// the handler computes on this OS (Windows adds a drive letter + `\`).
const PLATFORM: "windows" | "linux" =
  process.platform === "win32" ? "windows" : "linux";
const PROJECT_ROOT = nodePath.resolve("/projects/novel");
const OUTSIDE_FILE = nodePath.resolve("/etc/secret.png");

function insideProject(relativePath: string): string {
  return nodePath.resolve(PROJECT_ROOT, ...relativePath.split("/"));
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
  0x04, 0x05, 0x06, 0x07, 0x08
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
const GIF_BYTES = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00
]);
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
): PergamumAssetProtocolFileSystem {
  const enoent = () => {
    const error = new Error("ENOENT") as Error & { code: string };
    error.code = "ENOENT";
    return error;
  };
  return {
    realpath: async (target) => {
      const entry = entries[target];
      if (!entry) {
        throw enoent();
      }
      return entry.realpath ?? target;
    },
    stat: async (target) => {
      const entry = entries[target];
      if (!entry) {
        throw enoent();
      }
      const isDir = entry.isDirectory === true;
      return {
        isDirectory: () => isDir,
        isFile: () => !isDir,
        size: entry.size ?? entry.bytes?.byteLength ?? 0
      };
    },
    readFile: async (target) => {
      const entry = entries[target];
      if (!entry || !entry.bytes) {
        throw enoent();
      }
      return entry.bytes;
    }
  };
}

function makeDeps(overrides: {
  projectRoot?: string | null;
  entries?: Record<string, FakeEntry>;
  maxBytes?: number;
}) {
  return {
    currentProjectRootPath: () =>
      overrides.projectRoot === undefined
        ? PROJECT_ROOT
        : overrides.projectRoot,
    fileSystem: fakeFileSystem({
      [PROJECT_ROOT]: { isDirectory: true, realpath: PROJECT_ROOT },
      ...(overrides.entries ?? {})
    }),
    platform: PLATFORM,
    maxBytes: overrides.maxBytes ?? 134_217_728
  };
}

async function bodyBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

describe("handlePergamumAssetRequest (#409)", () => {
  it("serves a PNG that lives inside the project root", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/assets/images/foo.png" },
      makeDeps({
        entries: { [insideProject("assets/images/foo.png")]: { bytes: PNG_BYTES } }
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await bodyBytes(response)).toEqual(PNG_BYTES);
  });

  it.each([
    ["jpg", JPEG_BYTES, "image/jpeg"],
    ["gif", GIF_BYTES, "image/gif"],
    ["webp", WEBP_BYTES, "image/webp"]
  ])("serves a %s with the right Content-Type", async (ext, bytes, mime) => {
    const response = await handlePergamumAssetRequest(
      { url: `pergamum-asset://project/a.${ext}` },
      makeDeps({ entries: { [insideProject(`a.${ext}`)]: { bytes } } })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(mime);
  });

  it("serves the exact link #407 inserts, resolved to a real file", async () => {
    const response = await handlePergamumAssetRequest(
      {
        url: "pergamum-asset://project/assets/images/2026-09-07-141234567.png"
      },
      makeDeps({
        entries: {
          [insideProject("assets/images/2026-09-07-141234567.png")]: {
            bytes: PNG_BYTES
          }
        }
      })
    );
    expect(response.status).toBe(200);
  });

  it("returns 404 when no project is open", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/a.png" },
      makeDeps({ projectRoot: null })
    );
    expect(response.status).toBe(404);
  });

  it.each([
    "pergamum-asset://project/../outside.png",
    "pergamum-asset://project/a/../../outside.png",
    "pergamum-asset://project/..\\outside.png",
    "pergamum-asset://project//etc/passwd.png",
    "pergamum-asset://project/a/%2e%2e/outside.png",
    "pergamum-asset://project/a%5c..%5coutside.png",
    "https://example.com/a.png",
    // Wrong authority - only `project` is served. The old `asset` authority
    // and any other host are rejected before any resolution.
    "pergamum-asset://asset/assets/foo.png",
    "pergamum-asset://local/assets/foo.png",
    "pergamum-asset://foo/assets/foo.png",
    "pergamum://project/assets/foo.png"
  ])(
    "rejects the malformed / traversal / wrong-authority request %s without touching fs",
    async (url) => {
      const readFile = vi.fn();
      const realpath = vi.fn();
      const deps = makeDeps({});
      const response = await handlePergamumAssetRequest(
        { url },
        {
          ...deps,
          fileSystem: { ...deps.fileSystem, readFile, realpath }
        }
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(readFile).not.toHaveBeenCalled();
      expect(realpath).not.toHaveBeenCalled();
    }
  );

  it("returns 403 when the resolved file's realpath escapes the project root (symlink)", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/assets/link.png" },
      makeDeps({
        entries: {
          [insideProject("assets/link.png")]: {
            bytes: PNG_BYTES,
            realpath: OUTSIDE_FILE
          }
        }
      })
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 for a `.pergamum*` protected filename", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/nested/thing.pergamum-wal" },
      makeDeps({})
    );
    expect(response.status).toBe(403);
  });

  it.each([
    "pergamum-asset://project/.pergamum/secret.png",
    "pergamum-asset://project/.pergamum-journal/secret.png",
    "pergamum-asset://project/.pergamum-wal/secret.png",
    "pergamum-asset://project/.pergamum-shm/secret.png",
    "pergamum-asset://project/nested/.pergamum/deep/secret.png"
  ])(
    "returns 403 for %s (protected DIRECTORY segment) without touching fs",
    async (url) => {
      const realpath = vi.fn();
      const stat = vi.fn();
      const readFile = vi.fn();
      const deps = makeDeps({});
      const response = await handlePergamumAssetRequest(
        { url },
        {
          ...deps,
          fileSystem: { ...deps.fileSystem, realpath, stat, readFile }
        }
      );
      expect(response.status).toBe(403);
      expect(realpath).not.toHaveBeenCalled();
      expect(stat).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    }
  );

  it("returns 403 for anything inside the `.pergamum.lock` write-lock directory", async () => {
    const realpath = vi.fn();
    const readFile = vi.fn();
    const deps = makeDeps({});
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/.pergamum.lock/held.png" },
      { ...deps, fileSystem: { ...deps.fileSystem, realpath, readFile } }
    );
    expect(response.status).toBe(403);
    expect(realpath).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns 415 for an unsupported extension without reading the file", async () => {
    const readFile = vi.fn();
    const deps = makeDeps({
      entries: { [insideProject("diagram.svg")]: { bytes: PNG_BYTES } }
    });
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/diagram.svg" },
      { ...deps, fileSystem: { ...deps.fileSystem, readFile } }
    );
    expect(response.status).toBe(415);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("returns 415 when the magic bytes disagree with the extension", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/a.png" },
      makeDeps({
        entries: { [insideProject("a.png")]: { bytes: JPEG_BYTES } }
      })
    );
    expect(response.status).toBe(415);
  });

  it("returns 415 when the bytes are not a supported image at all", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/a.png" },
      makeDeps({
        entries: {
          [insideProject("a.png")]: {
            bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
          }
        }
      })
    );
    expect(response.status).toBe(415);
  });

  it("returns 404 for a directory target (even one named like an image)", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/weird.png" },
      makeDeps({
        entries: { [insideProject("weird.png")]: { isDirectory: true } }
      })
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for a nonexistent file", async () => {
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/missing.png" },
      makeDeps({})
    );
    expect(response.status).toBe(404);
  });

  it("returns 413 for a file over the size cap without reading it", async () => {
    const readFile = vi.fn();
    const deps = makeDeps({
      maxBytes: 10,
      entries: {
        [insideProject("big.png")]: { bytes: PNG_BYTES, size: 11 }
      }
    });
    const response = await handlePergamumAssetRequest(
      { url: "pergamum-asset://project/big.png" },
      { ...deps, fileSystem: { ...deps.fileSystem, readFile } }
    );
    expect(response.status).toBe(413);
    expect(readFile).not.toHaveBeenCalled();
  });
});

describe("registerPergamumAssetProtocol (#409)", () => {
  it("registers a handler on the pergamum-asset scheme", () => {
    const handle = vi.fn();
    registerPergamumAssetProtocol({
      protocol: { handle },
      currentProjectRootPath: () => PROJECT_ROOT,
      fileSystem: fakeFileSystem({}),
      platform: PLATFORM
    });
    expect(handle).toHaveBeenCalledWith(
      PERGAMUM_ASSET_SCHEME,
      expect.any(Function)
    );
  });
});
