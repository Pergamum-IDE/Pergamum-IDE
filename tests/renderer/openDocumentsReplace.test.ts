import { describe, expect, it } from "vitest";
import {
  applyReplacementEditsToText,
  generateOpenDocumentsReplaceCandidates,
  REPLACE_PREVIEW_CANDIDATE_LIMIT,
  type OpenDocumentReplaceTarget
} from "../../src/renderer/replace/openDocumentsReplace";

function target(
  overrides: Partial<OpenDocumentReplaceTarget> & { text: string }
): OpenDocumentReplaceTarget {
  return {
    documentId: overrides.documentId ?? "doc-1",
    fileLabel: overrides.fileLabel ?? "01.md",
    filePath: overrides.filePath,
    text: overrides.text
  };
}

const PLAIN = { caseSensitive: false, wholeWord: false, useRegex: false };

describe("generateOpenDocumentsReplaceCandidates - plain text (#386)", () => {
  it("generates candidates from open Markdown buffers with line:column, offsets and previews", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "line one\nその メイド は微笑んだ\nメイド again" })],
      "メイド",
      "使用人",
      PLAIN
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.candidates).toHaveLength(2);
    const [first] = result.candidates;
    expect(first).toMatchObject({
      documentId: "doc-1",
      fileId: "doc-1",
      fileLabel: "01.md",
      line: 2,
      column: 4,
      beforeText: "メイド",
      afterText: "使用人",
      enabled: true
    });
    expect(first.startOffset).toBe("line one\nその ".length);
    expect(first.endOffset).toBe(first.startOffset! + "メイド".length);
    expect(first.contextBefore).toContain("その ");
    expect(first.contextAfter).toContain("は微笑んだ");
  });

  it("respects Match Case", () => {
    const insensitive = generateOpenDocumentsReplaceCandidates(
      [target({ text: "Maid maid MAID" })],
      "maid",
      "x",
      { caseSensitive: false, wholeWord: false, useRegex: false }
    );
    const sensitive = generateOpenDocumentsReplaceCandidates(
      [target({ text: "Maid maid MAID" })],
      "maid",
      "x",
      { caseSensitive: true, wholeWord: false, useRegex: false }
    );
    expect(insensitive.status === "ok" && insensitive.candidates).toHaveLength(3);
    expect(sensitive.status === "ok" && sensitive.candidates).toHaveLength(1);
  });

  it("respects Whole Word, including the Japanese katakana-compound rule", () => {
    const withoutWholeWord = generateOpenDocumentsReplaceCandidates(
      [target({ text: "オーダーメイド 新人メイド" })],
      "メイド",
      "使用人",
      { caseSensitive: false, wholeWord: false, useRegex: false }
    );
    const withWholeWord = generateOpenDocumentsReplaceCandidates(
      [target({ text: "オーダーメイド 新人メイド" })],
      "メイド",
      "使用人",
      { caseSensitive: false, wholeWord: true, useRegex: false }
    );
    expect(
      withoutWholeWord.status === "ok" && withoutWholeWord.candidates.length
    ).toBe(2);
    // `オーダーメイド` is a katakana compound - whole-word excludes it.
    expect(
      withWholeWord.status === "ok" && withWholeWord.candidates.length
    ).toBe(1);
  });

  it("scans every open document, not just the first", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [
        target({ documentId: "a", fileLabel: "a.md", text: "x y x" }),
        target({ documentId: "b", fileLabel: "b.md", text: "x x x" })
      ],
      "x",
      "z",
      PLAIN
    );
    expect(result.status === "ok" && result.candidates.length).toBe(5);
    expect(
      result.status === "ok" &&
        new Set(result.candidates.map((c) => c.documentId)).size
    ).toBe(2);
  });

  it("is not bounded by the Search pane's 1000-result display cap", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "x".repeat(3000) })],
      "x",
      "y",
      PLAIN
    );
    expect(result.status === "ok" && result.candidates.length).toBe(3000);
  });

  it("exposes a preview safety ceiling far above the display cap (project scope caps to it)", () => {
    expect(REPLACE_PREVIEW_CANDIDATE_LIMIT).toBeGreaterThanOrEqual(50_000);
  });

  it("gives every candidate a unique id and enabled = true", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "a a a a" })],
      "a",
      "b",
      PLAIN
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(new Set(result.candidates.map((c) => c.id)).size).toBe(
      result.candidates.length
    );
    expect(result.candidates.every((c) => c.enabled)).toBe(true);
  });
});

