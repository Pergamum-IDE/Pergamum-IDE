import { describe, expect, it, vi } from "vitest";
import {
  PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE,
  PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES,
  emptyProjectTextSearchResult,
  runProjectGlossaryAtomSearch,
  runProjectTextSearch
} from "../../src/renderer/projectTextSearch";
import { isGlossarySearchMatch } from "../../src/renderer/glossaryAtomSearch";
import type { ProjectDocument } from "../../src/shared/api";

const PLAIN = { caseSensitive: false, wholeWord: false } as const;

function doc(relativePath: string, name = relativePath): ProjectDocument {
  return { relativePath, name };
}

describe("runProjectTextSearch (#384 Phase 2)", () => {
  it("returns an empty result for a blank query without reading anything", async () => {
    const readText = vi.fn(async () => "content");

    const result = await runProjectTextSearch({
      documents: [doc("a.md")],
      readText,
      query: "   ",
      options: PLAIN
    });

    expect(result).toEqual(emptyProjectTextSearchResult("   "));
    expect(readText).not.toHaveBeenCalled();
  });

  it("groups matches by file and orders files by relative path", async () => {
    const texts: Record<string, string> = {
      "b.md": "maid here",
      "a.md": "a maid and another maid"
    };

    const result = await runProjectTextSearch({
      documents: [doc("b.md"), doc("a.md")],
      readText: async (relativePath) => texts[relativePath] ?? null,
      query: "maid",
      options: PLAIN
    });

    expect(result.files.map((file) => file.relativePath)).toEqual([
      "a.md",
      "b.md"
    ]);
    expect(result.totalMatches).toBe(3);
    expect(result.fileCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.skippedFileCount).toBe(0);
  });

  it("counts unreadable files as skipped instead of failing", async () => {
    const result = await runProjectTextSearch({
      documents: [doc("ok.md"), doc("broken.md"), doc("missing.md")],
      readText: async (relativePath) => {
        if (relativePath === "ok.md") {
          return "a maid";
        }
        if (relativePath === "broken.md") {
          throw new Error("EACCES");
        }
        return null;
      },
      query: "maid",
      options: PLAIN
    });

    expect(result.totalMatches).toBe(1);
    expect(result.fileCount).toBe(1);
    expect(result.skippedFileCount).toBe(2);
  });

  it("stops early once isCancelled turns true", async () => {
    const readText = vi.fn(async () => "maid");
    let calls = 0;

    const result = await runProjectTextSearch({
      documents: [doc("a.md"), doc("b.md"), doc("c.md")],
      readText,
      query: "maid",
      options: PLAIN,
      isCancelled: () => {
        calls += 1;
        return calls > 1;
      }
    });

    expect(readText).toHaveBeenCalledTimes(1);
    expect(result.fileCount).toBe(1);
  });

  it("caps matches per file and flags the file as truncated", async () => {
    const overflow = PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE + 25;

    const result = await runProjectTextSearch({
      documents: [doc("a.md")],
      readText: async () => "x".repeat(overflow),
      query: "x",
      options: PLAIN
    });

    expect(result.files[0].matches).toHaveLength(
      PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE
    );
    expect(result.files[0].truncated).toBe(true);
    expect(result.truncated).toBe(true);
  });

  it("caps the total match count across files", async () => {
    const documents = Array.from({ length: 20 }, (_, index) =>
      doc(`file-${String(index).padStart(2, "0")}.md`)
    );

    const result = await runProjectTextSearch({
      documents,
      readText: async () => "x".repeat(200),
      query: "x",
      options: PLAIN
    });

    expect(result.totalMatches).toBe(PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES);
    expect(result.truncated).toBe(true);
  });

  it("threads the regex option through to every file (#384)", async () => {
    const texts: Record<string, string> = {
      "a.md": "メイドさん",
      "b.md": "ジャンヌ・ヴァルジャン",
      "c.md": "handmade goods"
    };

    const result = await runProjectTextSearch({
      documents: [doc("a.md"), doc("b.md"), doc("c.md")],
      readText: async (relativePath) => texts[relativePath] ?? null,
      query: "メイド|ジャンヌ",
      options: { caseSensitive: false, wholeWord: false, useRegex: true }
    });

    expect(
      result.files.flatMap((file) =>
        file.matches.map((match) => match.matchedText)
      )
    ).toEqual(["メイド", "ジャンヌ"]);
    expect(result.fileCount).toBe(2);
  });
});

describe("runProjectGlossaryAtomSearch (#384)", () => {
  const term = (value: string) => ({
    value,
    matchFlags: 0,
    atomId: `atom-${value}`,
    entryId: `entry-${value}`,
    entryLabel: value
  });

  it("returns an empty result when no atoms are selected", async () => {
    const readText = vi.fn(async () => "ジャンヌ");

    const result = await runProjectGlossaryAtomSearch({
      documents: [doc("a.md")],
      readText,
      terms: []
    });

    expect(result.totalMatches).toBe(0);
    expect(readText).not.toHaveBeenCalled();
  });

  it("OR-searches the atoms across files and tags each match", async () => {
    const texts: Record<string, string> = {
      "a.md": "ジャンヌは歩いた。",
      "b.md": "メイドは沈黙した。",
      "c.md": "関係のない文。"
    };

    const result = await runProjectGlossaryAtomSearch({
      documents: [doc("a.md"), doc("b.md"), doc("c.md")],
      readText: async (relativePath) => texts[relativePath] ?? null,
      terms: [term("ジャンヌ"), term("メイド")]
    });

    expect(result.fileCount).toBe(2);
    expect(result.totalMatches).toBe(2);
    const matches = result.files.flatMap((file) => file.matches);
    expect(matches.every(isGlossarySearchMatch)).toBe(true);
    expect(matches.map((match) => match.matchedText)).toEqual([
      "ジャンヌ",
      "メイド"
    ]);
  });

  it("skips unreadable files and counts them", async () => {
    const result = await runProjectGlossaryAtomSearch({
      documents: [doc("ok.md"), doc("bad.md")],
      readText: async (relativePath) =>
        relativePath === "ok.md" ? "メイド喫茶" : null,
      terms: [term("メイド")]
    });

    expect(result.totalMatches).toBe(1);
    expect(result.skippedFileCount).toBe(1);
  });
});
