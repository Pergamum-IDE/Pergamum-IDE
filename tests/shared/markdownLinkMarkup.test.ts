import { describe, expect, it } from "vitest";
import {
  buildMarkdownLink,
  escapeMarkdownLinkLabel
} from "../../src/shared/markdownLinkMarkup";

describe("buildMarkdownLink", () => {
  it("builds a Markdown link from a label and URL", () => {
    const result = buildMarkdownLink("Pergamum", "https://example.com");
    expect(result.text).toBe("[Pergamum](https://example.com)");
    expect(result.selectionOffsetFromInsertStart).toBe(result.text.length);
  });

  it("places the cursor between the brackets when the label is empty", () => {
    const result = buildMarkdownLink("", "https://example.com");
    expect(result.text).toBe("[](https://example.com)");
    expect(result.selectionOffsetFromInsertStart).toBe(1);
  });

  it("escapes backslashes and brackets in the label", () => {
    const result = buildMarkdownLink("a[b]c\\d", "https://example.com");
    expect(result.text).toBe("[a\\[b\\]c\\\\d](https://example.com)");
  });

  it("trims the URL", () => {
    const result = buildMarkdownLink("Pergamum", "  https://example.com  ");
    expect(result.text).toBe("[Pergamum](https://example.com)");
  });
});

describe("escapeMarkdownLinkLabel", () => {
  it("escapes backslash, [, and ]", () => {
    expect(escapeMarkdownLinkLabel("a\\[b]c")).toBe("a\\\\\\[b\\]c");
  });
});
