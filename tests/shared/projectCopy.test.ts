import { describe, expect, it } from "vitest";
import {
  COPY_ENTRIES_VALIDATION_ERROR_REASONS,
  COPY_ENTRY_EXECUTION_FAILURE_REASONS,
  copyStemForCount,
  parseCopyStem,
  resolveCopyName,
  splitCopyBaseName
} from "../../src/shared/projectCopy";

describe("projectCopy — name ladder (#356)", () => {
  it("splits a file basename into stem + extension, folders never split", () => {
    expect(splitCopyBaseName("chapter.md", false)).toEqual(["chapter", ".md"]);
    expect(splitCopyBaseName("archive.tar.gz", false)).toEqual([
      "archive.tar",
      ".gz"
    ]);
    expect(splitCopyBaseName(".gitignore", false)).toEqual([".gitignore", ""]);
    expect(splitCopyBaseName("notes", true)).toEqual(["notes", ""]);
    expect(splitCopyBaseName("notes.d", true)).toEqual(["notes.d", ""]);
  });

  it("parses a stem that already sits on the copy ladder", () => {
    expect(parseCopyStem("chapter")).toEqual({ base: "chapter", count: 0 });
    expect(parseCopyStem("chapter copy")).toEqual({ base: "chapter", count: 1 });
    expect(parseCopyStem("chapter copy 2")).toEqual({
      base: "chapter",
      count: 2
    });
    expect(parseCopyStem("my copy notes")).toEqual({
      base: "my copy notes",
      count: 0
    });
  });

  it("builds the stem for a ladder position", () => {
    expect(copyStemForCount("chapter", 1)).toBe("chapter copy");
    expect(copyStemForCount("chapter", 2)).toBe("chapter copy 2");
    expect(copyStemForCount("chapter", 3)).toBe("chapter copy 3");
  });

  it("uses duplicate semantics even when the plain name is free", () => {
    const r = resolveCopyName("chapter.md", false, () => false);
    expect(r.name).toBe("chapter copy.md");
    expect(r.firstChoiceName).toBe("chapter copy.md");
    expect(r.wasAutoRenamed).toBe(false);
  });

  it("advances the ladder for files when a rung is taken", () => {
    const taken = new Set(["chapter copy.md"]);
    const r = resolveCopyName("chapter.md", false, (n) => taken.has(n));
    expect(r.name).toBe("chapter copy 2.md");
    expect(r.wasAutoRenamed).toBe(true);

    const taken2 = new Set(["chapter copy.md", "chapter copy 2.md"]);
    expect(
      resolveCopyName("chapter.md", false, (n) => taken2.has(n)).name
    ).toBe("chapter copy 3.md");
  });

  it("advances the ladder for a source already named '<x> copy'", () => {
    const r = resolveCopyName("chapter copy.md", false, () => false);
    expect(r.name).toBe("chapter copy 2.md");
    expect(r.wasAutoRenamed).toBe(false);

    const r2 = resolveCopyName("chapter copy 2.md", false, () => false);
    expect(r2.name).toBe("chapter copy 3.md");
  });

  it("ladders folder names without extension splitting", () => {
    expect(resolveCopyName("notes", true, () => false).name).toBe("notes copy");
    const taken = new Set(["notes copy"]);
    expect(resolveCopyName("notes", true, (n) => taken.has(n)).name).toBe(
      "notes copy 2"
    );
    expect(resolveCopyName("notes copy", true, () => false).name).toBe(
      "notes copy 2"
    );
  });

  it("folds NFC + case when testing whether a candidate name is taken", () => {
    // caller receives the NFC + lower-cased candidate
    const seen: string[] = [];
    resolveCopyName("Chapter.MD", false, (n) => {
      seen.push(n);
      return false;
    });
    expect(seen).toEqual(["chapter copy.md"]);
  });

  it("preserves the file extension along the whole ladder", () => {
    const taken = new Set(["report copy.markdown", "report copy 2.markdown"]);
    const r = resolveCopyName("report.markdown", false, (n) => taken.has(n));
    expect(r.name).toBe("report copy 3.markdown");
  });

  it("exposes stable reason taxonomies", () => {
    expect(COPY_ENTRIES_VALIDATION_ERROR_REASONS).toContain("ancestor-symlink");
    expect(COPY_ENTRIES_VALIDATION_ERROR_REASONS).toContain(
      "source-contains-symlink"
    );
    expect(new Set(COPY_ENTRIES_VALIDATION_ERROR_REASONS).size).toBe(
      COPY_ENTRIES_VALIDATION_ERROR_REASONS.length
    );
    expect(COPY_ENTRY_EXECUTION_FAILURE_REASONS).toContain("copy-plan-stale");
    expect(new Set(COPY_ENTRY_EXECUTION_FAILURE_REASONS).size).toBe(
      COPY_ENTRY_EXECUTION_FAILURE_REASONS.length
    );
  });
});
