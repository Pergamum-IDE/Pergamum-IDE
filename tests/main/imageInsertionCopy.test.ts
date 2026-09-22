import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyImageInsertionFiles,
  planImageInsertionCopy,
  type ImageInsertionCopyDeps,
  type ImageInsertionFileSystem
} from "../../src/main/imageInsertionCopy";

let projectRoot = "";
let sourceDir = "";

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-img-ins-proj-"));
  sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-img-ins-src-"));
});

afterEach(async () => {
  await fs.rm(projectRoot, { recursive: true, force: true });
  await fs.rm(sourceDir, { recursive: true, force: true });
});

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);

async function writeSourceFile(fileName: string, bytes: Buffer): Promise<string> {
  const sourcePath = path.join(sourceDir, fileName);
  await fs.writeFile(sourcePath, bytes);
  return sourcePath;
}

function deps(extra: ImageInsertionCopyDeps = {}): ImageInsertionCopyDeps {
  return {
    fileSystem: fs as unknown as ImageInsertionFileSystem,
    platform: process.platform === "win32" ? "windows" : "linux",
    ...extra
  };
}

describe("planImageInsertionCopy", () => {
  it("uses the original source file name for the destination", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);

    const result = await planImageInsertionCopy(
      { saveDirectory: "assets/images", sourcePaths: [sourcePath] },
      projectRoot,
      deps()
    );

    expect(result).toMatchObject({
      ok: true,
      entries: [
        {
          sourcePath,
          fileName: "foo.png",
          destinationRelativePath: "assets/images/foo.png",
          willOverwrite: false
        }
      ],
      rejected: []
    });
  });

  it("produces multiple plan entries in selection order for multiple files", async () => {
    const fooPath = await writeSourceFile("foo.png", PNG);
    const barPath = await writeSourceFile("bar.jpg", JPEG);

    const result = await planImageInsertionCopy(
      { saveDirectory: "images", sourcePaths: [fooPath, barPath] },
      projectRoot,
      deps()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entries.map((e) => e.fileName)).toEqual(["foo.png", "bar.jpg"]);
  });

  it("detects a destination conflict as willOverwrite", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);
    await fs.mkdir(path.join(projectRoot, "images"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "images", "foo.png"), Buffer.from("existing"));

    const result = await planImageInsertionCopy(
      { saveDirectory: "images", sourcePaths: [sourcePath] },
      projectRoot,
      deps()
    );

    expect(result).toMatchObject({
      ok: true,
      entries: [{ fileName: "foo.png", willOverwrite: true }]
    });
  });

  it("rejects an unsupported image format without failing the whole plan", async () => {
    const goodPath = await writeSourceFile("foo.png", PNG);
    const badPath = await writeSourceFile("not-an-image.txt", Buffer.from("hello"));

    const result = await planImageInsertionCopy(
      { saveDirectory: "images", sourcePaths: [goodPath, badPath] },
      projectRoot,
      deps()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entries.map((e) => e.fileName)).toEqual(["foo.png"]);
    expect(result.rejected).toEqual([
      { sourcePath: badPath, reason: "unsupportedFormat" }
    ]);
  });

  it("rejects an unreadable source file without failing the whole plan", async () => {
    const goodPath = await writeSourceFile("foo.png", PNG);
    const missingPath = path.join(sourceDir, "missing.png");

    const result = await planImageInsertionCopy(
      { saveDirectory: "images", sourcePaths: [goodPath, missingPath] },
      projectRoot,
      deps()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entries.map((e) => e.fileName)).toEqual(["foo.png"]);
    expect(result.rejected).toEqual([
      { sourcePath: missingPath, reason: "sourceUnreadable" }
    ]);
  });

  it("fails with invalidPath for a save directory that escapes the project root", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);

    const result = await planImageInsertionCopy(
      { saveDirectory: "../outside", sourcePaths: [sourcePath] },
      projectRoot,
      deps()
    );

    expect(result).toEqual({ ok: false, reason: "invalidPath" });
  });
});

describe("copyImageInsertionFiles", () => {
  it("copies files preserving the original file name", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);

    const result = await copyImageInsertionFiles(
      { saveDirectory: "images", sourcePaths: [sourcePath], allowOverwrite: false },
      projectRoot,
      deps()
    );

    expect(result).toEqual({ ok: true, relativePaths: ["images/foo.png"] });
    const onDisk = await fs.readFile(path.join(projectRoot, "images", "foo.png"));
    expect(new Uint8Array(onDisk)).toEqual(new Uint8Array(PNG));
  });

  it("copies multiple files in order", async () => {
    const fooPath = await writeSourceFile("foo.png", PNG);
    const barPath = await writeSourceFile("bar.jpg", JPEG);

    const result = await copyImageInsertionFiles(
      {
        saveDirectory: "images",
        sourcePaths: [fooPath, barPath],
        allowOverwrite: false
      },
      projectRoot,
      deps()
    );

    expect(result).toEqual({
      ok: true,
      relativePaths: ["images/foo.png", "images/bar.jpg"]
    });
  });

  it("refuses to overwrite an existing file when allowOverwrite is false", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);
    await fs.mkdir(path.join(projectRoot, "images"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "images", "foo.png"), Buffer.from("existing"));

    const result = await copyImageInsertionFiles(
      { saveDirectory: "images", sourcePaths: [sourcePath], allowOverwrite: false },
      projectRoot,
      deps()
    );

    expect(result).toEqual({ ok: false, reason: "overwriteNotAllowed" });
    const onDisk = await fs.readFile(path.join(projectRoot, "images", "foo.png"), "utf8");
    expect(onDisk).toBe("existing");
  });

  it("overwrites an existing file when allowOverwrite is true", async () => {
    const sourcePath = await writeSourceFile("foo.png", PNG);
    await fs.mkdir(path.join(projectRoot, "images"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "images", "foo.png"), Buffer.from("existing"));

    const result = await copyImageInsertionFiles(
      { saveDirectory: "images", sourcePaths: [sourcePath], allowOverwrite: true },
      projectRoot,
      deps()
    );

    expect(result).toEqual({ ok: true, relativePaths: ["images/foo.png"] });
    const onDisk = await fs.readFile(path.join(projectRoot, "images", "foo.png"));
    expect(new Uint8Array(onDisk)).toEqual(new Uint8Array(PNG));
  });

  it("stops the whole batch on the first unsupported file without partial Markdown-worthy success", async () => {
    const goodPath = await writeSourceFile("foo.png", PNG);
    const badPath = await writeSourceFile("not-an-image.txt", Buffer.from("hello"));

    const result = await copyImageInsertionFiles(
      {
        saveDirectory: "images",
        sourcePaths: [goodPath, badPath],
        allowOverwrite: false
      },
      projectRoot,
      deps()
    );

    expect(result).toEqual({ ok: false, reason: "unsupportedFormat" });
  });
});
