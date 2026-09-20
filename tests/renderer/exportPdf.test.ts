import { describe, expect, it } from "vitest";
import {
  countExternalImageReferences,
  generateCombinedHtml,
  isNetworkExternalImageSrc,
  renderDocumentToHtml
} from "../../src/renderer/exportHtml";
import { pdfExportDefaultFileName } from "../../src/renderer/exportPdf";
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
    expect(htmlContent).toContain("break-after: page;");
    expect(htmlContent).toContain(".pergamum-export-image-placeholder");
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
});
