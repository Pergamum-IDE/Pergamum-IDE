import { describe, expect, it } from "vitest";
import {
  applyExportDialogOrder,
  createOrderStateFromCandidates,
  reorderFileWithinGroup,
  reorderFolderGroup
} from "../../src/renderer/exportDialogOrder";
import type {
  ExportCandidateListItem,
  ExportDocumentKind
} from "../../src/renderer/exportCandidates";
import {
  TXT_UTF8_EXPORT_FORMAT,
  createExportAssembly,
  createTxtExportDocumentText,
  createTxtUtf8ExportText,
  normalizeAozoraForTxt,
  stripMarkdownForTxt,
  txtExportDefaultFileName
} from "../../src/renderer/exportTxt";

function candidate(
  filePath: string,
  rawText: string,
  options: {
    readonly kind?: ExportDocumentKind;
    readonly included?: boolean;
  } = {}
): ExportCandidateListItem {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] ?? filePath;
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";

  return {
    documentKey: filePath,
    filePath,
    parentPath,
    fileName,
    kind: options.kind ?? "markdown",
    rawText,
    previewStart: rawText,
    previewEnd: rawText,
    previewStartHover: rawText,
    previewEndHover: rawText,
    characterCount: rawText.length,
    included: options.included ?? true
  };
}

describe("TXT UTF-8 export helpers (#523 Slice 6)", () => {
  it("assembles included documents in the current export order", () => {
    const candidates = [
      candidate("First/01.md", "first one"),
      candidate("First/02.md", "first two", { included: false }),
      candidate("Second/01.md", "second one")
    ];
    const initialOrder = createOrderStateFromCandidates(candidates);
    const groupReordered = reorderFolderGroup(initialOrder, "Second", "First");
    const fileReordered = reorderFileWithinGroup(
      groupReordered,
      "First",
      "First/02.md",
      "First",
      "First/01.md"
    );
    const ordered = applyExportDialogOrder(candidates, fileReordered);
    const assembly = createExportAssembly(ordered, {
      format: TXT_UTF8_EXPORT_FORMAT,
      bodyNotation: "markdown",
      headingRemovalLevel: 0
    });

    expect(assembly.documents.map((document) => document.filePath)).toEqual([
      "Second/01.md",
      "First/01.md"
    ]);
    expect(createTxtUtf8ExportText(assembly)).toBe("second one\n\nfirst one");
  });

  it("applies heading removal before Markdown TXT cleanup", () => {
    expect(
      createTxtExportDocumentText(
        "# 第一話\n\n彼は**静かに**言った。",
        "markdown",
        "markdown",
        1
      )
    ).not.toContain("第一話");
    expect(
      createTxtExportDocumentText(
        "# 第一話\n\n彼は**静かに**言った。",
        "markdown",
        "markdown",
        1
      )
    ).toContain("彼は静かに言った。");
  });

  it("strips presentation Markdown while preserving ruby and emphasis-dot notation", () => {
    const markdown = [
      "# 第一話",
      "> 引用",
      "- 箇条書き",
      "1. 番号付き",
      "彼は**静かに**、*ゆっくり*、~~消して~~、||秘密||を話した。",
      "<u>下線</u><ins>挿入</ins><span>HTML</span>",
      "[表示名](https://example.test) ![代替](image.png) `code`",
      "｜大山椒魚《おおさんしょううお》が《《ゆっくり》》動いた。",
      "---",
      "```",
      "fenced body",
      "```"
    ].join("\n");

    const text = stripMarkdownForTxt(markdown);

    expect(text).toContain("第一話");
    expect(text).toContain("引用");
    expect(text).toContain("箇条書き");
    expect(text).toContain("番号付き");
    expect(text).toContain("彼は静かに、ゆっくり、消して、秘密を話した。");
    expect(text).toContain("下線挿入HTML");
    expect(text).toContain("表示名 代替 code");
    expect(text).toContain(
      "｜大山椒魚《おおさんしょううお》が《《ゆっくり》》動いた。"
    );
    expect(text).toContain("fenced body");
    expect(text).not.toContain("**");
    expect(text).not.toContain("~~");
    expect(text).not.toContain("||");
    expect(text).not.toContain("```");
  });

  it("normalizes Aozora gaiji annotations while preserving ruby and unknown annotations", () => {
    const text = normalizeAozoraForTxt(
      "吾輩※［＃1-14-2］\r\n｜吾輩《わがはい》\r\n※［＃未知の注記］"
    );

    expect(text).toContain("吾輩𠀋");
    expect(text).toContain("｜吾輩《わがはい》");
    expect(text).toContain("※［＃未知の注記］");
    expect(text).not.toContain("\r\n");
  });

  it("uses CP932-decoded Aozora text supplied by the caller for Aozora assembly", () => {
    const assembly = createExportAssembly(
      [candidate("aozora.txt", "mojibake", { kind: "text" })],
      {
        format: TXT_UTF8_EXPORT_FORMAT,
        bodyNotation: "aozora",
        headingRemovalLevel: 6,
        aozoraTextByFilePath: {
          "aozora.txt": "# Markdownではない\n※［＃1-14-2］"
        }
      }
    );

    expect(assembly.documents[0].text).toBe("# Markdownではない\n𠀋");
  });

  it("uses the same light cleanup for Narou and Kakuyomu posting text", () => {
    expect(
      createTxtExportDocumentText(
        "彼は__静かに__<u>言った</u>。",
        "markdown",
        "narou",
        0
      )
    ).toBe("彼は静かに言った。");
    expect(
      createTxtExportDocumentText(
        "《《強調》》と[リンク](https://example.test)",
        "markdown",
        "kakuyomu",
        0
      )
    ).toBe("《《強調》》とリンク");
  });

  it("derives safe TXT default file names from the export origin", () => {
    expect(
      txtExportDefaultFileName({ kind: "projectRoot" }, "迷子たちと千年領主")
    ).toBe("迷子たちと千年領主.txt");
    expect(
      txtExportDefaultFileName(
        { kind: "folder", folderPath: "本文/第一部" },
        "Novel"
      )
    ).toBe("第一部.txt");
    expect(
      txtExportDefaultFileName(
        { kind: "file", filePath: "本文/01_邂逅.md" },
        "Novel"
      )
    ).toBe("01_邂逅.txt");
    expect(txtExportDefaultFileName({ kind: "projectRoot" }, "CON")).toBe(
      "CON_.txt"
    );
  });
});
