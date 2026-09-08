import { Buffer } from "node:buffer";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dryRunTextImport,
  executeTextImport,
  previewTextImportFile,
  previewTextImportFiles
} from "../../src/main/textImport";
import type {
  ExecuteTextImportResult,
  TextImportDryRunResult
} from "../../src/shared/textImport";

const projectId = "019a0000-0000-7000-8000-000000000420";

function expectDryRunOk(
  result: TextImportDryRunResult
): Extract<TextImportDryRunResult, { ok: true }> {
  expect(result).toMatchObject({ ok: true });

  return result as Extract<TextImportDryRunResult, { ok: true }>;
}

function expectExecuteOk(
  result: ExecuteTextImportResult
): Extract<ExecuteTextImportResult, { ok: true }> {
  expect(result).toMatchObject({ ok: true });

  return result as Extract<ExecuteTextImportResult, { ok: true }>;
}

async function writeBytes(
  filePath: string,
  data: string | Uint8Array
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("text import core (#420 Step 1)", () => {
  let projectRootPath: string;
  let externalRootPath: string;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-text-import-project-")
    );
    externalRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-text-import-source-")
    );
    await fs.mkdir(path.join(projectRootPath, "chapters"));
  });

  afterEach(async () => {
    await fs.rm(projectRootPath, { recursive: true, force: true });
    await fs.rm(externalRootPath, { recursive: true, force: true });
  });

  it("dry-runs a single .txt file into destination/foo.md without writing", async () => {
    const sourcePath = path.join(externalRootPath, "foo.txt");
    await writeBytes(sourcePath, "本文");

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    );

    expect(result.files).toMatchObject([
      {
        sourcePath,
        sourceDisplayPath: "foo.txt",
        targetProjectRelativePath: "chapters/foo.md",
        originalTargetProjectRelativePath: "chapters/foo.md",
        selectedEncoding: "utf8",
        bomKind: "none",
        renamed: false,
        skipped: false,
        previewHead: "本文",
        previewTail: "本文"
      }
    ]);
    await expect(
      fs.access(path.join(projectRootPath, "chapters", "foo.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("dry-runs multiple .txt files directly under the destination", async () => {
    const first = path.join(externalRootPath, "01.txt");
    const second = path.join(externalRootPath, "02.txt");
    await writeBytes(first, "一");
    await writeBytes(second, "二");

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [first, second]
        }
      })
    );

    expect(result.files.map((file) => file.targetProjectRelativePath)).toEqual([
      "chapters/01.md",
      "chapters/02.md"
    ]);
  });

  it("preserves dropped folder structure and nested folders", async () => {
    const sourceRoot = path.join(externalRootPath, "原稿");
    await writeBytes(path.join(sourceRoot, "第一部", "01.txt"), "第一");
    await writeBytes(path.join(sourceRoot, "第一部", "02.txt"), "第二");
    await writeBytes(path.join(sourceRoot, "第二部", "03.txt"), "第三");

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourceRoot]
        }
      })
    );

    expect(result.files.map((file) => file.targetProjectRelativePath)).toEqual([
      "chapters/原稿/第一部/01.md",
      "chapters/原稿/第一部/02.md",
      "chapters/原稿/第二部/03.md"
    ]);
    expect(result.folders.map((folder) => folder.targetProjectRelativePath)).toEqual([
      "chapters/原稿",
      "chapters/原稿/第一部",
      "chapters/原稿/第二部"
    ]);
  });

  it("marks non-.txt files as skipped and propagates folder skipped state", async () => {
    const sourceRoot = path.join(externalRootPath, "原稿");
    await writeBytes(path.join(sourceRoot, "本文.txt"), "本文");
    await writeBytes(path.join(sourceRoot, "cover.png"), Uint8Array.from([1, 2]));

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourceRoot]
        }
      })
    );

    expect(result.files).toContainEqual(
      expect.objectContaining({
        sourcePath: path.join(sourceRoot, "cover.png"),
        skipped: true,
        skipReason: "notTextFile"
      })
    );
    expect(result.folders).toContainEqual(
      expect.objectContaining({
        targetProjectRelativePath: "chapters/原稿",
        hasSkippedDescendant: true
      })
    );
  });

  it("renames foo.md conflicts to foo.imported.md and skips when both exist", async () => {
    const sourcePath = path.join(externalRootPath, "foo.txt");
    await writeBytes(sourcePath, "本文");
    await writeBytes(path.join(projectRootPath, "chapters", "foo.md"), "old");

    const renamed = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    );

    expect(renamed.files[0]).toMatchObject({
      targetProjectRelativePath: "chapters/foo.imported.md",
      originalTargetProjectRelativePath: "chapters/foo.md",
      renamed: true,
      skipped: false
    });

    await writeBytes(
      path.join(projectRootPath, "chapters", "foo.imported.md"),
      "old"
    );

    const skipped = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    );

    expect(skipped.files[0]).toMatchObject({
      targetProjectRelativePath: "chapters/foo.imported.md",
      skipped: true,
      skipReason: "targetExists"
    });
  });

  it("skips invalid project targets caused by reserved path segments", async () => {
    const sourceRoot = path.join(externalRootPath, ".git");
    await writeBytes(path.join(sourceRoot, "a.txt"), "本文");

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourceRoot]
        }
      })
    );

    expect(result.files[0]).toMatchObject({
      targetProjectRelativePath: "chapters/.git/a.md",
      skipped: true,
      skipReason: "invalidProjectPath"
    });
  });

  it("reports missing sources as skipped sourceMissing", async () => {
    const sourcePath = path.join(externalRootPath, "missing.txt");

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    );

    expect(result.files[0]).toMatchObject({
      sourcePath,
      skipped: true,
      skipReason: "sourceMissing"
    });
  });

  it("reflects BOM-selected default encoding and preview text in dry-run", async () => {
    const sourcePath = path.join(externalRootPath, "bom.txt");
    await writeBytes(
      sourcePath,
      Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from("本文")])
    );

    const result = expectDryRunOk(
      await dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    );

    expect(result.files[0]).toMatchObject({
      selectedEncoding: "utf8Bom",
      bomKind: "utf8",
      previewHead: "本文",
      previewTail: "本文"
    });
  });

  it("previewTextImportFile uses the requested encoding and reports decode failure", async () => {
    const sourcePath = path.join(externalRootPath, "sjis.txt");
    await writeBytes(
      sourcePath,
      Uint8Array.from([
        0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
      ])
    );

    await expect(
      previewTextImportFile({ sourcePath, encoding: "shiftJis" })
    ).resolves.toMatchObject({
      ok: true,
      previewHead: "日本語①",
      previewTail: "日本語①",
      bomKind: "none"
    });
    await expect(
      previewTextImportFile({ sourcePath, encoding: "utf8" })
    ).resolves.toEqual({ ok: false, reason: "decodeFailed" });
  });

  it("previewTextImportFiles previews multiple files with stable ids, order, and per-file failures", async () => {
    const utf8Path = path.join(externalRootPath, "utf8.txt");
    const sjisPath = path.join(externalRootPath, "sjis.txt");
    const invalidPath = path.join(externalRootPath, "invalid.txt");
    const missingPath = path.join(externalRootPath, "missing.txt");
    const longText = `${"a".repeat(25)}FULL_TEXT_MIDDLE${"b".repeat(25)}`;
    await writeBytes(
      utf8Path,
      Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from(longText)])
    );
    await writeBytes(
      sjisPath,
      Uint8Array.from([
        0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
      ])
    );
    await writeBytes(invalidPath, Uint8Array.from([0xff]));

    const result = await previewTextImportFiles({
      files: [
        { id: "a", sourcePath: utf8Path, encoding: "utf8Bom" },
        { id: "b", sourcePath: sjisPath, encoding: "shiftJis" },
        { id: "c", sourcePath: invalidPath, encoding: "utf8" },
        { id: "d", sourcePath: missingPath, encoding: "utf8" }
      ]
    });

    expect(result).toMatchObject({
      ok: true,
      files: [
        {
          ok: true,
          id: "a",
          sourcePath: utf8Path,
          encoding: "utf8Bom",
          bomKind: "utf8",
          previewHead: "a".repeat(20),
          previewTail: "b".repeat(20)
        },
        {
          ok: true,
          id: "b",
          sourcePath: sjisPath,
          encoding: "shiftJis",
          bomKind: "none",
          previewHead: "日本語①",
          previewTail: "日本語①"
        },
        {
          ok: false,
          id: "c",
          sourcePath: invalidPath,
          encoding: "utf8",
          reason: "decodeFailed"
        },
        {
          ok: false,
          id: "d",
          sourcePath: missingPath,
          encoding: "utf8",
          reason: "sourceMissing"
        }
      ]
    });
    expect(result.ok && result.files.map((file) => file.id)).toEqual([
      "a",
      "b",
      "c",
      "d"
    ]);
    expect(JSON.stringify(result)).not.toContain("FULL_TEXT_MIDDLE");
    expect(JSON.stringify(result)).not.toContain("bytes");
    expect(JSON.stringify(result)).not.toContain("content");
  });

  it("previewTextImportFile reports sourceMissing", async () => {
    await expect(
      previewTextImportFile({
        sourcePath: path.join(externalRootPath, "missing.txt"),
        encoding: "utf8"
      })
    ).resolves.toEqual({ ok: false, reason: "sourceMissing" });
  });

  it("executes imports as UTF-8 Markdown, removes BOM, and creates parents", async () => {
    const sourcePath = path.join(externalRootPath, "nested", "bom.txt");
    await writeBytes(
      sourcePath,
      Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from("a\rb\nc\r\nd")])
    );

    const result = expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/imported/bom.md",
              encoding: "utf8Bom"
            }
          ],
          normalizeLineEndings: true,
          targetLineEnding: "crlf"
        }
      })
    );

    expect(result).toMatchObject({
      imported: [
        {
          sourcePath,
          targetProjectRelativePath: "chapters/imported/bom.md"
        }
      ],
      skipped: [],
      failed: []
    });
    await expect(
      fs.readFile(
        path.join(projectRootPath, "chapters", "imported", "bom.md"),
        "utf8"
      )
    ).resolves.toBe("a\r\nb\r\nc\r\nd");
  });

  it("executes imports with the selected Japanese encoding", async () => {
    const sourcePath = path.join(externalRootPath, "sjis.txt");
    await writeBytes(
      sourcePath,
      Uint8Array.from([
        0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
      ])
    );

    const result = expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/sjis.md",
              encoding: "shiftJis"
            }
          ],
          normalizeLineEndings: false,
          targetLineEnding: "lf"
        }
      })
    );

    expect(result.failed).toEqual([]);
    await expect(
      fs.readFile(path.join(projectRootPath, "chapters", "sjis.md"), "utf8")
    ).resolves.toBe("日本語①");
  });

  it("preserves decoded line endings when normalization is off", async () => {
    const sourcePath = path.join(externalRootPath, "mixed.txt");
    await writeBytes(sourcePath, "a\rb\nc\r\nd");

    expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/mixed.md",
              encoding: "utf8"
            }
          ],
          normalizeLineEndings: false,
          targetLineEnding: "lf"
        }
      })
    );

    await expect(
      fs.readFile(path.join(projectRootPath, "chapters", "mixed.md"), "utf8")
    ).resolves.toBe("a\rb\nc\r\nd");
  });

  it("does not import skipped files", async () => {
    const sourcePath = path.join(externalRootPath, "skip.txt");
    await writeBytes(sourcePath, "本文");

    const result = expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/skip.md",
              encoding: "utf8",
              skipped: true,
              skipReason: "targetExists"
            }
          ],
          normalizeLineEndings: true,
          targetLineEnding: "lf"
        }
      })
    );

    expect(result.imported).toEqual([]);
    expect(result.skipped).toEqual([
      {
        sourcePath,
        targetProjectRelativePath: "chapters/skip.md",
        reason: "targetExists"
      }
    ]);
    expect(
      await exists(path.join(projectRootPath, "chapters", "skip.md"))
    ).toBe(false);
  });

  it("rejects overwrite and reports targetExists", async () => {
    const sourcePath = path.join(externalRootPath, "exists.txt");
    const targetPath = path.join(projectRootPath, "chapters", "exists.md");
    await writeBytes(sourcePath, "new");
    await writeBytes(targetPath, "old");

    const result = expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/exists.md",
              encoding: "utf8"
            }
          ],
          normalizeLineEndings: true,
          targetLineEnding: "lf"
        }
      })
    );

    expect(result.failed).toEqual([
      {
        sourcePath,
        targetProjectRelativePath: "chapters/exists.md",
        reason: "targetExists"
      }
    ]);
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe("old");
  });

  it("reports invalid target paths and continues importing other files", async () => {
    const invalidSourcePath = path.join(externalRootPath, "invalid.txt");
    const validSourcePath = path.join(externalRootPath, "valid.txt");
    await writeBytes(invalidSourcePath, "invalid");
    await writeBytes(validSourcePath, "valid");

    const result = expectExecuteOk(
      await executeTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath: invalidSourcePath,
              targetProjectRelativePath: "../escape.md",
              encoding: "utf8"
            },
            {
              sourcePath: validSourcePath,
              targetProjectRelativePath: "chapters/valid.md",
              encoding: "utf8"
            }
          ],
          normalizeLineEndings: true,
          targetLineEnding: "lf"
        }
      })
    );

    expect(result.failed).toEqual([
      {
        sourcePath: invalidSourcePath,
        targetProjectRelativePath: "../escape.md",
        reason: "invalidProjectPath"
      }
    ]);
    expect(result.imported).toEqual([
      {
        sourcePath: validSourcePath,
        targetProjectRelativePath: "chapters/valid.md"
      }
    ]);
  });

  it("rejects project mismatch before reading or writing", async () => {
    const sourcePath = path.join(externalRootPath, "foo.txt");
    await writeBytes(sourcePath, "本文");

    await expect(
      dryRunTextImport({
        currentProjectId: projectId,
        projectRootPath,
        request: {
          projectId: "different-project",
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      })
    ).resolves.toEqual({ ok: false, reason: "projectMismatch" });
  });
});
