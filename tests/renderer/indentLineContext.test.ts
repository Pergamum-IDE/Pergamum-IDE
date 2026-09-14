import { describe, expect, it } from "vitest";
import { classifyLine } from "../../src/renderer/indentLineContext";

describe("classifyLine (#463)", () => {
  it("classifies an empty or whitespace-only line as blank", () => {
    expect(classifyLine("")).toBe("blank");
    expect(classifyLine("   ")).toBe("blank");
    expect(classifyLine("\t")).toBe("blank");
  });

  it("classifies an ordinary line as a top-level paragraph", () => {
    expect(classifyLine("Hello world")).toBe("topLevelParagraph");
    expect(classifyLine("日本語の本文行")).toBe("topLevelParagraph");
  });

  it("does NOT treat U+3000 (Japanese paragraph-indent full-width space) as blank or as indentation - it is an ordinary body character (ADR-0014 決定7), and this classifier never normalizes/trims Unicode whitespace", () => {
    // A line of nothing but U+3000 is NOT a CommonMark blank line (which is
    // ASCII space/tab only) - it is content, so it is a top-level paragraph.
    expect(classifyLine("　")).toBe("topLevelParagraph");
    expect(classifyLine("　　")).toBe("topLevelParagraph");
    // Leading U+3000 does not count as indentation columns either - it
    // must not push an otherwise top-level line into indentedCode.
    expect(classifyLine("　　　　text")).toBe(
      "topLevelParagraph"
    );
  });

  it.each(["-", "*", "+"])(
    "classifies an outermost bullet list item ('%s') as listItem",
    (marker) => {
      expect(classifyLine(`${marker} item`)).toBe("listItem");
    }
  );

  it.each(["1.", "1)", "10.", "10)"])(
    "classifies an outermost ordered list item ('%s') as listItem",
    (marker) => {
      expect(classifyLine(`${marker} item`)).toBe("listItem");
    }
  );

  it("classifies a bare list marker with nothing after it as listItem", () => {
    expect(classifyLine("-")).toBe("listItem");
    expect(classifyLine("1.")).toBe("listItem");
  });

  it("classifies a list marker indented 1-3 columns as still outermost", () => {
    expect(classifyLine("  - item")).toBe("listItem");
    expect(classifyLine("   1. item")).toBe("listItem");
  });

  it("classifies a list marker indented 4+ columns as nestedListItem", () => {
    expect(classifyLine("    - item")).toBe("nestedListItem");
    expect(classifyLine("        - item")).toBe("nestedListItem");
    expect(classifyLine("\t- item")).toBe("nestedListItem");
  });

  it("does not misclassify a mid-word hyphen, a negative number, or a hyphen-led option flag as a list item", () => {
    // No space (or end-of-line) after the marker character - CommonMark
    // requires one, so these all stay ordinary paragraph lines. Reviewed
    // and reconfirmed correct for Issue #463's local-reviewer pass.
    expect(classifyLine("well-known term")).toBe("topLevelParagraph");
    expect(classifyLine("-5 degrees")).toBe("topLevelParagraph");
    expect(classifyLine("--option")).toBe("topLevelParagraph");
    expect(classifyLine("foo - bar")).toBe("topLevelParagraph");
  });

  it("classifies a blockquote line", () => {
    expect(classifyLine("> quoted")).toBe("blockquote");
    expect(classifyLine("  > quoted")).toBe("blockquote");
    expect(classifyLine(">")).toBe("blockquote");
  });

  it("classifies an indented (4+ column) non-list, non-blockquote line as indentedCode", () => {
    expect(classifyLine("    const x = 1;")).toBe("indentedCode");
    expect(classifyLine("\tconst x = 1;")).toBe("indentedCode");
  });

  it.each(["# Heading", "###### Heading", "  ## Heading"])(
    "classifies a heading line ('%s') as unsupportedContext, not topLevelParagraph",
    (line) => {
      expect(classifyLine(line)).toBe("unsupportedContext");
    }
  );

  it("does not misclassify a plain '#' word as a heading", () => {
    expect(classifyLine("#hashtag no space")).toBe("topLevelParagraph");
  });

  it.each(["---", "***", "___", "- - -", "* * *", "_ _ _"])(
    "classifies a thematic break ('%s') as unsupportedContext, not listItem - CommonMark resolves this ambiguity in favor of the thematic break",
    (line) => {
      expect(classifyLine(line)).toBe("unsupportedContext");
    }
  );

  it("a run that is one character short of a thematic break is still a list item", () => {
    // Only 2 repetitions - THEMATIC_BREAK_PATTERN requires 3+, so this
    // correctly falls through to the list-marker check instead.
    expect(classifyLine("- -")).toBe("listItem");
  });

  it("classifies an obvious HTML block start as unsupportedContext", () => {
    expect(classifyLine("<div>")).toBe("unsupportedContext");
    expect(classifyLine("<!-- comment -->")).toBe("unsupportedContext");
  });
});
