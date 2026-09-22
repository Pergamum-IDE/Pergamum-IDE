import { describe, expect, it } from "vitest";
import { applyMarkdownListToLines } from "../../src/shared/markdownListMarkup";

describe("applyMarkdownListToLines", () => {
  it("converts plain lines to an unordered list", () => {
    expect(
      applyMarkdownListToLines(["りんご", "みかん", "ぶどう"], "unordered")
    ).toEqual(["- りんご", "- みかん", "- ぶどう"]);
  });

  it("converts plain lines to an ordered list", () => {
    expect(
      applyMarkdownListToLines(["りんご", "みかん", "ぶどう"], "ordered")
    ).toEqual(["1. りんご", "2. みかん", "3. ぶどう"]);
  });

  it("converts plain lines to a checklist", () => {
    expect(
      applyMarkdownListToLines(["りんご", "みかん", "ぶどう"], "checklist")
    ).toEqual(["- [ ] りんご", "- [ ] みかん", "- [ ] ぶどう"]);
  });

  it("converts an unordered list to an ordered list", () => {
    expect(
      applyMarkdownListToLines(["- りんご", "- みかん"], "ordered")
    ).toEqual(["1. りんご", "2. みかん"]);
  });

  it("converts an ordered list to an unordered list", () => {
    expect(
      applyMarkdownListToLines(["1. りんご", "2. みかん"], "unordered")
    ).toEqual(["- りんご", "- みかん"]);
  });

  it("converts an unordered list to a checklist", () => {
    expect(
      applyMarkdownListToLines(["- りんご", "- みかん"], "checklist")
    ).toEqual(["- [ ] りんご", "- [ ] みかん"]);
  });

  it("converts a checklist to an unordered list", () => {
    expect(applyMarkdownListToLines(["- [ ] りんご"], "unordered")).toEqual([
      "- りんご"
    ]);
  });

  it("converts a checked checklist to an unordered list", () => {
    expect(applyMarkdownListToLines(["- [x] りんご"], "unordered")).toEqual([
      "- りんご"
    ]);
  });

  it("converts a checked checklist to an ordered list", () => {
    expect(applyMarkdownListToLines(["- [x] りんご"], "ordered")).toEqual([
      "1. りんご"
    ]);
  });

  it("toggles a same-type unordered list line back to a normal paragraph", () => {
    expect(applyMarkdownListToLines(["- りんご"], "unordered")).toEqual([
      "りんご"
    ]);
  });

  it("toggles a same-type ordered list line back to a normal paragraph", () => {
    expect(applyMarkdownListToLines(["1. りんご"], "ordered")).toEqual([
      "りんご"
    ]);
  });

  it("toggles a same-type checklist line back to a normal paragraph", () => {
    expect(applyMarkdownListToLines(["- [ ] りんご"], "checklist")).toEqual([
      "りんご"
    ]);
  });

  it("toggles a checked checklist line back to a normal paragraph via the checklist command", () => {
    expect(applyMarkdownListToLines(["- [x] りんご"], "checklist")).toEqual([
      "りんご"
    ]);
  });

  it("toggles a multi-line unordered selection back to normal paragraphs only when all non-blank lines match", () => {
    expect(
      applyMarkdownListToLines(["- りんご", "- みかん"], "unordered")
    ).toEqual(["りんご", "みかん"]);
  });

  it("converts (not toggles) when the touched lines are a mix of kinds", () => {
    expect(
      applyMarkdownListToLines(["- りんご", "みかん"], "unordered")
    ).toEqual(["- りんご", "- みかん"]);
  });

  it("preserves line body text after marker conversion", () => {
    expect(
      applyMarkdownListToLines(["- Hello, world!"], "ordered")
    ).toEqual(["1. Hello, world!"]);
  });

  it("preserves leading indentation", () => {
    expect(applyMarkdownListToLines(["  - りんご"], "ordered")).toEqual([
      "  1. りんご"
    ]);
  });

  it("leaves blank lines unchanged in a multi-line selection", () => {
    expect(
      applyMarkdownListToLines(["りんご", "", "みかん"], "unordered")
    ).toEqual(["- りんご", "", "- みかん"]);
  });

  it("skips blank lines when numbering an ordered list", () => {
    expect(
      applyMarkdownListToLines(["りんご", "", "みかん"], "ordered")
    ).toEqual(["1. りんご", "", "2. みかん"]);
  });

  it("inserts a marker on an empty current line with no selection", () => {
    expect(applyMarkdownListToLines([""], "unordered")).toEqual(["- "]);
  });

  it("recognizes the 1) ordered marker variant", () => {
    expect(applyMarkdownListToLines(["1) りんご"], "unordered")).toEqual([
      "- りんご"
    ]);
  });

  it("recognizes + and * as unordered markers", () => {
    expect(applyMarkdownListToLines(["+ りんご"], "ordered")).toEqual([
      "1. りんご"
    ]);
    expect(applyMarkdownListToLines(["* りんご"], "ordered")).toEqual([
      "1. りんご"
    ]);
  });

  it("does not mistake a checklist marker for unordered body text", () => {
    expect(applyMarkdownListToLines(["- [ ] りんご"], "ordered")).toEqual([
      "1. りんご"
    ]);
  });
});
