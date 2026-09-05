import { describe, expect, it } from "vitest";
import {
  collectMovedProjectDocumentRelocations,
  type MoveEntriesResult
} from "../../src/shared/projectMove";

function movedEntry(source: string, destination: string) {
  return {
    status: "moved" as const,
    sourceRelativePath: source,
    destinationRelativePath: destination,
    sourceAbsolutePath: `C:/Project/${source}`,
    destinationAbsolutePath: `C:/Project/${destination}`,
    isDirectory: false,
    movedProjectDocuments: []
  };
}

function failedEntry(source: string, destination: string) {
  return {
    status: "failed" as const,
    reason: "permission-denied" as const,
    sourceRelativePath: source,
    destinationRelativePath: destination,
    sourceAbsolutePath: `C:/Project/${source}`,
    destinationAbsolutePath: `C:/Project/${destination}`
  };
}

describe("collectMovedProjectDocumentRelocations (#338)", () => {
  it("maps every moved entry to an old -> new relocation", () => {
    const result: MoveEntriesResult = {
      ok: true,
      validation: { ok: true },
      results: [
        movedEntry("a.md", "Drafts/a.md"),
        movedEntry("Notes/b.md", "Archive/b.md")
      ],
      successfulPathPairs: []
    };

    expect(collectMovedProjectDocumentRelocations(result)).toEqual([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" },
      { oldRelativePath: "Notes/b.md", newRelativePath: "Archive/b.md" }
    ]);
  });

  it("ignores failed entries and keeps only the moved ones (partial failure)", () => {
    const result: MoveEntriesResult = {
      ok: false,
      validation: { ok: true },
      results: [
        movedEntry("a.md", "Drafts/a.md"),
        failedEntry("b.md", "Drafts/b.md")
      ],
      successfulPathPairs: []
    };

    expect(collectMovedProjectDocumentRelocations(result)).toEqual([
      { oldRelativePath: "a.md", newRelativePath: "Drafts/a.md" }
    ]);
  });

  it("returns nothing for a validation failure (empty results)", () => {
    const result: MoveEntriesResult = {
      ok: false,
      validation: {
        ok: false,
        errors: [{ reason: "same-parent", sourceRelativePath: "a.md" }]
      },
      results: [],
      successfulPathPairs: []
    };

    expect(collectMovedProjectDocumentRelocations(result)).toEqual([]);
  });

  it("returns nothing when every entry failed", () => {
    const result: MoveEntriesResult = {
      ok: false,
      validation: { ok: true },
      results: [failedEntry("a.md", "Drafts/a.md")],
      successfulPathPairs: []
    };

    expect(collectMovedProjectDocumentRelocations(result)).toEqual([]);
  });
});
