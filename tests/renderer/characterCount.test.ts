import { describe, expect, it } from "vitest";
import {
  codePointCharacterCount,
  countMarkdownDocumentCharacters
} from "../../src/renderer/characterCount";
import type { ApplicationEditorCharacterCountExcludeSettings } from "../../src/shared/settings";

const includeEverything: ApplicationEditorCharacterCountExcludeSettings = {
  whitespace: false,
  lineBreaks: false,
  headings: false,
  markdownSyntax: false,
  markdownComments: false
};

const defaultStatusBarExclusions: ApplicationEditorCharacterCountExcludeSettings =
  {
    whitespace: true,
    lineBreaks: true,
    headings: false,
    markdownSyntax: true,
    markdownComments: true
  };

describe("status bar character count helper (#259)", () => {
  it("returns 0 for an empty document", () => {
    expect(
      countMarkdownDocumentCharacters("", {
        exclude: defaultStatusBarExclusions
      })
    ).toBe(0);
  });

  it.each([
    ["ABC", 3],
    ["吾輩", 2],
    ["𠮷野家", 3],
    ["😀", 1]
  ])("counts %s by Unicode code point", (text, expected) => {
    expect(codePointCharacterCount(text)).toBe(expected);
    expect(
      countMarkdownDocumentCharacters(text, { exclude: includeEverything })
    ).toBe(expected);
  });

  it("applies whitespace and line-break exclusions independently", () => {
    const content = "A B　C\tD\nE";

    expect(
      countMarkdownDocumentCharacters(content, {
        exclude: includeEverything
      })
    ).toBe(9);
    expect(
      countMarkdownDocumentCharacters(content, {
        exclude: {
          ...includeEverything,
          whitespace: true
        }
      })
    ).toBe(6);
    expect(
      countMarkdownDocumentCharacters(content, {
        exclude: {
          ...includeEverything,
          lineBreaks: true
        }
      })
    ).toBe(8);
    expect(
      countMarkdownDocumentCharacters(content, {
        exclude: {
          ...includeEverything,
          whitespace: true,
          lineBreaks: true
        }
      })
    ).toBe(5);
  });

  it("counts by Unicode code point after whitespace, syntax, and HTML comment exclusions", () => {
    expect(
      countMarkdownDocumentCharacters("𠮷 **野** <!-- hidden --> 😀", {
        exclude: defaultStatusBarExclusions
      })
    ).toBe(3);
  });

  it("excludes Markdown syntax through markdown-it tokens without excluding heading text by default", () => {
    expect(
      countMarkdownDocumentCharacters("# 𠮷 **野** 😀\n<!-- hidden -->", {
        exclude: defaultStatusBarExclusions
      })
    ).toBe(3);
  });

  it("excludes headings only when the heading exclusion is enabled", () => {
    expect(
      countMarkdownDocumentCharacters("# 𠮷野家\n吾輩", {
        exclude: {
          ...defaultStatusBarExclusions,
          headings: true
        }
      })
    ).toBe(2);
  });

  it("treats markdownComments as HTML-comment-only, not as generic HTML exclusion", () => {
    const content = "<div>𠮷<!-- hidden --></div>野";

    expect(
      countMarkdownDocumentCharacters(content, {
        exclude: {
          ...includeEverything,
          markdownComments: true
        }
      })
    ).toBe(codePointCharacterCount("<div>𠮷</div>野"));
  });
});

function withExclude(
  partial: Partial<ApplicationEditorCharacterCountExcludeSettings>
): ApplicationEditorCharacterCountExcludeSettings {
  return { ...includeEverything, ...partial };
}

function count(
  content: string,
  partial: Partial<ApplicationEditorCharacterCountExcludeSettings>
): number {
  return countMarkdownDocumentCharacters(content, {
    exclude: withExclude(partial)
  });
}

describe("status bar character count Markdown regression cases (#259)", () => {
  it("keeps link markup verbatim until markdownSyntax reduces it to the link text", () => {
    const link = "[表示テキスト](https://example.com)";

    expect(codePointCharacterCount(link)).toBe(29);
    expect(count(link, {})).toBe(29);
    expect(count(link, { markdownSyntax: false, markdownComments: true })).toBe(
      29
    );
    // markdownSyntax=true keeps only the visible link text "表示テキスト".
    expect(count(link, { markdownSyntax: true })).toBe(6);
  });

  it("keeps inline code backticks until markdownSyntax strips them", () => {
    const inlineCode = "`inline code`";

    expect(codePointCharacterCount(inlineCode)).toBe(13);
    expect(count(inlineCode, {})).toBe(13);
    // Only the "inline code" payload survives once the delimiters are syntax.
    expect(count(inlineCode, { markdownSyntax: true })).toBe(11);
  });

  it("counts fenced code payload without the fence markers when markdownSyntax is enabled", () => {
    const fence = "```text\nfenced code\n```";

    expect(codePointCharacterCount(fence)).toBe(23);
    expect(count(fence, {})).toBe(23);
    // "fenced code" (11) plus the two interior newlines, which are still
    // governed only by the lineBreaks setting.
    expect(count(fence, { markdownSyntax: true })).toBe(13);
    expect(count(fence, { markdownSyntax: true, lineBreaks: true })).toBe(11);
  });

  it("removes a setext heading, underline included, only when headings is enabled", () => {
    const setext = "見出し\n------";

    expect(codePointCharacterCount(setext)).toBe(10);
    expect(count(setext, {})).toBe(10);
    // markdownSyntax alone drops the "------" underline but keeps the newline.
    expect(count(setext, { markdownSyntax: true })).toBe(4);
    // headings removes the whole construct regardless of markdownSyntax.
    expect(count(setext, { headings: true, markdownSyntax: false })).toBe(0);
    expect(count(setext, { headings: true, markdownSyntax: true })).toBe(0);
  });

  it("removes a multiline HTML comment block only when markdownComments is enabled", () => {
    const comment = "<!--\nmultiline comment\n-->";

    expect(codePointCharacterCount(comment)).toBe(26);
    expect(count(comment, {})).toBe(26);
    expect(count(comment, { markdownSyntax: true, markdownComments: false })).toBe(
      26
    );
    expect(count(comment, { markdownComments: true })).toBe(0);
    expect(
      count(comment, { markdownSyntax: false, markdownComments: true })
    ).toBe(0);
  });
});

describe("status bar character count setting combinations (#259)", () => {
  const combinedDocument = [
    "[表示テキスト](https://example.com)",
    "`inline code`",
    "```text\nfenced code\n```",
    "見出し\n------",
    "<!--\nmultiline comment\n-->"
  ].join("\n\n");

  it("has the expected raw code point length", () => {
    expect(codePointCharacterCount(combinedDocument)).toBe(109);
  });

  it.each<
    [string, Partial<ApplicationEditorCharacterCountExcludeSettings>, number]
  >([
    [
      "markdownSyntax=false + markdownComments=true",
      { markdownSyntax: false, markdownComments: true },
      83
    ],
    [
      "markdownSyntax=true + markdownComments=false",
      { markdownSyntax: true, markdownComments: false },
      68
    ],
    [
      "headings=true + markdownSyntax=false",
      { headings: true, markdownSyntax: false },
      99
    ],
    [
      "headings=true + markdownSyntax=true",
      { headings: true, markdownSyntax: true },
      64
    ],
    [
      "lineBreaks=false + markdownSyntax=true",
      { lineBreaks: false, markdownSyntax: true },
      68
    ]
  ])("counts the combined document with %s", (_label, partial, expected) => {
    expect(count(combinedDocument, partial)).toBe(expected);
  });
});
