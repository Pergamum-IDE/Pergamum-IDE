import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  classifyLine,
  computeOrderedListLocalRenumbering,
  parseOrderedListMarker,
  renumberOrderedListLine
} from "../../src/renderer/indentLineContext";

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

  it.each(["- [ ]", "- [x]", "- [X]", "* [ ]", "+ [x]"])(
    "classifies an outermost task list item ('%s') as listItem",
    (marker) => {
      expect(classifyLine(`${marker} task`)).toBe("listItem");
    }
  );

  it.each(["1.", "1)", "10.", "10)"])(
    "classifies an ordered list item ('%s') as orderedListItem",
    (marker) => {
      expect(classifyLine(`${marker} item`)).toBe("orderedListItem");
    }
  );

  it.each(["1.", "1)", "10.", "10)"])(
    "classifies an indented ordered list item ('%s') as nestedOrderedListItem",
    (marker) => {
      expect(classifyLine(`  ${marker} item`)).toBe("nestedOrderedListItem");
      expect(classifyLine(`\t${marker} item`)).toBe("nestedOrderedListItem");
    }
  );

  it("does not misclassify 1.item or a date like 2026.09.14 as an ordered list item", () => {
    expect(classifyLine("1.item")).toBe("topLevelParagraph");
    expect(classifyLine("2026.09.14")).toBe("topLevelParagraph");
  });

  it("classifies a bare list marker with nothing after it as listItem", () => {
    expect(classifyLine("-")).toBe("listItem");
  });

  it("classifies an indented unordered list marker (1+ columns) as nestedListItem", () => {
    expect(classifyLine("  - item")).toBe("nestedListItem");
    expect(classifyLine("   * item")).toBe("nestedListItem");
    expect(classifyLine("    - item")).toBe("nestedListItem");
    expect(classifyLine("\t- item")).toBe("nestedListItem");
    expect(classifyLine("  - [ ] task")).toBe("nestedListItem");
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

describe("ordered list renumbering helpers (#470)", () => {
  it("parses ordered list markers preserving whitespace, digits, and delimiters", () => {
    const parsedDot = parseOrderedListMarker("   2.  child");
    expect(parsedDot).toEqual({
      indentStr: "   ",
      numberStr: "2",
      delimiter: ".",
      rest: "  child"
    });

    const parsedParen = parseOrderedListMarker("1) parent");
    expect(parsedParen).toEqual({
      indentStr: "",
      numberStr: "1",
      delimiter: ")",
      rest: " parent"
    });

    expect(parseOrderedListMarker("1.item")).toBeNull();
  });

  it("renumbers ordered list line preserving delimiter and rest text", () => {
    expect(renumberOrderedListLine("   2) child", 1)).toBe("   1) child");
    expect(renumberOrderedListLine("10. text", 5)).toBe("5. text");
  });

  it("computes local renumbering for ordered list sibling runs", () => {
    const doc = Text.of(["1. parent", "   2. child", "   3. child2"]);
    const modifiedLines = new Map<number, string>([
      [2, "   2. child"],
      [3, "   3. child2"]
    ]);

    const result = computeOrderedListLocalRenumbering(doc, modifiedLines);
    expect(result.get(2)).toBe("   1. child");
    expect(result.get(3)).toBe("   2. child2");
  });
});

