import { describe, expect, it } from "vitest";
import type { ProjectTextSearchResult } from "../../src/renderer/projectTextSearch";
import {
  REPLACE_PREVIEW_CANDIDATE_LIMIT,
  buildReplacePreviewCandidates
} from "../../src/renderer/replace/replacePreviewCandidates";

function result(
  files: ProjectTextSearchResult["files"],
  overrides: Partial<ProjectTextSearchResult> = {}
): ProjectTextSearchResult {
  return {
    query: "q",
    files,
    totalMatches: files.reduce((n, f) => n + f.matches.length, 0),
    fileCount: files.length,
    truncated: false,
    skippedFileCount: 0,
    documentCount: files.length,
    searchedCharacterCount: 0,
    ...overrides
  };
}

describe("buildReplacePreviewCandidates (#386)", () => {
  it("maps each match to a candidate, grouped-ready by file, with context split at the match", () => {
    const { candidates, limitReached } = buildReplacePreviewCandidates(
      result([
        {
          relativePath: "chapters/01.md",
          name: "01.md",
          truncated: false,
          matches: [
            {
              startOffset: 40,
              endOffset: 44,
              line: 3,
              column: 6,
              previewText: "その メイド は微笑んだ",
              previewMatchStart: 3,
              previewMatchEnd: 6,
              matchedText: "メイド"
            }
          ]
        }
      ]),
      "使用人"
    );

    expect(limitReached).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "chapters/01.md:40",
      fileId: "chapters/01.md",
      fileLabel: "01.md",
      filePath: "chapters/01.md",
      line: 3,
      column: 6,
      contextBefore: "その ",
      contextAfter: " は微笑んだ",
      beforeText: "メイド",
      afterText: "使用人",
      enabled: true,
      truncatedStart: false,
      truncatedEnd: false
    });
  });

  it("clips long context and flags truncation on both sides", () => {
    const before = "あ".repeat(60);
    const after = "い".repeat(60);
    const { candidates } = buildReplacePreviewCandidates(
      result([
        {
          relativePath: "a.md",
          name: "a.md",
          truncated: false,
          matches: [
            {
              startOffset: 0,
              endOffset: 4,
              line: 1,
              column: 1,
              previewText: `${before}メイド${after}`,
              previewMatchStart: before.length,
              previewMatchEnd: before.length + 3,
              matchedText: "メイド"
            }
          ]
        }
      ]),
      "X"
    );

    expect(candidates[0].contextBefore.length).toBe(24);
    expect(candidates[0].contextAfter.length).toBe(24);
    expect(candidates[0].truncatedStart).toBe(true);
    expect(candidates[0].truncatedEnd).toBe(true);
  });

  it("omits filePath when the file name is the whole relative path", () => {
    const { candidates } = buildReplacePreviewCandidates(
      result([
        {
          relativePath: "top.md",
          name: "top.md",
          truncated: false,
          matches: [
            {
              startOffset: 0,
              endOffset: 2,
              line: 1,
              column: 1,
              previewText: "ab",
              previewMatchStart: 0,
              previewMatchEnd: 2,
              matchedText: "ab"
            }
          ]
        }
      ]),
      ""
    );
    expect(candidates[0].filePath).toBeUndefined();
  });

  it("returns nothing for a result with no files", () => {
    expect(buildReplacePreviewCandidates(result([]), "x")).toEqual({
      candidates: [],
      limitReached: false
    });
  });

  it("does not inherit the Search pane's 1000-result cap - its own limit is far higher", () => {
    expect(REPLACE_PREVIEW_CANDIDATE_LIMIT).toBeGreaterThan(1000);
  });

  it("carries limitReached through when the source search truncated", () => {
    const { candidates, limitReached } = buildReplacePreviewCandidates(
      result(
        [
          {
            relativePath: "a.md",
            name: "a.md",
            truncated: true,
            matches: [
              {
                startOffset: 0,
                endOffset: 1,
                line: 1,
                column: 1,
                previewText: "x",
                previewMatchStart: 0,
                previewMatchEnd: 1,
                matchedText: "x"
              }
            ]
          }
        ],
        { truncated: true }
      ),
      "y"
    );
    expect(candidates).toHaveLength(1);
    expect(limitReached).toBe(true);
  });

  it("stops at the given candidate limit and flags limitReached", () => {
    const matches = Array.from({ length: 5 }, (_unused, index) => ({
      startOffset: index,
      endOffset: index + 1,
      line: 1,
      column: index + 1,
      previewText: "x",
      previewMatchStart: 0,
      previewMatchEnd: 1,
      matchedText: "x"
    }));
    const { candidates, limitReached } = buildReplacePreviewCandidates(
      result([{ relativePath: "a.md", name: "a.md", truncated: false, matches }]),
      "y",
      3
    );
    expect(candidates).toHaveLength(3);
    expect(limitReached).toBe(true);
  });
});
