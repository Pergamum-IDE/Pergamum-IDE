import { describe, expect, it } from "vitest";
import {
  applyBlockquoteToLine,
  isBlockquoteLine
} from "../../src/shared/markdownBlockquoteMarkup";

describe("markdownBlockquoteMarkup", () => {
  describe("isBlockquoteLine", () => {
    it("returns false for plain text lines", () => {
      expect(isBlockquoteLine("これは本文です。")).toBe(false);
      expect(isBlockquoteLine("hello world")).toBe(false);
    });

    it("returns false for empty line", () => {
      expect(isBlockquoteLine("")).toBe(false);
    });

    it("returns true for lines starting with >", () => {
      expect(isBlockquoteLine("> 引用")).toBe(true);
      expect(isBlockquoteLine(">引用")).toBe(true);
      expect(isBlockquoteLine("  > 引用")).toBe(true);
      expect(isBlockquoteLine("> [!NOTE] Callout")).toBe(true);
    });
  });

  describe("applyBlockquoteToLine", () => {
    it("prepends '> ' to unquoted lines", () => {
      expect(applyBlockquoteToLine("画面上の位置")).toBe("> 画面上の位置");
      expect(applyBlockquoteToLine("一行目")).toBe("> 一行目");
    });

    it("prepends '> ' to empty line", () => {
      expect(applyBlockquoteToLine("")).toBe("> ");
    });

    it("preserves already quoted lines without double quoting", () => {
      expect(applyBlockquoteToLine("> 既存の引用")).toBe("> 既存の引用");
      expect(applyBlockquoteToLine(">既存の引用")).toBe(">既存の引用");
      expect(applyBlockquoteToLine("  > 既存の引用")).toBe("  > 既存の引用");
      expect(applyBlockquoteToLine("> ")).toBe("> ");
    });
  });
});
