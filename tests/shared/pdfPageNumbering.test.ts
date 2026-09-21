import { describe, expect, it } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import {
  buildPdfHeaderFooterTemplates,
  formatOptionLabel,
  formatPdfPageNumberSummaryText,
  formatSampleText,
  normalizePdfPageNumberSettings,
  positionOptionLabel
} from "../../src/shared/pdfPageNumbering";

const mockTranslate: Translate = (key, params) => t("ja", key, params);

describe("pdfPageNumbering", () => {
  describe("normalizePdfPageNumberSettings", () => {
    it("normalizes position 'none' to format 'none'", () => {
      expect(
        normalizePdfPageNumberSettings({ position: "none", format: "dash" })
      ).toEqual({ position: "none", format: "none" });
    });

    it("normalizes format 'none' to position 'none'", () => {
      expect(
        normalizePdfPageNumberSettings({ position: "top-left", format: "none" })
      ).toEqual({ position: "none", format: "none" });
    });

    it("preserves valid position and format", () => {
      expect(
        normalizePdfPageNumberSettings({
          position: "bottom-center",
          format: "p"
        })
      ).toEqual({ position: "bottom-center", format: "p" });
    });
  });

  describe("summary text formatting", () => {
    it("formats disabled summary text", () => {
      const summary = formatPdfPageNumberSummaryText(
        { position: "none", format: "none" },
        mockTranslate
      );
      expect(summary).toBe("ページ番号なし");
    });

    it("formats enabled summary text with position and sample format", () => {
      const summary = formatPdfPageNumberSummaryText(
        { position: "top-left", format: "dash" },
        mockTranslate
      );
      expect(summary).toBe("左上 / - 1 -");
    });
  });

  describe("sample text formatting", () => {
    it("returns correct sample strings", () => {
      expect(formatSampleText("dash")).toBe("- 1 -");
      expect(formatSampleText("p")).toBe("P. 1");
      expect(formatSampleText("page")).toBe("Page. 1");
      expect(formatSampleText("none")).toBe("");
    });
  });

  describe("buildPdfHeaderFooterTemplates", () => {
    it("returns displayHeaderFooter false for none settings", () => {
      expect(
        buildPdfHeaderFooterTemplates({ position: "none", format: "none" })
      ).toEqual({ displayHeaderFooter: false });
    });

    it("generates top header template and empty footer template for top position", () => {
      const templates = buildPdfHeaderFooterTemplates({
        position: "top-left",
        format: "dash"
      });

      expect(templates.displayHeaderFooter).toBe(true);
      expect(templates.headerTemplate).toContain(
        '- <span class="pageNumber"></span> -'
      );
      expect(templates.headerTemplate).not.toContain("totalPages");
      expect(templates.footerTemplate).toBe("<div></div>");
    });

    it("generates bottom footer template and empty header template for bottom position", () => {
      const templates = buildPdfHeaderFooterTemplates({
        position: "bottom-center",
        format: "p"
      });

      expect(templates.displayHeaderFooter).toBe(true);
      expect(templates.footerTemplate).toContain(
        'P. <span class="pageNumber"></span>'
      );
      expect(templates.footerTemplate).not.toContain("totalPages");
      expect(templates.headerTemplate).toBe("<div></div>");
    });
  });
});
