import { describe, expect, it } from "vitest";
import {
  extractMarkdownOutline,
  type MarkdownOutlineItem
} from "../../src/shared/markdownOutline";

function levels(items: readonly { level: number }[]): number[] {
  return items.map((item) => item.level);
}

function treeShape(
  items: readonly MarkdownOutlineItem[]
): Array<[string, unknown]> {
  return items.map((item) => [item.text, treeShape(item.children)]);
}

describe("extractMarkdownOutline (#352)", () => {
  it("extracts ATX headings h1..h6 with level and trimmed text", () => {
    const text = [
      "# One",
      "## Two  ",
      "###   Three",
      "####\tFour",
      "##### Five",
      "###### Six"
    ].join("\n");

    const { flat } = extractMarkdownOutline(text);
    expect(levels(flat)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(flat.map((item) => item.text)).toEqual([
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six"
    ]);
  });

  it("strips a trailing closing `#` sequence and allows an empty heading", () => {
    const { flat } = extractMarkdownOutline(
      ["## Heading ##", "### Closed ###   ", "#", "##   "].join("\n")
    );
    expect(flat.map((item) => item.text)).toEqual([
      "Heading",
      "Closed",
      "",
      ""
    ]);
    expect(flat.map((item) => item.level)).toEqual([2, 3, 1, 2]);
  });

  it("is not a heading without a space after the hashes, or with 7+ hashes", () => {
    const { flat } = extractMarkdownOutline(
      ["#nospace", "####### seven", "text # not a heading"].join("\n")
    );
    expect(flat).toHaveLength(0);
  });

  it("records 0-based lineNumber and from/to offsets of the heading line", () => {
    const text = "intro\n\n## Chapter\nbody\n### Scene";
    const { flat } = extractMarkdownOutline(text);

    expect(flat[0]).toMatchObject({ text: "Chapter", lineNumber: 2 });
    expect(text.slice(flat[0].from, flat[0].to)).toBe("## Chapter");

    expect(flat[1]).toMatchObject({ text: "Scene", lineNumber: 4 });
    expect(text.slice(flat[1].from, flat[1].to)).toBe("### Scene");
  });

  it("handles multibyte text in offsets", () => {
    const text = "序文\n\n## 第一章\n本文";
    const { flat } = extractMarkdownOutline(text);
    expect(flat).toHaveLength(1);
    expect(text.slice(flat[0].from, flat[0].to)).toBe("## 第一章");
    expect(flat[0].text).toBe("第一章");
  });

  it("ignores `#` lines inside a backtick fenced code block", () => {
    const text = [
      "# Real",
      "```",
      "# not a heading",
      "## also not",
      "```",
      "## After"
    ].join("\n");
    const { flat } = extractMarkdownOutline(text);
    expect(flat.map((item) => item.text)).toEqual(["Real", "After"]);
  });

  it("ignores `#` lines inside a tilde fenced code block, and requires a same-or-longer closing fence", () => {
    const text = [
      "~~~~",
      "# inside tilde fence",
      "~~~",
      "# still inside (closing fence too short)",
      "~~~~",
      "## Out"
    ].join("\n");
    const { flat } = extractMarkdownOutline(text);
    expect(flat.map((item) => item.text)).toEqual(["Out"]);
  });

  it("does not let a backtick fence close a tilde fence (or vice versa)", () => {
    const text = ["~~~", "# inside", "```", "# still inside", "~~~", "# Out"].join(
      "\n"
    );
    const { flat } = extractMarkdownOutline(text);
    expect(flat.map((item) => item.text)).toEqual(["Out"]);
  });

  it("ignores a heading indented by 4+ spaces (indented code block)", () => {
    const { flat } = extractMarkdownOutline(
      ["   ### three spaces ok", "    # four spaces is code"].join("\n")
    );
    expect(flat.map((item) => item.text)).toEqual(["three spaces ok"]);
  });

  it("builds a tree that tolerates skipped heading levels", () => {
    const { tree } = extractMarkdownOutline(
      ["# A", "### A.1", "### A.2", "## B"].join("\n")
    );
    expect(treeShape(tree)).toEqual([
      [
        "A",
        [
          ["A.1", []],
          ["A.2", []],
          ["B", []]
        ]
      ]
    ]);
  });

  it("rolls the level stack back when a shallower heading follows a deeper one", () => {
    const { tree } = extractMarkdownOutline(
      ["# A", "## A.1", "### A.1.a", "# C"].join("\n")
    );
    expect(treeShape(tree)).toEqual([
      ["A", [["A.1", [["A.1.a", []]]]]],
      ["C", []]
    ]);
  });

  it("returns empty tree and flat for text with no headings", () => {
    const { tree, flat } = extractMarkdownOutline("no headings here\n\njust text");
    expect(tree).toEqual([]);
    expect(flat).toEqual([]);
  });

  it("keeps flat in document order and matches the tree's total item count", () => {
    const { tree, flat } = extractMarkdownOutline(
      ["# A", "## B", "### C", "## D", "# E"].join("\n")
    );
    expect(flat.map((item) => item.text)).toEqual(["A", "B", "C", "D", "E"]);

    const countTree = (items: readonly MarkdownOutlineItem[]): number =>
      items.reduce((total, item) => total + 1 + countTree(item.children), 0);
    expect(countTree(tree)).toBe(flat.length);
  });

  it("does not treat a Setext heading as a heading", () => {
    const { flat } = extractMarkdownOutline("Title\n=====\n\nSubtitle\n-----");
    expect(flat).toHaveLength(0);
  });

  it("gives every item a unique id prefixed by its line number", () => {
    const { flat } = extractMarkdownOutline(
      ["# Same", "# Same", "## Same"].join("\n")
    );
    const ids = flat.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0].startsWith("0:")).toBe(true);
    expect(ids[1].startsWith("1:")).toBe(true);
  });
});
