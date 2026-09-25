import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultMarkdownCalloutLabels,
  markdownCalloutExportCss,
  markdownCalloutIconPaths,
  markdownCalloutLabelsFor,
  markdownCalloutTypes,
  parseMarkdownCalloutMarker,
  type MarkdownCalloutType
} from "../../src/renderer/preview/markdownCallout";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import { aozoraPreviewRenderer } from "../../src/renderer/preview/aozoraPreviewRenderer";
import {
  generateCombinedHtml,
  renderDocumentToHtml
} from "../../src/renderer/exportHtml";
import type {
  ExportAssembly,
  ExportAssemblyDocument,
  ExportBodyNotation
} from "../../src/renderer/exportTypes";
import { t } from "../../src/shared/i18n";
import type { PreviewRendererId } from "../../src/shared/settings";

function renderPreview(content: string, previewRenderer: PreviewRendererId = "markdown") {
  return markdownPreviewRenderer.render(content, { previewRenderer });
}

const markerByType: Record<MarkdownCalloutType, string> = {
  note: "NOTE",
  tip: "TIP",
  important: "IMPORTANT",
  warning: "WARNING",
  caution: "CAUTION"
};

const expectedJaLabels: Record<MarkdownCalloutType, string> = {
  note: "補足",
  tip: "ヒント",
  important: "重要",
  warning: "警告",
  caution: "注意"
};

const expectedEnLabels: Record<MarkdownCalloutType, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution"
};

function markdownDoc(rawText: string): ExportAssemblyDocument {
  return {
    filePath: "chapter1.md",
    parentPath: "",
    fileName: "chapter1.md",
    kind: "markdown",
    text: rawText,
    rawText
  };
}

function assemblyFor(
  rawText: string,
  bodyNotation: ExportBodyNotation = "markdown"
): ExportAssembly {
  return {
    format: "htmlCombined",
    bodyNotation,
    headingRemovalLevel: 0,
    documents: [markdownDoc(rawText)],
    appendFileStructureToc: false,
    imageAssetFolderName: "exports.assets",
    projectName: "Callout"
  };
}

