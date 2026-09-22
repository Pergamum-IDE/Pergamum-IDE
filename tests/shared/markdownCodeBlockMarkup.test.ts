import { describe, expect, it } from "vitest";
import { buildFencedCodeBlock } from "../../src/shared/markdownCodeBlockMarkup";

describe("buildFencedCodeBlock", () => {
  it("wraps selected text in a fenced code block", () => {
    const result = buildFencedCodeBlock("選択範囲");
    expect(result.text).toBe("```\n選択範囲\n```");
    expect(result.selectionOffsetFromInsertStart).toBe(result.text.length);
  });

  it("inserts an empty fenced code block with the cursor inside the fence", () => {
    const result = buildFencedCodeBlock("");
    expect(result.text).toBe("```\n\n```");
    expect(result.selectionOffsetFromInsertStart).toBe(4);
  });

  it("wraps a multi-line selection without altering its internal newlines", () => {
    const result = buildFencedCodeBlock("行1\n行2");
    expect(result.text).toBe("```\n行1\n行2\n```");
  });
});
