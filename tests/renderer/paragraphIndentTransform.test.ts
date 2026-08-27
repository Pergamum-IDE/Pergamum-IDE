import { describe, expect, it } from "vitest";
import {
  computeParagraphIndentInsertTransform,
  computeParagraphIndentRemoveTransform,
  paragraphIndentCharacter,
  type ParagraphIndentChange
} from "../../src/renderer/paragraphIndentTransform";

function applyChanges(
  content: string,
  changes: readonly ParagraphIndentChange[]
): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce((current, change) => {
      const to = change.to ?? change.from;

      return (
        current.slice(0, change.from) +
        change.insert +
        current.slice(to)
      );
    }, content);
}

describe("paragraph indent transform (#257)", () => {
  it("inserts one full-width space into ordinary non-empty lines", () => {
    const content = "吾輩は猫である。\n名前はまだ無い。";
    const result = computeParagraphIndentInsertTransform(content, "");

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}吾輩は猫である。\n${paragraphIndentCharacter}名前はまだ無い。`
    );
    expect(result.counts).toEqual({
      changedLineCount: 2,
      skippedLineCount: 0,
      emptyLineCount: 0
    });
  });

  it("keeps empty lines out of both changed and skipped counts", () => {
    const content = "吾輩は猫である。\n\n名前はまだ無い。\n";
    const result = computeParagraphIndentInsertTransform(content, "");

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}吾輩は猫である。\n\n${paragraphIndentCharacter}名前はまだ無い。\n`
    );
    expect(result.counts).toEqual({
      changedLineCount: 2,
      skippedLineCount: 0,
      emptyLineCount: 2
    });
  });

  it("skips lines that already start with a full-width space", () => {
    const content = `${paragraphIndentCharacter}字下げ済み\n未字下げ`;
    const result = computeParagraphIndentInsertTransform(content, "");

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}字下げ済み\n${paragraphIndentCharacter}未字下げ`
    );
    expect(result.counts).toEqual({
      changedLineCount: 1,
      skippedLineCount: 1,
      emptyLineCount: 0
    });
  });

  it("skips lines that start with configured excluded leading characters", () => {
    const content = "地の文\n「会話」\n『引用』\n（注記）";
    const result = computeParagraphIndentInsertTransform(content, "「『（");

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}地の文\n「会話」\n『引用』\n（注記）`
    );
    expect(result.counts).toEqual({
      changedLineCount: 1,
      skippedLineCount: 3,
      emptyLineCount: 0
    });
  });

  it("treats an empty excluded-character setting as no exclusions", () => {
    const content = "「会話」\n# 見出し";
    const result = computeParagraphIndentInsertTransform(content, "");

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}「会話」\n${paragraphIndentCharacter}# 見出し`
    );
    expect(result.counts).toEqual({
      changedLineCount: 2,
      skippedLineCount: 0,
      emptyLineCount: 0
    });
  });

  it("deduplicates excluded characters by set semantics", () => {
    const content = "「会話」\n地の文";
    const result = computeParagraphIndentInsertTransform(content, "「「「");

    expect(applyChanges(content, result.changes)).toBe(
      `「会話」\n${paragraphIndentCharacter}地の文`
    );
    expect(result.counts).toEqual({
      changedLineCount: 1,
      skippedLineCount: 1,
      emptyLineCount: 0
    });
  });

  it("removes one leading full-width space from each indented non-empty line", () => {
    const content = `${paragraphIndentCharacter}吾輩は猫である。\n${paragraphIndentCharacter}名前はまだ無い。`;
    const result = computeParagraphIndentRemoveTransform(content);

    expect(applyChanges(content, result.changes)).toBe(
      "吾輩は猫である。\n名前はまだ無い。"
    );
    expect(result.counts).toEqual({
      changedLineCount: 2,
      skippedLineCount: 0,
      emptyLineCount: 0
    });
  });

  it("removes only one full-width space when a line starts with multiple", () => {
    const content = `${paragraphIndentCharacter}${paragraphIndentCharacter}二重字下げ`;
    const result = computeParagraphIndentRemoveTransform(content);

    expect(applyChanges(content, result.changes)).toBe(
      `${paragraphIndentCharacter}二重字下げ`
    );
    expect(result.counts).toEqual({
      changedLineCount: 1,
      skippedLineCount: 0,
      emptyLineCount: 0
    });
  });

  it("does not consult excluded leading characters during removal", () => {
    const content = `「会話」\n${paragraphIndentCharacter}「字下げ済み会話」\n本文`;
    const result = computeParagraphIndentRemoveTransform(content);

    expect(applyChanges(content, result.changes)).toBe("「会話」\n「字下げ済み会話」\n本文");
    expect(result.counts).toEqual({
      changedLineCount: 1,
      skippedLineCount: 2,
      emptyLineCount: 0
    });
  });
});
