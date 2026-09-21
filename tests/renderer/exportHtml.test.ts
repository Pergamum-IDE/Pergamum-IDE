import { describe, expect, it } from "vitest";
import {
  escapeHtmlAttr,
  escapeHtmlText,
  generateCombinedHtml,
  generateFileStructureTocHtml,
  htmlExportDefaultFileName,
  renderDocumentToHtml
} from "../../src/renderer/exportHtml";
import type {
  ExportAssembly,
  ExportAssemblyDocument
} from "../../src/renderer/exportTypes";

describe("exportHtml (#523 Slice 7)", () => {
  it("escapes HTML special characters safely in text and attributes", () => {
    expect(escapeHtmlText("A & B < C > D")).toBe("A &amp; B &lt; C &gt; D");
    expect(escapeHtmlAttr('a "b" \'c\' <d> & e')).toBe(
      "a &quot;b&quot; &#39;c&#39; &lt;d&gt; &amp; e"
    );
  });

  it("generates standalone HTML document with project name in title", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "chapter1.md",
        parentPath: "",
        fileName: "chapter1.md",
        kind: "markdown",
        text: "Chapter 1 text",
        rawText: "# Chapter 1\n\nProse text."
      }
    ];

    const assembly: ExportAssembly = {
      format: "htmlCombined",
      bodyNotation: "markdown",
      headingRemovalLevel: 0,
      documents: docs,
      appendFileStructureToc: false,
      imageAssetFolderName: "exports.assets",
      projectName: "迷子たち & 千年領主"
    };

    const { htmlContent } = generateCombinedHtml(assembly);

    expect(htmlContent).toContain("<!doctype html>");
    expect(htmlContent).toContain("<title>迷子たち &amp; 千年領主</title>");
    expect(htmlContent).toContain(
      '<section class="pergamum-export-document" data-file-path="chapter1.md" data-parent-path="">'
    );
    expect(htmlContent).toContain(
      '<span id="pergamum-export-doc-001" class="pergamum-export-document-anchor" aria-hidden="true"></span>'
    );
    expect(htmlContent).toContain("<h1>Chapter 1</h1>");
    expect(htmlContent).not.toContain(
      '<section class="pergamum-export-file-structure">'
    );
  });

  it("appends file structure TOC when appendFileStructureToc is true", () => {
    const docs: ExportAssemblyDocument[] = [
      {
        filePath: "part1/01.md",
        parentPath: "part1",
        fileName: "01.md",
        kind: "markdown",
        text: "01 text",
        rawText: "01 text"
      },
      {
        filePath: "part1/02.md",
        parentPath: "part1",
        fileName: "02.md",
        kind: "markdown",
        text: "02 text",
        rawText: "02 text"
      }
    ];

    const assembly: ExportAssembly = {
      format: "htmlCombined",
      bodyNotation: "markdown",
      headingRemovalLevel: 0,
      documents: docs,
      appendFileStructureToc: true,
      imageAssetFolderName: "exports.assets",
      projectName: "Test Project"
    };

    const { htmlContent } = generateCombinedHtml(assembly);

    expect(htmlContent).toContain(
      '<section class="pergamum-export-file-structure">'
    );
    expect(htmlContent).toContain("<h1>出力ファイル構造目次</h1>");
    expect(htmlContent).toContain("<code>part1/01.md</code>");
    expect(htmlContent).toContain("<code>part1/02.md</code>");
    expect(htmlContent).toContain("break-before: page;");
  });

  it("extracts Markdown project-internal image assets and rewrites img src", () => {
    const doc: ExportAssemblyDocument = {
      filePath: "manuscript/chapter1.md",
      parentPath: "manuscript",
      fileName: "chapter1.md",
      kind: "markdown",
      text: "",
      rawText: "Here is a map: ![Map](../assets/map.png)\nAnd external: ![Logo](https://example.com/logo.png)"
    };

    const { bodyHtml, assets } = renderDocumentToHtml(
      doc,
      "markdown",
      0,
      "exports.assets"
    );

    expect(bodyHtml).toContain(
      '<img src="exports.assets/assets/map.png" alt="Map">'
    );
    expect(bodyHtml).toContain(
      '<img src="https://example.com/logo.png" alt="Logo">'
    );
    expect(assets).toHaveLength(1);
    expect(assets[0]).toEqual({
      sourceProjectRelativePath: "assets/map.png",
      outputRelativePath: "exports.assets/assets/map.png"
    });
  });

  it("converts Aozora ruby notation to HTML ruby tags", () => {
    const doc: ExportAssemblyDocument = {
      filePath: "aozora.txt",
      parentPath: "",
      fileName: "aozora.txt",
      kind: "text",
      text: "｜漢字《かんじ》のテスト",
      rawText: "｜漢字《かんじ》のテスト"
    };

    const { bodyHtml } = renderDocumentToHtml(doc, "aozora", 0, "exports.assets");

    expect(bodyHtml).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
  });

  it("converts Kakuyomu emphasis notation to emphasis span", () => {
    const doc: ExportAssemblyDocument = {
      filePath: "kakuyomu.txt",
      parentPath: "",
      fileName: "kakuyomu.txt",
      kind: "text",
      text: "《《強小》》のテスト",
      rawText: "《《強小》》のテスト"
    };

    const { bodyHtml } = renderDocumentToHtml(
      doc,
      "kakuyomu",
      0,
      "exports.assets"
    );

    expect(bodyHtml).toContain(
      '<span class="emphasis-mark">強小</span>'
    );
  });

  it("computes html default file name properly", () => {
    expect(
      htmlExportDefaultFileName({ kind: "projectRoot" }, "迷子たち")
    ).toBe("迷子たち.html");

    expect(
      htmlExportDefaultFileName(
        { kind: "folder", folderPath: "part1" },
        "迷子たち"
      )
    ).toBe("part1.html");

    expect(
      htmlExportDefaultFileName(
        { kind: "file", filePath: "chapter1.md" },
        "迷子たち"
      )
    ).toBe("chapter1.html");
  });

  describe("Narou ruby shorthand and escape marker (Slice 14)", () => {
    it("converts 漢字（かんじ） and 漢字(かんじ) to ruby markup in Narou notation", () => {
      const fullParenDoc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "漢字（かんじ）のテスト",
        rawText: "漢字（かんじ）のテスト"
      };
      const halfParenDoc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "漢字(かんじ)のテスト",
        rawText: "漢字(かんじ)のテスト"
      };

      const { bodyHtml: fullHtml } = renderDocumentToHtml(
        fullParenDoc,
        "narou",
        0,
        "exports.assets"
      );
      const { bodyHtml: halfHtml } = renderDocumentToHtml(
        halfParenDoc,
        "narou",
        0,
        "exports.assets"
      );

      expect(fullHtml).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
      expect(halfHtml).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    });

    it("uses contiguous Kanji run as parent text (e.g. 東京都（とうきょうと）)", () => {
      const doc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "東京都（とうきょうと）に行く",
        rawText: "東京都（とうきょうと）に行く"
      };

      const { bodyHtml } = renderDocumentToHtml(
        doc,
        "narou",
        0,
        "exports.assets"
      );

      expect(bodyHtml).toContain("<ruby>東京都<rt>とうきょうと</rt></ruby>");
    });

    it("does not convert non-reading content inside parentheses (e.g. 東京（本社）)", () => {
      const doc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "東京（本社）へ行った",
        rawText: "東京（本社）へ行った"
      };

      const { bodyHtml } = renderDocumentToHtml(
        doc,
        "narou",
        0,
        "exports.assets"
      );

      expect(bodyHtml).not.toContain("<ruby>");
      expect(bodyHtml).toContain("東京（本社）へ行った");
    });

    it("removes escape markers before parentheses and suppresses ruby conversion", () => {
      const cases = [
        "漢字|（これは無視）",
        "漢字｜（これは無視）",
        "漢字|(これは無視)",
        "漢字｜(これは無視)"
      ];

      for (const input of cases) {
        const doc: ExportAssemblyDocument = {
          filePath: "narou.txt",
          parentPath: "",
          fileName: "narou.txt",
          kind: "text",
          text: input,
          rawText: input
        };

        const { bodyHtml } = renderDocumentToHtml(
          doc,
          "narou",
          0,
          "exports.assets"
        );

        expect(bodyHtml).not.toContain("<ruby>");
        expect(bodyHtml).not.toContain("|");
        expect(bodyHtml).not.toContain("｜");
        expect(bodyHtml).toMatch(/漢字[（(]これは無視[）)]/);
      }
    });

    it("preserves explicit ruby syntax |漢字《かんじ》 and ｜漢字《かんじ》 in Narou notation", () => {
      const halfPipeDoc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "|漢字《かんじ》のテスト",
        rawText: "|漢字《かんじ》のテスト"
      };
      const fullPipeDoc: ExportAssemblyDocument = {
        filePath: "narou.txt",
        parentPath: "",
        fileName: "narou.txt",
        kind: "text",
        text: "｜漢字《かんじ》のテスト",
        rawText: "｜漢字《かんじ》のテスト"
      };

      const { bodyHtml: halfHtml } = renderDocumentToHtml(
        halfPipeDoc,
        "narou",
        0,
        "exports.assets"
      );
      const { bodyHtml: fullHtml } = renderDocumentToHtml(
        fullPipeDoc,
        "narou",
        0,
        "exports.assets"
      );

      expect(halfHtml).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
      expect(fullHtml).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    });

    it("does not convert shorthand ruby for other body notations (Markdown, Aozora, Kakuyomu)", () => {
      const doc: ExportAssemblyDocument = {
        filePath: "test.txt",
        parentPath: "",
        fileName: "test.txt",
        kind: "text",
        text: "漢字（かんじ）のテスト",
        rawText: "漢字（かんじ）のテスト"
      };

      const { bodyHtml: markdownHtml } = renderDocumentToHtml(
        doc,
        "markdown",
        0,
        "exports.assets"
      );
      const { bodyHtml: aozoraHtml } = renderDocumentToHtml(
        doc,
        "aozora",
        0,
        "exports.assets"
      );
      const { bodyHtml: kakuyomuHtml } = renderDocumentToHtml(
        doc,
        "kakuyomu",
        0,
        "exports.assets"
      );

      expect(markdownHtml).not.toContain("<ruby>");
      expect(aozoraHtml).not.toContain("<ruby>");
      expect(kakuyomuHtml).not.toContain("<ruby>");
    });
  });
});
