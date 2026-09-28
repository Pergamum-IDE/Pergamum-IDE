import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { markdownTableExportCss } from "../../src/renderer/preview/markdownTableCss";
import { renderMarkdownStaticExport } from "../../src/renderer/export/markdownStaticExportRenderer";

describe("Markdown Table Preview & Export Styles (#605)", () => {
  it("defines markdownTableExportCss with table, th, td borders and background", () => {
    expect(markdownTableExportCss).toContain("table {");
    expect(markdownTableExportCss).toContain("border-collapse: collapse;");
    expect(markdownTableExportCss).toContain("th, td {");
    expect(markdownTableExportCss).toContain("border: 1px solid #d0d7de;");
    expect(markdownTableExportCss).toContain("padding: 6px 10px;");
    expect(markdownTableExportCss).toContain("th {");
    expect(markdownTableExportCss).toContain("font-weight: 600;");
    expect(markdownTableExportCss).toContain("background-color: #f6f8fa;");
  });

  it("includes markdownTableExportCss in renderMarkdownStaticExport output exportCss", async () => {
    const markdown = "| 名前 | 種別 |\n| --- | --- |\n| アルマ | 人物 |";
    const result = await renderMarkdownStaticExport({
      markdown,
      imageResolutionContext: { kind: "none" },
      imageAssetFolderName: "images",
      mermaidMessages: {
        emptyMessage: "",
        errorMessage: "",
        errorHint: "",
        showDetailsLabel: ""
      }
    });

    expect(result.exportCss).toContain("border-collapse: collapse;");
    expect(result.exportCss).toContain("background-color: #f6f8fa;");
    expect(result.html).toContain("<table");
    expect(result.html).toContain("<th>名前</th>");
    expect(result.html).toContain("<td>アルマ</td>");
  });

  it("includes preview table CSS rules in styles.css", () => {
    const stylesCssPath = resolve(__dirname, "../../src/renderer/styles.css");
    const stylesCss = readFileSync(stylesCssPath, "utf8");

    expect(stylesCss).toContain(".preview table");
    expect(stylesCss).toContain(".preview th,\n.preview td");
    expect(stylesCss).toContain("border: 1px solid #d0d7de;");
    expect(stylesCss).toContain("background-color: #f6f8fa;");
  });
});
