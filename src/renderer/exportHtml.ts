import MarkdownIt from "markdown-it";
import type { ExportImageAssetCopyItem } from "../shared/api";
import { extractProjectLocalImageLinks } from "../shared/markdownImageLinkExtraction";
import {
  resolveProjectLocalImageSrc,
  type ProjectLocalImageResolutionContext
} from "../shared/projectLocalImageLink";
import { sanitizeJsonFileNameStem } from "../shared/settingsExport";
import {
  applyHeadingRemoval,
  type ExportOrigin,
  type HeadingRemovalLevel
} from "./exportCandidates";
import { replaceAozoraGaijiInText } from "./preview/aozoraGaijiResolver";
import type {
  ExportAssembly,
  ExportAssemblyDocument,
  ExportBodyNotation,
  ExportFormat
} from "./exportTypes";

export function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

const markdownParser = new MarkdownIt({
  html: false,
  linkify: true
});

function isKanjiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

function parseRubyAndEmphasisToHtml(
  text: string,
  options: { allowKakuyomuEmphasis: boolean }
): string {
  let result = "";
  let pos = 0;
  const max = text.length;

  while (pos < max) {
    const openIndex = text.indexOf("《", pos);
    if (openIndex === -1) {
      result += escapeHtmlText(text.slice(pos));
      break;
    }

    if (options.allowKakuyomuEmphasis && text.startsWith("《《", openIndex)) {
      const closeDouble = text.indexOf("》》", openIndex + 2);
      if (closeDouble > openIndex + 2) {
        const emphasisContent = text.slice(openIndex + 2, closeDouble);
        if (
          emphasisContent.length > 0 &&
          !/[\r\n《》｜|]/.test(emphasisContent)
        ) {
          result += escapeHtmlText(text.slice(pos, openIndex));
          result += `<span class="emphasis-mark">${escapeHtmlText(emphasisContent)}</span>`;
          pos = closeDouble + 2;
          continue;
        }
      }
    }

    const closeIndex = text.indexOf("》", openIndex + 1);
    if (closeIndex === -1) {
      result += escapeHtmlText(text.slice(pos));
      break;
    }

    const rubyText = text.slice(openIndex + 1, closeIndex);

    let baseStart = -1;
    let pipeCharLength = 0;
    for (let index = openIndex - 1; index >= pos; index -= 1) {
      const char = text[index];
      if (char === "｜" || char === "|") {
        baseStart = index;
        pipeCharLength = 1;
        break;
      }
      if (text[index] === "\n" || text[index] === "\r") {
        break;
      }
    }

    if (baseStart !== -1) {
      const baseText = text.slice(baseStart + pipeCharLength, openIndex);
      if (baseText.length > 0) {
        result += escapeHtmlText(text.slice(pos, baseStart));
        result += `<ruby>${escapeHtmlText(baseText)}<rt>${escapeHtmlText(rubyText)}</rt></ruby>`;
        pos = closeIndex + 1;
        continue;
      }
    }

    let kanjiStart = openIndex;
    while (kanjiStart > pos) {
      const prevChar = text.slice(kanjiStart - 1, kanjiStart);
      const codePoint = prevChar.codePointAt(0);
      if (codePoint !== undefined && isKanjiCodePoint(codePoint)) {
        kanjiStart -= prevChar.length;
      } else {
        break;
      }
    }

    if (kanjiStart < openIndex) {
      const baseText = text.slice(kanjiStart, openIndex);
      result += escapeHtmlText(text.slice(pos, kanjiStart));
      result += `<ruby>${escapeHtmlText(baseText)}<rt>${escapeHtmlText(rubyText)}</rt></ruby>`;
      pos = closeIndex + 1;
      continue;
    }

    result += escapeHtmlText(text.slice(pos, closeIndex + 1));
    pos = closeIndex + 1;
  }

  return result;
}

