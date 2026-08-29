import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  resolveRecoveredPath,
  restoreRecoveryRow,
  type RecoveryRestoreFileSystem,
  type RecoveryRestoreRow
} from "../../src/main/recoveryRestore";

function existsFromSet(taken: Iterable<string>) {
  const set = new Set(taken);
  return (target: string) => Promise.resolve(set.has(target));
}

describe("resolveRecoveredPath", () => {
  it("uses <stem>.recovered<ext> in the original directory", async () => {
    const resolved = await resolveRecoveredPath(
      "/novel/chapter-03.md",
      existsFromSet([])
    );
    expect(resolved).toBe(path.join("/novel", "chapter-03.recovered.md"));
  });

  it("walks -2, -3, … past existing recovered files", async () => {
    const resolved = await resolveRecoveredPath(
      "/novel/chapter-03.md",
      existsFromSet([
        path.join("/novel", "chapter-03.recovered.md"),
        path.join("/novel", "chapter-03.recovered-2.md"),
        path.join("/novel", "chapter-03.recovered-3.md")
      ])
    );
    expect(resolved).toBe(path.join("/novel", "chapter-03.recovered-4.md"));
  });

  it("keeps a dotted stem intact and defaults a missing extension to .md", async () => {
    expect(
      await resolveRecoveredPath("/x/my.notes.md", existsFromSet([]))
    ).toBe(path.join("/x", "my.notes.recovered.md"));
    expect(
      await resolveRecoveredPath("/x/draft", existsFromSet([]))
    ).toBe(path.join("/x", "draft.recovered.md"));
  });
});

function row(overrides: Partial<RecoveryRestoreRow> = {}): RecoveryRestoreRow {
  return {
    recoveryId: "rec-1",
    documentType: "markdown.file",
    displayName: "chapter-03.md",
    filePath: "/novel/chapter-03.md",
    payloadText: "# Chapter\r\nrecovered body",
    ...overrides
  };
}

describe("restoreRecoveryRow", () => {
  it("writes the payload verbatim to a fresh .recovered file (never the original)", async () => {
    const writeFileAtomic = vi.fn(async () => undefined);
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet(["/novel/chapter-03.md"]),
      writeFileAtomic
    };

    const result = await restoreRecoveryRow(row(), { fileSystem: fs });

    expect(result).toEqual({
      recoveryId: "rec-1",
      status: "written",
      writtenPath: path.join("/novel", "chapter-03.recovered.md"),
      displayName: "chapter-03.md",
      documentType: "markdown.file"
    });
    expect(writeFileAtomic).toHaveBeenCalledWith(
      path.join("/novel", "chapter-03.recovered.md"),
      "# Chapter\r\nrecovered body"
    );
    // Never the original path.
    expect(writeFileAtomic).not.toHaveBeenCalledWith(
      "/novel/chapter-03.md",
      expect.anything()
    );
  });

  it("never overwrites an existing recovered file", async () => {
    const writeFileAtomic = vi.fn(async () => undefined);
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet([
        path.join("/novel", "chapter-03.recovered.md")
      ]),
      writeFileAtomic
    };

    const result = await restoreRecoveryRow(row(), { fileSystem: fs });
    expect(result.writtenPath).toBe(
      path.join("/novel", "chapter-03.recovered-2.md")
    );
  });

  it("reports 'failed' and does not throw when the atomic write fails", async () => {
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet([]),
      writeFileAtomic: () => Promise.reject(new Error("disk full"))
    };
    const result = await restoreRecoveryRow(row(), { fileSystem: fs });
    expect(result.status).toBe("failed");
    expect(result.writtenPath).toBeUndefined();
  });

  it("writes an Untitled row next to the caller-provided target path", async () => {
    const writeFileAtomic = vi.fn(async () => undefined);
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet([]),
      writeFileAtomic
    };

    const result = await restoreRecoveryRow(
      row({
        documentType: "markdown.untitled",
        displayName: "Untitled.md",
        filePath: null,
        payloadText: "typed but never saved"
      }),
      { targetPath: "/proj/Untitled.md", fileSystem: fs }
    );

    expect(result.status).toBe("written");
    expect(result.writtenPath).toBe(
      path.join("/proj", "Untitled.recovered.md")
    );
  });

  it("reports 'needs-destination' for an Untitled row with no target path", async () => {
    const result = await restoreRecoveryRow(
      row({ documentType: "markdown.untitled", filePath: null }),
      {}
    );
    expect(result.status).toBe("needs-destination");
  });

  it("reports 'missing' for a file row with no stored path and no target path", async () => {
    const result = await restoreRecoveryRow(row({ filePath: null }), {});
    expect(result.status).toBe("missing");
  });

  it("uses the caller's target path for a markdown.file row whose stored path is missing", async () => {
    const writeFileAtomic = vi.fn(async () => undefined);
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet([]),
      writeFileAtomic
    };

    const result = await restoreRecoveryRow(
      row({ documentType: "markdown.file", filePath: null }),
      { targetPath: "/proj/lost.md", fileSystem: fs }
    );

    expect(result.status).toBe("written");
    expect(result.writtenPath).toBe(
      path.join("/proj", "lost.recovered.md")
    );
    expect(writeFileAtomic).toHaveBeenCalledWith(
      path.join("/proj", "lost.recovered.md"),
      "# Chapter\r\nrecovered body"
    );
    // Never the user-selected path itself.
    expect(writeFileAtomic).not.toHaveBeenCalledWith(
      "/proj/lost.md",
      expect.anything()
    );
  });

  it("prefers the stored path and ignores an incidental target path for a normal file row", async () => {
    const writeFileAtomic = vi.fn(async () => undefined);
    const fs: RecoveryRestoreFileSystem = {
      exists: existsFromSet([]),
      writeFileAtomic
    };
    const result = await restoreRecoveryRow(row(), {
      targetPath: "/somewhere/else.md",
      fileSystem: fs
    });
    expect(result.writtenPath).toBe(
      path.join("/novel", "chapter-03.recovered.md")
    );
  });
});
