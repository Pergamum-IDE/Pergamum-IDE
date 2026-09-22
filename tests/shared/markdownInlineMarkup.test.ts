import { describe, expect, it } from "vitest";
import { wrapOrInsertInlineMarker } from "../../src/shared/markdownInlineMarkup";

describe("wrapOrInsertInlineMarker", () => {
  it("wraps a selection with bold markers", () => {
    const result = wrapOrInsertInlineMarker("選択", "**");
    expect(result.text).toBe("**選択**");
    expect(result.selectionOffsetFromInsertStart).toBe(result.text.length);
  });

  it("inserts empty bold markers with cursor between them when no selection", () => {
    const result = wrapOrInsertInlineMarker("", "**");
    expect(result.text).toBe("****");
    expect(result.selectionOffsetFromInsertStart).toBe(2);
  });

  it("wraps a selection with italic markers", () => {
    const result = wrapOrInsertInlineMarker("選択", "*");
    expect(result.text).toBe("*選択*");
    expect(result.selectionOffsetFromInsertStart).toBe(result.text.length);
  });

  it("inserts empty italic markers with cursor between them when no selection", () => {
    const result = wrapOrInsertInlineMarker("", "*");
    expect(result.text).toBe("**");
    expect(result.selectionOffsetFromInsertStart).toBe(1);
  });

  it("wraps a selection with strikethrough markers", () => {
    const result = wrapOrInsertInlineMarker("選択", "~~");
    expect(result.text).toBe("~~選択~~");
    expect(result.selectionOffsetFromInsertStart).toBe(result.text.length);
  });

  it("inserts empty strikethrough markers with cursor between them when no selection", () => {
    const result = wrapOrInsertInlineMarker("", "~~");
    expect(result.text).toBe("~~~~");
    expect(result.selectionOffsetFromInsertStart).toBe(2);
  });
});