function convertProseToHtmlParagraphs(
  text: string,
  options: { allowKakuyomuEmphasis: boolean }
): string {
  const normalized = normalizeLineEndings(text);
  const paragraphs = normalized.split(/\n{2,}/u);

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      const htmlLines = lines.map((line) =>
        parseRubyAndEmphasisToHtml(line, options)
      );
      return `<p>${htmlLines.join("<br>")}</p>`;
    })
    .join("\n");
}

export function collectProjectLocalImagesForDocument(
  doc: ExportAssemblyDocument,
  imageAssetFolderName: string
): {
  readonly modifiedMarkdownText: string;
  readonly assets: readonly ExportImageAssetCopyItem[];
} {
  if (doc.kind !== "markdown") {
    return { modifiedMarkdownText: doc.rawText || doc.text, assets: [] };
  }

  const matches = extractProjectLocalImageLinks(doc.rawText);
  if (matches.length === 0) {
    return { modifiedMarkdownText: doc.rawText, assets: [] };
  }

  const assets: ExportImageAssetCopyItem[] = [];
  let modifiedText = "";
  let lastIndex = 0;

  const resolutionContext: ProjectLocalImageResolutionContext = {
    kind: "sourceFile",
    sourceMarkdownProjectRelativePath: doc.filePath
  };

  for (const match of matches) {
    modifiedText += doc.rawText.slice(lastIndex, match.from);

    const resolution = resolveProjectLocalImageSrc(
      match.src,
      resolutionContext
    );

    if (resolution.kind === "rewrite") {
      const cleanProjectRelativePath = resolution.projectRelativePath
        .replace(/\\/g, "/")
        .replace(/^\/+/u, "");
      const outputRelativePath = `${imageAssetFolderName}/${cleanProjectRelativePath}`;

      assets.push({
        sourceProjectRelativePath: cleanProjectRelativePath,
        outputRelativePath
      });

      modifiedText += outputRelativePath;
    } else {
      modifiedText += match.src;
    }

    lastIndex = match.to;
  }

  modifiedText += doc.rawText.slice(lastIndex);

  return {
    modifiedMarkdownText: modifiedText,
    assets
  };
}

export function renderDocumentToHtml(
  doc: ExportAssemblyDocument,
  bodyNotation: ExportBodyNotation,
  headingRemovalLevel: HeadingRemovalLevel,
  imageAssetFolderName: string
): {
  readonly bodyHtml: string;
  readonly assets: readonly ExportImageAssetCopyItem[];
} {
  const rawText = doc.kind === "markdown" ? doc.rawText : doc.text;
  const headingProcessed =
    doc.kind === "markdown"
      ? applyHeadingRemoval(rawText, headingRemovalLevel)
      : rawText;

  if (bodyNotation === "markdown") {
    const docForCollection: ExportAssemblyDocument = {
      ...doc,
      rawText: headingProcessed
    };

    const { modifiedMarkdownText, assets } =
      collectProjectLocalImagesForDocument(
        docForCollection,
        imageAssetFolderName
      );

    const renderedHtml = markdownParser.render(modifiedMarkdownText);
    return { bodyHtml: renderedHtml, assets };
  }

  if (bodyNotation === "aozora") {
    const gaijiReplaced = replaceAozoraGaijiInText(headingProcessed);
    const bodyHtml = convertProseToHtmlParagraphs(gaijiReplaced, {
      allowKakuyomuEmphasis: false
    });
    return { bodyHtml, assets: [] };
  }

  const allowKakuyomuEmphasis =
    bodyNotation === "kakuyomu" || bodyNotation === "narou";
  const bodyHtml = convertProseToHtmlParagraphs(headingProcessed, {
    allowKakuyomuEmphasis
  });
  return { bodyHtml, assets: [] };
}

