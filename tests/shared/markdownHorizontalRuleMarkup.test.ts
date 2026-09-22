import { describe, expect, it } from "vitest";
import { buildHorizontalRuleInsertion } from "../../src/shared/markdownHorizontalRuleMarkup";

describe("buildHorizontalRuleInsertion", () => {
  it("inserts a Markdown horizontal rule followed by a blank line", () => {
    const result = buildHorizontalRuleInsertion();
    expect(result.text).toBe("---\n\n");
  });

  it("places the cursor on the blank line after the rule", () => {
    const result = buildHorizontalRuleInsertion();
    expect(result.text.slice(0, result.selectionOffsetFromInsertStart)).toBe(
      "---\n"
    );
    expect(result.text.slice(result.selectionOffsetFromInsertStart)).toBe(
      "\n"
    );
  });
});
