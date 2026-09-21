import { describe, expect, it } from "vitest";
import {
  countExternalImageReferences,
  generateCombinedHtml,
  isNetworkExternalImageSrc,
  renderDocumentToHtml
} from "../../src/renderer/exportHtml";
import {
  escapeCssFontFamily,
  extractPdfFontNames,
  inspectPdfFonts,
  normalizeFontNameForMatch,
  pdfExportDefaultFileName
} from "../../src/renderer/exportPdf";
import type {
  ExportAssembly,
  ExportAssemblyDocument
} from "../../src/renderer/exportTypes";

describe("exportPdf (#523 Slice 8)", () => {
  it("detects network external image sources correctly", () => {
    expect(isNetworkExternalImageSrc("https://example.com/pic.png")).toBe(true);
    expect(isNetworkExternalImageSrc("http://example.com/pic.png")).toBe(true);
    expect(isNetworkExternalImageSrc("//example.com/pic.png")).toBe(true);
    expect(isNetworkExternalImageSrc("ftp://example.com/pic.png")).toBe(true);
    expect(isNetworkExternalImageSrc("ws://example.com/pic.png")).toBe(true);
    expect(isNetworkExternalImageSrc("wss://example.com/pic.png")).toBe(true);

    expect(isNetworkExternalImageSrc("assets/image.png")).toBe(false);
    expect(isNetworkExternalImageSrc("./assets/image.png")).toBe(false);
    expect(isNetworkExternalImageSrc("../assets/image.png")).toBe(false);
    expect(isNetworkExternalImageSrc("exports.assets/image.png")).toBe(false);
  });

  it("counts external image references across markdown documents", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "chapter1.md",
        parentPath: "",
        fileName: "chapter1.md",
        kind: "markdown",
        text: "",
        rawText:
          "# Ch1\n\n![Local](assets/map.png)\n![Net1](https://example.com/1.png)\n![Net2](http://example.com/2.png)"
      },
      {
        filePath: "chapter2.md",
        parentPath: "",
        fileName: "chapter2.md",
        kind: "markdown",
        text: "",
        rawText: "![Net3](//example.com/3.png)\n![Local2](./pic.png)"
      }
    ];

    const count = countExternalImageReferences(docs, 0);
    expect(count).toBe(3);
  });

  it("replaces network external images with placeholder in PDF rendering mode", () => {
    const doc: ExportAssemblyDocument = {
      filePath: "manuscript/chapter1.md",
      parentPath: "manuscript",
      fileName: "chapter1.md",
      kind: "markdown",
      text: "",
      rawText:
        "Here is local: ![Local Map](../assets/map.png)\nAnd external: ![Remote Logo](https://example.com/logo.png)\nAnd external no alt: ![](https://example.com/noalt.png)"
    };

    const { bodyHtml, assets } = renderDocumentToHtml(
      doc,
      "markdown",
      0,
      "exports.assets",
      { isPdf: true }
    );

    expect(bodyHtml).toContain(
      '<img src="exports.assets/assets/map.png" alt="Local Map">'
    );
    expect(bodyHtml).toContain(
      '<span class="pergamum-export-image-placeholder">[画像: Remote Logo]</span>'
    );
    expect(bodyHtml).toContain(
      '<span class="pergamum-export-image-placeholder">[画像]</span>'
    );
    expect(assets).toHaveLength(1);
  });

  it("generates combined HTML with PDF page styles when isPdf is true", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "chapter1.md",
        parentPath: "",
        fileName: "chapter1.md",
        kind: "markdown",
        text: "Chapter 1 text",
        rawText: "# Chapter 1"
      }
    ];

    const assembly: ExportAssembly = {
      format: "pdfCombined",
      bodyNotation: "markdown",
      headingRemovalLevel: 0,
      documents: docs,
      appendFileStructureToc: true,
      imageAssetFolderName: "exports.assets",
      projectName: "PDF Novel"
    };

    const { htmlContent } = generateCombinedHtml(assembly, { isPdf: true });

    expect(htmlContent).toContain("@page {");
    expect(htmlContent).toContain("size: A4;");
    expect(htmlContent).not.toContain("size: A4 landscape;");
    expect(htmlContent).toContain("break-after: page;");
    expect(htmlContent).not.toContain("class=\"pergamum-export-pdf-vertical\"");
    expect(htmlContent).toContain(".pergamum-export-image-placeholder");
  });

  it("generates combined HTML with A4 landscape and vertical writing CSS when pdfWritingMode is vertical-rl", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "chapter1.md",
        parentPath: "",
        fileName: "chapter1.md",
        kind: "markdown",
        text: "Chapter 1 text",
        rawText: "# Chapter 1"
      }
    ];

    const assembly: ExportAssembly = {
      format: "pdfCombined",
      pdfWritingMode: "vertical-rl",
      bodyNotation: "markdown",
      headingRemovalLevel: 0,
      documents: docs,
      appendFileStructureToc: true,
      imageAssetFolderName: "exports.assets",
      projectName: "PDF Vertical Novel"
    };

    const { htmlContent } = generateCombinedHtml(assembly, {
      isPdf: true,
      pdfWritingMode: "vertical-rl"
    });

    expect(htmlContent).toContain("@page {");
    expect(htmlContent).toContain("size: A4 landscape;");
    expect(htmlContent).toContain('<body class="pergamum-export-pdf-vertical">');
    expect(htmlContent).toContain("writing-mode: vertical-rl;");
    expect(htmlContent).toContain("text-orientation: mixed;");
    expect(htmlContent).toContain("line-break: strict;");
    expect(htmlContent).toContain("出力ファイル構造目次");
  });

  it("does not add vertical writing styles to non-PDF HTML export", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "chapter1.md",
        parentPath: "",
        fileName: "chapter1.md",
        kind: "markdown",
        text: "Chapter 1 text",
        rawText: "# Chapter 1"
      }
    ];

    const assembly: ExportAssembly = {
      format: "htmlCombined",
      pdfWritingMode: "vertical-rl",
      bodyNotation: "markdown",
      headingRemovalLevel: 0,
      documents: docs,
      appendFileStructureToc: false,
      imageAssetFolderName: "exports.assets",
      projectName: "HTML Novel"
    };

    const { htmlContent } = generateCombinedHtml(assembly, { isPdf: false });

    expect(htmlContent).not.toContain("size: A4 landscape;");
    expect(htmlContent).not.toContain('class="pergamum-export-pdf-vertical"');
    expect(htmlContent).not.toContain("writing-mode: vertical-rl;");
  });

  it("computes PDF default file name correctly", () => {
    expect(
      pdfExportDefaultFileName({ kind: "projectRoot" }, "吾輩は猫である")
    ).toBe("吾輩は猫である.pdf");

    expect(
      pdfExportDefaultFileName(
        { kind: "folder", folderPath: "part1" },
        "吾輩は猫である"
      )
    ).toBe("part1.pdf");

    expect(
      pdfExportDefaultFileName(
        { kind: "file", filePath: "chapter1.md" },
        "吾輩は猫である"
      )
    ).toBe("chapter1.pdf");
  });

  describe("font inspection and escaping (#523 Slice 9)", () => {
    it("escapes dangerous characters in font family names for CSS", () => {
      expect(escapeCssFontFamily("MS Mincho; body { color: red; }")).toBe(
        "MS Mincho body  color: red"
      );
      expect(escapeCssFontFamily("   Yu Gothic\n  ")).toBe("Yu Gothic");
    });

    it("normalizes font names for matching", () => {
      expect(normalizeFontNameForMatch("ABCDEF+MS-Mincho-Bold")).toBe("msmincho");
      expect(normalizeFontNameForMatch("IPA Mincho Regular")).toBe("ipamincho");
    });

    it("extracts font names from PDF buffer", () => {
      const buf = Buffer.from(
        "1 0 obj\n/Type /Font\n/BaseFont /ABCDEF+MS-Mincho\n/FontName /Helvetica-Bold\n/FontFamily (Yu Gothic)\nendobj",
        "latin1"
      );
      const names = extractPdfFontNames(buf);
      expect(names).toEqual(["ABCDEF+MS-Mincho", "Helvetica-Bold", "Yu Gothic"]);
    });

    it("inspects PDF fonts and returns confirmed status when all fonts match requested", () => {
      const buf = Buffer.from(
        "/BaseFont /ABCDEF+MS-Mincho\n/FontName /MS-Mincho-Bold",
        "latin1"
      );
      const result = inspectPdfFonts(buf, "MS Mincho");
      expect(result.status).toBe("confirmed");
      expect(result.requestedFontFamily).toBe("MS Mincho");
      expect(result.matchedFonts).toEqual(["ABCDEF+MS-Mincho", "MS-Mincho-Bold"]);
    });

    it("inspects PDF fonts and returns partial status when requested font is matched along with fallback fonts", () => {
      const buf = Buffer.from(
        "/BaseFont /ABCDEF+MS-Mincho\n/FontName /Helvetica",
        "latin1"
      );
      const result = inspectPdfFonts(buf, "MS Mincho");
      expect(result.status).toBe("partial");
      expect(result.matchedFonts).toEqual(["ABCDEF+MS-Mincho"]);
    });

    it("inspects PDF fonts and returns notConfirmed status when requested font is not detected", () => {
      const buf = Buffer.from("/BaseFont /Helvetica\n/FontName /Times", "latin1");
      const result = inspectPdfFonts(buf, "MS Mincho");
      expect(result.status).toBe("notConfirmed");
      expect(result.matchedFonts).toEqual([]);
    });

    it("returns skipped status when no requested font family is provided", () => {
      const buf = Buffer.from("/BaseFont /Helvetica", "latin1");
      const resultNull = inspectPdfFonts(buf, null);
      expect(resultNull.status).toBe("skipped");

      const resultEmpty = inspectPdfFonts(buf, "   ");
      expect(resultEmpty.status).toBe("skipped");
    });

    it("embeds requested font family into generated PDF CSS", () => {
      const docs: ExportAssemblyDocument[] = [
        {
          filePath: "doc.md",
          parentPath: "",
          fileName: "doc.md",
          kind: "markdown",
          text: "Sample",
          rawText: "Sample"
        }
      ];
      const assembly: ExportAssembly = {
        format: "pdfCombined",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: docs,
        appendFileStructureToc: false,
        imageAssetFolderName: "exports.assets",
        projectName: "Test",
        pdfFontFamily: "Yu Mincho"
      };

      const { htmlContent } = generateCombinedHtml(assembly, { isPdf: true });
      expect(htmlContent).toContain('font-family: "Yu Mincho"');
    });
  });

  describe("TOC internal anchor links (#523 Slice 13)", () => {
    it("generates sequential zero-padded IDs for document sections and links TOC entries to them", () => {
      const docs: ExportAssemblyDocument[] = [
        {
          filePath: "manuscript/001_intro.md",
          parentPath: "manuscript",
          fileName: "001_intro.md",
          kind: "markdown",
          text: "Intro text",
          rawText: "# Intro"
        },
        {
          filePath: "manuscript/002_chapter1.md",
          parentPath: "manuscript",
          fileName: "002_chapter1.md",
          kind: "markdown",
          text: "Chapter 1 text",
          rawText: "# Chapter 1"
        }
      ];

      const assembly: ExportAssembly = {
        format: "htmlCombined",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: docs,
        appendFileStructureToc: true,
        imageAssetFolderName: "exports.assets",
        projectName: "Novel"
      };

      const { htmlContent } = generateCombinedHtml(assembly, { isPdf: false });

      expect(htmlContent).toContain(
        '<section class="pergamum-export-document" data-file-path="manuscript/001_intro.md" data-parent-path="manuscript">'
      );
      expect(htmlContent).toContain(
        '<span id="pergamum-export-doc-001" class="pergamum-export-document-anchor" aria-hidden="true"></span>'
      );
      expect(htmlContent).toContain(
        '<section class="pergamum-export-document" data-file-path="manuscript/002_chapter1.md" data-parent-path="manuscript">'
      );
      expect(htmlContent).toContain(
        '<span id="pergamum-export-doc-002" class="pergamum-export-document-anchor" aria-hidden="true"></span>'
      );

      expect(htmlContent).toContain(
        '<li><a href="#pergamum-export-doc-001"><code>manuscript/001_intro.md</code></a></li>'
      );
      expect(htmlContent).toContain(
        '<li><a href="#pergamum-export-doc-002"><code>manuscript/002_chapter1.md</code></a></li>'
      );
    });

    it("preserves TOC links for both PDF horizontal and PDF vertical export", () => {
      const docs: ExportAssemblyDocument[] = [
        {
          filePath: "ch1.md",
          parentPath: "",
          fileName: "ch1.md",
          kind: "markdown",
          text: "Chapter 1",
          rawText: "Chapter 1"
        }
      ];

      const horizontalAssembly: ExportAssembly = {
        format: "pdfCombined",
        pdfWritingMode: "horizontal",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: docs,
        appendFileStructureToc: true,
        imageAssetFolderName: "exports.assets",
        projectName: "PDF Horizontal"
      };

      const verticalAssembly: ExportAssembly = {
        format: "pdfCombined",
        pdfWritingMode: "vertical-rl",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: docs,
        appendFileStructureToc: true,
        imageAssetFolderName: "exports.assets",
        projectName: "PDF Vertical"
      };

      const { htmlContent: horizontalHtml } = generateCombinedHtml(
        horizontalAssembly,
        { isPdf: true, pdfWritingMode: "horizontal" }
      );
      const { htmlContent: verticalHtml } = generateCombinedHtml(
        verticalAssembly,
        { isPdf: true, pdfWritingMode: "vertical-rl" }
      );

      expect(horizontalHtml).toContain(
        '<span id="pergamum-export-doc-001" class="pergamum-export-document-anchor" aria-hidden="true"></span>'
      );
      expect(horizontalHtml).toContain(
        '<li><a href="#pergamum-export-doc-001"><code>ch1.md</code></a></li>'
      );

      expect(verticalHtml).toContain(
        '<body class="pergamum-export-pdf-vertical">'
      );
      expect(verticalHtml).toContain(
        '<span id="pergamum-export-doc-001" class="pergamum-export-document-anchor" aria-hidden="true"></span>'
      );
      expect(verticalHtml).toContain(
        '<li><a href="#pergamum-export-doc-001"><code>ch1.md</code></a></li>'
      );
      // TOC is inside main.pergamum-export inside body.pergamum-export-pdf-vertical
      expect(verticalHtml).toContain(
        '<section class="pergamum-export-file-structure">'
      );
    });

    it("escapes special characters in file paths for TOC links and attributes", () => {
      const docs: ExportAssemblyDocument[] = [
        {
          filePath: 'folder & test/<special> "file".md',
          parentPath: "folder & test",
          fileName: '<special> "file".md',
          kind: "markdown",
          text: "Content",
          rawText: "Content"
        }
      ];

      const assembly: ExportAssembly = {
        format: "htmlCombined",
        bodyNotation: "markdown",
        headingRemovalLevel: 0,
        documents: docs,
        appendFileStructureToc: true,
        imageAssetFolderName: "exports.assets",
        projectName: "Escape Test"
      };

      const { htmlContent } = generateCombinedHtml(assembly, { isPdf: false });

      expect(htmlContent).toContain(
        'data-file-path="folder &amp; test/&lt;special&gt; &quot;file&quot;.md"'
      );
      expect(htmlContent).toContain(
        '<li><a href="#pergamum-export-doc-001"><code>folder &amp; test/&lt;special&gt; "file".md</code></a></li>'
      );
    });
  });
});