describe("generateOpenDocumentsReplaceCandidates - regex (#386)", () => {
  it("fails preflight on an invalid regex", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "anything" })],
      "第(章",
      "$1",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    expect(result.status).toBe("invalidRegex");
  });

  it("expands capture references in the after preview", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "第一章 と 第二章" })],
      "第([一二三])章",
      "Chapter $1",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.candidates.map((c) => c.afterText)).toEqual([
      "Chapter 一",
      "Chapter 二"
    ]);
    expect(result.candidates.map((c) => c.beforeText)).toEqual([
      "第一章",
      "第二章"
    ]);
  });

  it("expands ${2}00 safely (group 2 then the literal 00)", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "ab" })],
      "(a)(b)",
      "${2}00",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.candidates[0].afterText).toBe("b00");
  });

  it("$$10 expands to the literal $10", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "ab" })],
      "(a)(b)",
      "$$10",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.candidates[0].afterText).toBe("$10");
  });

  it("fails preflight on the ambiguous $200", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "ab" })],
      "(a)(b)",
      "$200",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    expect(result.status).toBe("invalidTemplate");
    if (result.status === "invalidTemplate") {
      expect(result.error).toBe("ambiguousReference");
    }
  });

  it("fails preflight on a reference to a group that does not exist", () => {
    const result = generateOpenDocumentsReplaceCandidates(
      [target({ text: "abc" })],
      "(a)b",
      "$2",
      { caseSensitive: false, wholeWord: false, useRegex: true }
    );
    expect(result.status).toBe("invalidTemplate");
    if (result.status === "invalidTemplate") {
      expect(result.error).toBe("missingGroup");
    }
  });
});

describe("applyReplacementEditsToText (#386)", () => {
  it("applies multiple replacements in one document without offset corruption", () => {
    // "aXbXcXd" -> replace each X with "YYYY"
    const text = "aXbXcXd";
    const edits = [
      { startOffset: 1, endOffset: 2, afterText: "YYYY" },
      { startOffset: 3, endOffset: 4, afterText: "YYYY" },
      { startOffset: 5, endOffset: 6, afterText: "YYYY" }
    ];
    expect(applyReplacementEditsToText(text, edits)).toEqual({
      text: "aYYYYbYYYYcYYYYd",
      appliedCount: 3
    });
  });

  it("is order-independent (edits may arrive in any order)", () => {
    const text = "1 2 3";
    const shuffled = [
      { startOffset: 2, endOffset: 3, afterText: "two" },
      { startOffset: 0, endOffset: 1, afterText: "one" },
      { startOffset: 4, endOffset: 5, afterText: "three" }
    ];
    expect(applyReplacementEditsToText(text, shuffled).text).toBe(
      "one two three"
    );
  });

  it("skips an out-of-bounds or overlapping edit instead of corrupting the text", () => {
    const text = "abcdef";
    const result = applyReplacementEditsToText(text, [
      { startOffset: 0, endOffset: 3, afterText: "X" }, // covers "abc"
      { startOffset: 2, endOffset: 5, afterText: "Y" }, // overlaps the first
      { startOffset: 10, endOffset: 12, afterText: "Z" } // out of bounds
    ]);
    // Applied back-to-front: "Y" (rightmost valid) lands; "X" overlaps it and
    // is dropped; "Z" is out of bounds.
    expect(result).toEqual({ text: "abYf", appliedCount: 1 });
  });
});