describe("markdown callouts (#568)", () => {
  describe("parseMarkdownCalloutMarker", () => {
    it.each(markdownCalloutTypes)("recognizes [!%s] case-insensitively", (type) => {
      const marker = markerByType[type];
      expect(parseMarkdownCalloutMarker(`[!${marker}]`)).toBe(type);
      expect(parseMarkdownCalloutMarker(`[!${marker.toLowerCase()}]`)).toBe(type);
      expect(
        parseMarkdownCalloutMarker(`[!${marker[0]}${marker.slice(1).toLowerCase()}]`)
      ).toBe(type);
      expect(parseMarkdownCalloutMarker(`  [!${marker}]  `)).toBe(type);
    });

    it("rejects unknown types and non-marker lines", () => {
      expect(parseMarkdownCalloutMarker("[!MEMO]")).toBeNull();
      expect(parseMarkdownCalloutMarker("[NOTE]")).toBeNull();
      expect(parseMarkdownCalloutMarker("[!NOTE] trailing text")).toBeNull();
      expect(parseMarkdownCalloutMarker("This is a normal blockquote.")).toBeNull();
    });
  });

  describe("labels and icons", () => {
    it("maps every type to ja / en i18n labels", () => {
      expect(defaultMarkdownCalloutLabels).toEqual(expectedJaLabels);
      expect(markdownCalloutLabelsFor((key) => t("ja", key))).toEqual(expectedJaLabels);
      expect(markdownCalloutLabelsFor((key) => t("en", key))).toEqual(expectedEnLabels);
    });

    it("uses the specified repository icon assets", () => {
      expect(markdownCalloutIconPaths).toEqual({
        note: "assets/icons/feather/callout/alert-circle.svg",
        tip: "assets/icons/codicons/callout/lightbulb.svg",
        important: "assets/icons/svgrepo/callout/info-message.svg",
        warning: "assets/icons/feather/callout/alert-triangle.svg",
        caution: "assets/icons/feather/callout/alert-octagon.svg"
      });
    });

    it.each(markdownCalloutTypes)(
      "inlines a self-contained, currentColor %s icon (no ids / <style> that would collide when repeated)",
      (type) => {
        const svg = readFileSync(markdownCalloutIconPaths[type], "utf8").trim();
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).toContain("currentColor");
        expect(svg).not.toMatch(/<style|<script|\sid=|<\?xml|<!--|href=/i);

        const html = renderPreview(`> [!${markerByType[type]}]\n> body`);
        expect(html).toContain(svg);
      }
    );
  });

  describe("Markdown horizontal preview rendering", () => {
    it.each(markdownCalloutTypes)("renders [!%s] as a callout with icon + label", (type) => {
      const html = renderPreview(`> [!${markerByType[type]}]\n> 本文です。`);

      expect(html).toContain(
        `<div class="markdown-callout markdown-callout-${type}" data-callout-type="${type}"`
      );
      expect(html).toContain('<div class="markdown-callout-title">');
      expect(html).toContain('<span class="markdown-callout-icon" aria-hidden="true"><svg');
      expect(html).toContain(
        `<span class="markdown-callout-label">${expectedJaLabels[type]}</span>`
      );
      expect(html).toContain('<div class="markdown-callout-body">');
      expect(html).toContain("本文です。");
      expect(html).not.toContain("<blockquote");
      // The marker line never reaches the body.
      expect(html).not.toContain(`[!${markerByType[type]}]`);
    });

    it("treats lowercase / mixed-case markers as the same type", () => {
      for (const marker of ["[!note]", "[!Note]"]) {
        const html = renderPreview(`> ${marker}\n> text`);
        expect(html).toContain("markdown-callout-note");
        expect(html).not.toContain(marker);
      }
    });

    it("keeps unknown markers as a normal blockquote", () => {
      const html = renderPreview("> [!MEMO]\n> unknown type");
      expect(html).toContain("<blockquote");
      expect(html).toContain("[!MEMO]");
      expect(html).not.toContain("markdown-callout");
    });

    it("keeps a normal blockquote unchanged", () => {
      const html = renderPreview("> This is a normal blockquote.");
      expect(html).toBe(
        '<blockquote data-source-line="1">\n<p data-source-line="1">This is a normal blockquote.</p>\n</blockquote>\n'
      );
    });

    it("renders multi-line bodies and inline Markdown / code spans normally", () => {
      const html = renderPreview(
        "> [!TIP]\n> **太字** や `inline code` を含みます。\n> 二行目です。"
      );
      expect(html).toContain("<strong>太字</strong>");
      expect(html).toContain("<code>inline code</code>");
      expect(html).toContain("二行目です。");
    });

    it("renders a body separated from the marker by a blank quoted line", () => {
      const html = renderPreview("> [!NOTE]\n>\n> 段落一。\n>\n> 段落二。");
      expect(html).toContain("markdown-callout-note");
      expect(html).toContain("段落一。");
      expect(html).toContain("段落二。");
      expect(html).not.toContain("[!NOTE]");
      // Marker-only paragraph is dropped, not rendered as an empty <p>.
      expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    });

    it("closes the callout before following text, which renders normally", () => {
      const html = renderPreview("> [!WARNING]\n> 注意書き\n\n通常本文です。");
      const calloutEnd = html.indexOf("</div>\n</div>\n");
      const paragraph = html.indexOf('<p data-source-line="4">通常本文です。</p>');
      expect(calloutEnd).toBeGreaterThan(-1);
      expect(paragraph).toBeGreaterThan(calloutEnd);
    });

    it("keeps scroll-sync anchors: callout at the marker line, body at the next line", () => {
      const html = renderPreview("# Title\n\n> [!NOTE]\n> body line");
      expect(html).toMatch(/<div class="markdown-callout markdown-callout-note"[^>]* data-source-line="3">/);
      expect(html).toContain('<p data-source-line="4">body line</p>');
    });

    it("uses caller-provided localized labels and escapes them", () => {
      const html = markdownPreviewRenderer.render("> [!NOTE]\n> body", {
        previewRenderer: "markdown",
        calloutLabels: {
          ...markdownCalloutLabelsFor((key) => t("en", key)),
          note: "<b>Note</b>"
        }
      });
      expect(html).toContain(
        '<span class="markdown-callout-label">&lt;b&gt;Note&lt;/b&gt;</span>'
      );
    });

    it("does not allow raw HTML inside the callout body", () => {
      const html = renderPreview("> [!NOTE]\n> <script>alert(1)</script>");
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("scope: non-Markdown preview targets are unaffected", () => {
    const calloutMd = "> [!NOTE]\n> 補足情報です。";

    it.each<PreviewRendererId>([
      "narouHorizontal",
      "kakuyomuHorizontal",
      "narouVertical",
      "kakuyomuVertical"
    ])("keeps [!NOTE] as a normal blockquote for %s", (previewRenderer) => {
      const html = renderPreview(calloutMd, previewRenderer);
      expect(html).toContain("<blockquote");
      expect(html).toContain("[!NOTE]");
      expect(html).not.toContain("markdown-callout");
    });

    it("keeps [!NOTE] as a normal blockquote when no preview target is given (Glossary preview)", () => {
      const html = markdownPreviewRenderer.render(calloutMd);
      expect(html).not.toContain("markdown-callout");
    });

    it.each<PreviewRendererId>(["aozoraHorizontal", "aozoraVertical"])(
      "does not render callouts in the Aozora pipeline (%s)",
      (previewRenderer) => {
        const html = aozoraPreviewRenderer.render(calloutMd, { previewRenderer });
        expect(html).not.toContain("markdown-callout");
      }
    );

    it("re-enables callouts for Markdown after rendering another target on the shared instance", () => {
      renderPreview(calloutMd, "narouHorizontal");
      expect(renderPreview(calloutMd)).toContain("markdown-callout-note");
    });
  });

  describe("HTML / PDF export", () => {
    const calloutMd =
      "> [!CAUTION]\n> **大きく** 影響します。\n\n> 通常の引用です。\n\n通常本文です。";

    it("renders the same callout structure in HTML export, with its CSS", async () => {
      const { htmlContent } = await generateCombinedHtml(assemblyFor(calloutMd));

      expect(htmlContent).toContain(
        'class="markdown-callout markdown-callout-caution"'
      );
      expect(htmlContent).toContain('data-callout-type="caution"');
      expect(htmlContent).toContain('<span class="markdown-callout-label">注意</span>');
      expect(htmlContent).toContain("<strong>大きく</strong>");
      expect(htmlContent).toContain("通常の引用です。");
      expect(htmlContent).toContain("通常本文です。");
      expect(htmlContent).toContain(markdownCalloutExportCss);
      expect(htmlContent).not.toContain("[!CAUTION]");
    });

    it("renders callouts and CSS (with print rules) in PDF export HTML", async () => {
      const { htmlContent } = await generateCombinedHtml(assemblyFor(calloutMd), {
        isPdf: true
      });

      expect(htmlContent).toContain("markdown-callout markdown-callout-caution");
      expect(htmlContent).toContain('<span class="markdown-callout-icon" aria-hidden="true"><svg');
      expect(htmlContent).toContain(markdownCalloutExportCss);
      expect(markdownCalloutExportCss).toContain("break-inside: avoid;");
      expect(markdownCalloutExportCss).toContain("print-color-adjust: exact;");
      expect(markdownCalloutExportCss).toContain("-webkit-print-color-adjust: exact;");
    });

    it("uses localized labels passed by the export caller", async () => {
      const { htmlContent } = await generateCombinedHtml(assemblyFor(calloutMd), {
        calloutLabels: markdownCalloutLabelsFor((key) => t("en", key))
      });
      expect(htmlContent).toContain('<span class="markdown-callout-label">Caution</span>');
    });

    it("needs no network or external asset: icons are inline SVG, no src/href/url()", async () => {
      const { htmlContent } = await generateCombinedHtml(assemblyFor(calloutMd), {
        isPdf: true
      });
      const calloutStart = htmlContent.indexOf('<div class="markdown-callout ');
      const calloutEnd = htmlContent.indexOf("</div>\n</div>\n", calloutStart);
      const calloutHtml = htmlContent.slice(calloutStart, calloutEnd);

      expect(calloutHtml).not.toMatch(/\ssrc=|\shref=|url\(/);
      expect(markdownCalloutExportCss).not.toMatch(/url\(|@import/);
    });

    it.each<ExportBodyNotation>(["aozora", "kakuyomu", "narou"])(
      "does not produce callouts for %s body notation",
      async (bodyNotation) => {
        const { bodyHtml } = await renderDocumentToHtml(
          markdownDoc("> [!NOTE]\n> body"),
          bodyNotation,
          0,
          "exports.assets"
        );
        expect(bodyHtml).not.toContain("markdown-callout");
      }
    );
  });

  it("styles the preview callouts in styles.css with print rules and logical properties", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    // Note uses the base `.markdown-callout` colors; the others override them.
    for (const type of markdownCalloutTypes.filter((type) => type !== "note")) {
      expect(css).toContain(`.preview .markdown-callout-${type} {`);
    }
    expect(css).toContain("border-inline-start: 4px solid var(--markdown-callout-accent);");
    expect(css).toMatch(/@media print \{\s*\.preview \.markdown-callout \{\s*break-inside: avoid;/);
  });
});