export function generateFileStructureTocHtml(
  documents: readonly ExportAssemblyDocument[]
): string {
  if (documents.length === 0) {
    return "";
  }

  interface TocTreeNode {
    name: string;
    children: Map<string, TocTreeNode>;
    filePath?: string;
  }

  const rootNodes = new Map<string, TocTreeNode>();

  for (const doc of documents) {
    const normalizedPath = doc.filePath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);

    let currentMap = rootNodes;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isFile = index === segments.length - 1;

      let node = currentMap.get(segment);
      if (!node) {
        node = {
          name: segment,
          children: new Map()
        };
        currentMap.set(segment, node);
      }

      if (isFile) {
        node.filePath = doc.filePath;
      } else {
        currentMap = node.children;
      }
    }
  }

  function renderTreeNodes(nodes: Map<string, TocTreeNode>): string {
    if (nodes.size === 0) {
      return "";
    }

    const items: string[] = [];
    for (const node of nodes.values()) {
      if (node.filePath) {
        items.push(
          `<li><code>${escapeHtmlText(node.filePath.replace(/\\/g, "/"))}</code></li>`
        );
      } else {
        const childrenHtml = renderTreeNodes(node.children);
        items.push(
          `<li>\n${escapeHtmlText(node.name)}\n${childrenHtml}\n</li>`
        );
      }
    }

    return `<ul>\n${items.join("\n")}\n</ul>`;
  }

  const treeHtml = renderTreeNodes(rootNodes);

  return [
    `<section class="pergamum-export-file-structure">`,
    `  <h1>出力ファイル構造目次</h1>`,
    `  ${treeHtml}`,
    `</section>`
  ].join("\n");
}

export interface CombinedHtmlResult {
  readonly htmlContent: string;
  readonly imageAssets: readonly ExportImageAssetCopyItem[];
}

export function generateCombinedHtml(
  assembly: ExportAssembly
): CombinedHtmlResult {
  const titleText = assembly.projectName
    ? escapeHtmlText(assembly.projectName)
    : "Pergamum Export";

  const allAssets: ExportImageAssetCopyItem[] = [];
  const seenAssets = new Set<string>();

  const docSections: string[] = [];

  for (const doc of assembly.documents) {
    const { bodyHtml, assets } = renderDocumentToHtml(
      doc,
      assembly.bodyNotation,
      assembly.headingRemovalLevel,
      assembly.imageAssetFolderName
    );

    for (const asset of assets) {
      if (!seenAssets.has(asset.sourceProjectRelativePath)) {
        seenAssets.add(asset.sourceProjectRelativePath);
        allAssets.push(asset);
      }
    }

    docSections.push(
      [
        `<section class="pergamum-export-document" data-file-path="${escapeHtmlAttr(
          doc.filePath
        )}" data-parent-path="${escapeHtmlAttr(doc.parentPath)}">`,
        bodyHtml,
        `</section>`
      ].join("\n")
    );
  }

  const tocHtml = assembly.appendFileStructureToc
    ? generateFileStructureTocHtml(assembly.documents)
    : "";

  const htmlContent = [
    `<!doctype html>`,
    `<html lang="ja">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  <title>${titleText}</title>`,
    `  <style>`,
    `    .pergamum-export-file-structure {`,
    `      break-before: page;`,
    `      page-break-before: always;`,
    `    }`,
    `    .emphasis-mark {`,
    `      text-emphasis-style: sesame;`,
    `      -webkit-text-emphasis-style: sesame;`,
    `    }`,
    `  </style>`,
    `</head>`,
    `<body>`,
    `  <main class="pergamum-export">`,
    docSections.join("\n\n"),
    tocHtml ? `\n${tocHtml}` : "",
    `  </main>`,
    `</body>`,
    `</html>`
  ]
    .filter(Boolean)
    .join("\n");

  return {
    htmlContent,
    imageAssets: allAssets
  };
}

export function htmlExportDefaultFileName(
  origin: ExportOrigin,
  projectName: string | null
): string {
  function pathBaseName(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, "/").replace(/\/+$/u, "");
    const segments = normalized
      .split("/")
      .filter((segment) => segment.length > 0);
    return segments[segments.length - 1] ?? "";
  }

  function fileNameStem(fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".");
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  }

  const rawStem =
    origin.kind === "projectRoot"
      ? (projectName ?? "")
      : origin.kind === "folder"
        ? pathBaseName(origin.folderPath)
        : fileNameStem(pathBaseName(origin.filePath));

  return `${sanitizeJsonFileNameStem(rawStem, "export")}.html`;
}
