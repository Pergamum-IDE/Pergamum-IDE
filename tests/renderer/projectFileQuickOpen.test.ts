import { describe, expect, it } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import {
  filterProjectFileQuickOpenCandidates,
  isProjectFileQuickOpenDocument,
  projectFileQuickOpenCandidates,
  resolveProjectFileQuickOpenSelection
} from "../../src/renderer/projectFileQuickOpen";

function document(relativePath: string): ProjectDocument {
  return {
    relativePath,
    name: relativePath.split(/[\\/]/).pop() ?? relativePath
  };
}

describe("project file quick open candidates (#143)", () => {
  it("returns no candidates when no Project documents are available", () => {
    expect(
      projectFileQuickOpenCandidates({
        documents: [],
        query: "chapter"
      })
    ).toEqual([]);
  });

  it("includes Project .md and .markdown documents", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [
        document("chapter-01.md"),
        document("appendix.markdown"),
        document("notes.txt")
      ],
      query: "a"
    });

    expect(candidates.map((candidate) => candidate.document.relativePath)).toEqual([
      "appendix.markdown"
    ]);
    expect(
      filterProjectFileQuickOpenCandidates({
        documents: [document("chapter-01.md"), document("appendix.markdown")],
        query: "chapter"
      }).map((candidate) => candidate.document.relativePath)
    ).toEqual(["chapter-01.md"]);
  });

  it("excludes reserved, protected, and internal Project paths", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [
        document("Drafts/chapter.md"),
        document(".pergamum/state.md"),
        document(".pergamum_recovery/candidate.md"),
        document(".pergamum.lock/stale.md"),
        document(".pergamum.lock.stale-20260901/meta.md"),
        document(".git/hooks.md"),
        document("pergamum.json/readme.md"),
        document("Novel.pergamum-journal/log.md")
      ],
      query: "d"
    });

    expect(candidates.map((candidate) => candidate.document.relativePath)).toEqual([
      "Drafts/chapter.md"
    ]);
    expect(isProjectFileQuickOpenDocument(document(".pergamum/state.md"))).toBe(
      false
    );
  });

  it("prioritizes filename prefix matches over relative path segment prefix matches", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [
        document("book/chapter.md"),
        document("chapter-notes/index.md"),
        document("chapter-alpha.md")
      ],
      query: "chapter"
    });

    expect(
      candidates.map((candidate) => [
        candidate.matchKind,
        candidate.document.relativePath
      ])
    ).toEqual([
      ["filename", "chapter-alpha.md"],
      ["filename", "book/chapter.md"],
      ["relativePath", "chapter-notes/index.md"]
    ]);
  });

  it("matches nested folder segment prefixes", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [
        document("manuscripts/Drafts/chapter01.md"),
        document("manuscripts/part1/chapter02.md"),
        document("notes/chapter03.md")
      ],
      query: "dra"
    });

    expect(candidates.map((candidate) => candidate.document.relativePath)).toEqual([
      "manuscripts/Drafts/chapter01.md"
    ]);
    expect(candidates[0]?.matchKind).toBe("relativePath");
  });

  it("highlights only the matching nested segment on the relative path line", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [document("manuscripts/Drafts/chapter01.md")],
      query: "dra"
    });

    expect(candidates[0]?.filename.ranges).toEqual([]);
    expect(candidates[0]?.relativePath.ranges).toEqual([{ start: 12, end: 15 }]);
  });

  it("does not match substrings inside a path segment", () => {
    expect(
      filterProjectFileQuickOpenCandidates({
        documents: [document("manuscripts/part1/chapter01.md")],
        query: "art"
      })
    ).toEqual([]);
  });

  it("sorts stably inside each rank by filename and then relative path", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [
        document("b/alpha.md"),
        document("a/alpha.md"),
        document("root/able.md"),
        document("able.md")
      ],
      query: "a"
    });

    expect(candidates.map((candidate) => candidate.document.relativePath)).toEqual([
      "able.md",
      "root/able.md",
      "a/alpha.md",
      "b/alpha.md"
    ]);
  });

  it("normalizes display separators to forward slash", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [document("Drafts\\chapter.md")],
      query: "drafts"
    });

    expect(candidates[0]?.relativePath.text).toBe("Drafts/chapter.md");
    expect(candidates[0]?.filename.text).toBe("chapter.md");
  });

  it("matches Windows-separated nested path segments after normalization", () => {
    const candidates = filterProjectFileQuickOpenCandidates({
      documents: [document("manuscripts\\Drafts\\chapter.md")],
      query: "dra"
    });

    expect(candidates[0]?.relativePath.text).toBe("manuscripts/Drafts/chapter.md");
    expect(candidates[0]?.relativePath.ranges).toEqual([{ start: 12, end: 15 }]);
  });

  it("reports match ranges only on the matching display line", () => {
    const filenameMatch = filterProjectFileQuickOpenCandidates({
      documents: [document("Drafts/chapter.md")],
      query: "chap"
    })[0];
    const pathMatch = filterProjectFileQuickOpenCandidates({
      documents: [document("Drafts/chapter.md")],
      query: "drafts"
    })[0];

    expect(filenameMatch?.filename.ranges).toEqual([{ start: 0, end: 4 }]);
    expect(filenameMatch?.relativePath.ranges).toEqual([]);
    expect(pathMatch?.filename.ranges).toEqual([]);
    expect(pathMatch?.relativePath.ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it("includes all Project documents for an empty query (#405)", () => {
    const candidates = projectFileQuickOpenCandidates({
      documents: [document("b.md"), document("a.md")],
      query: ""
    });

    expect(candidates.map((candidate) => candidate.document.relativePath)).toEqual([
      "a.md",
      "b.md"
    ]);
  });

  it("returns no empty-query candidates when the Project has no documents (#405)", () => {
    expect(
      projectFileQuickOpenCandidates({
        documents: [],
        query: ""
      })
    ).toEqual([]);
  });

  it("returns all Project documents without limiting to five candidates (#405)", () => {
    const documents = [
      "01.md",
      "02.md",
      "03.md",
      "04.md",
      "05.md",
      "06.md"
    ].map(document);

    expect(
      projectFileQuickOpenCandidates({
        documents,
        query: ""
      }).map((candidate) => candidate.document.relativePath)
    ).toEqual(documents.map((doc) => doc.relativePath));
  });

  it("provides empty match ranges for empty or whitespace query (#405)", () => {
    const candidates = projectFileQuickOpenCandidates({
      documents: [document("folder/chapter.md")],
      query: ""
    });

    expect(candidates[0]?.filename.ranges).toEqual([]);
    expect(candidates[0]?.relativePath.ranges).toEqual([]);

    const whitespaceCandidates = projectFileQuickOpenCandidates({
      documents: [document("folder/chapter.md")],
      query: "   "
    });

    expect(whitespaceCandidates[0]?.filename.ranges).toEqual([]);
    expect(whitespaceCandidates[0]?.relativePath.ranges).toEqual([]);
  });

  it("normalizes the quick-open selected index for executable file candidates", () => {
    const candidates = projectFileQuickOpenCandidates({
      documents: [document("a.md"), document("b.md")],
      query: "a"
    });

    expect(resolveProjectFileQuickOpenSelection(candidates)).toBe(0);
    expect(resolveProjectFileQuickOpenSelection(candidates, 0)).toBe(0);
    expect(resolveProjectFileQuickOpenSelection(candidates, 9)).toBe(0);
    expect(resolveProjectFileQuickOpenSelection([])).toBeNull();
  });
});
