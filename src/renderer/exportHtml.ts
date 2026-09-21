import MarkdownIt from "markdown-it";
import type { ExportImageAssetCopyItem } from "../shared/api";
import {
  extractProjectLocalImageLinks,
  scanMarkdownImageLinks
} from "../shared/markdownImageLinkExtraction";
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
  ExportFormat,
  PdfWritingMode
} from "./exportTypes";
import { escapeCssFontFamily } from "./exportPdf";

export function isNetworkExternalImageSrc(src: string): boolean {
  const value = src.trim();
  if (value.length === 0) {
    return false;
  }
  if (value.startsWith("//")) {
    return true;
  }
  return /^(?:https?|ftp|ws|wss):/i.test(value);
}

export function countExternalImageReferences(
  documents: readonly ExportAssemblyDocument[],
  headingRemovalLevel: HeadingRemovalLevel
): number {
  let count = 0;

  for (const doc of documents) {
    if (doc.kind !== "markdown") {
      continue;
    }

    const rawText = doc.rawText || doc.text;
    const headingProcessed = applyHeadingRemoval(rawText, headingRemovalLevel);
    const matches = scanMarkdownImageLinks(headingProcessed);

    for (const match of matches) {
      if (isNetworkExternalImageSrc(match.src)) {
        count += 1;
      }
    }
  }

  return count;
}

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

const pdfMarkdownParser = new MarkdownIt({
  html: false,
  linkify: true
});

const defaultPdfImageRender =
  pdfMarkdownParser.renderer.rules.image ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

pdfMarkdownParser.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const src = String(token.attrGet("src") ?? "");
  if (isNetworkExternalImageSrc(src)) {
    const alt = token.content || "";
    const label = alt ? `[画像: ${escapeHtmlText(alt)}]` : "[画像]";
    return `<span class="pergamum-export-image-placeholder">${label}</span>`;
  }
  return defaultPdfImageRender(tokens, idx, options, env, self);
};

function isKanjiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

function isNarouRubyReading(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB\s]+$/u.test(text);
}

function parseRubyAndEmphasisToHtml(
  text: string,
  options: {
    allowKakuyomuEmphasis: boolean;
    allowNarouShorthandRuby?: boolean;
  }
): string {
  let result = "";
  let pos = 0;
  const max = text.length;

  while (pos < max) {
    const openExplicit = text.indexOf("《", pos);
    let openParen = -1;

    if (options.allowNarouShorthandRuby) {
      const openFullParen = text.indexOf("（", pos);
      const openHalfParen = text.indexOf("(", pos);

      if (openFullParen !== -1 && openHalfParen !== -1) {
        openParen = Math.min(openFullParen, openHalfParen);
      } else if (openFullParen !== -1) {
        openParen = openFullParen;
      } else if (openHalfParen !== -1) {
        openParen = openHalfParen;
      }
    }

    let nextTokenIndex = -1;
    let nextTokenType: "explicit" | "paren" = "explicit";

    if (openExplicit !== -1 && openParen !== -1) {
      if (openExplicit <= openParen) {
        nextTokenIndex = openExplicit;
        nextTokenType = "explicit";
      } else {
        nextTokenIndex = openParen;
        nextTokenType = "paren";
      }
    } else if (openExplicit !== -1) {
      nextTokenIndex = openExplicit;
      nextTokenType = "explicit";
    } else if (openParen !== -1) {
      nextTokenIndex = openParen;
      nextTokenType = "paren";
    } else {
      result += escapeHtmlText(text.slice(pos));
      break;
    }

    if (nextTokenType === "explicit") {
      const openIndex = nextTokenIndex;
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
      continue;
    }

    if (nextTokenType === "paren") {
      const openParenIndex = nextTokenIndex;
      const parenChar = text[openParenIndex];
      const closeParenChar = parenChar === "（" ? "）" : ")";

      if (
        openParenIndex > pos &&
        (text[openParenIndex - 1] === "|" || text[openParenIndex - 1] === "｜")
      ) {
        result += escapeHtmlText(text.slice(pos, openParenIndex - 1));
        result += escapeHtmlText(parenChar);
        pos = openParenIndex + 1;
        continue;
      }

      const closeParenIndex = text.indexOf(closeParenChar, openParenIndex + 1);
      if (closeParenIndex !== -1) {
        const rubyCandidate = text.slice(openParenIndex + 1, closeParenIndex);
        if (
          !/[\r\n|｜《》()]/.test(rubyCandidate) &&
          isNarouRubyReading(rubyCandidate)
        ) {
          let kanjiStart = openParenIndex;
          while (kanjiStart > pos) {
            const prevChar = text.slice(kanjiStart - 1, kanjiStart);
            const codePoint = prevChar.codePointAt(0);
            if (codePoint !== undefined && isKanjiCodePoint(codePoint)) {
              kanjiStart -= prevChar.length;
            } else {
              break;
            }
          }

          if (kanjiStart < openParenIndex) {
            const baseText = text.slice(kanjiStart, openParenIndex);
            result += escapeHtmlText(text.slice(pos, kanjiStart));
            result += `<ruby>${escapeHtmlText(baseText)}<rt>${escapeHtmlText(rubyCandidate)}</rt></ruby>`;
            pos = closeParenIndex + 1;
            continue;
          }
        }
      }

      result += escapeHtmlText(text.slice(pos, openParenIndex + 1));
      pos = openParenIndex + 1;
      continue;
    }
  }

  return result;
}

function convertProseToHtmlParagraphs(
  text: string,
  options: {
    allowKakuyomuEmphasis: boolean;
    allowNarouShorthandRuby?: boolean;
  }
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
  imageAssetFolderName: string,
  options?: { isPdf?: boolean }
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

    const parser = options?.isPdf ? pdfMarkdownParser : markdownParser;
    const renderedHtml = parser.render(modifiedMarkdownText);
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
  const allowNarouShorthandRuby = bodyNotation === "narou";
  const bodyHtml = convertProseToHtmlParagraphs(headingProcessed, {
    allowKakuyomuEmphasis,
    allowNarouShorthandRuby
  });
  return { bodyHtml, assets: [] };
}

export function generateFileStructureTocHtml(
  documents: readonly ExportAssemblyDocument[]
): string {
  if (documents.length === 0) {
    return "";
  }

  const docIdByFilePath = new Map<string, string>();
  for (let index = 0; index < documents.length; index += 1) {
    const docIndexStr = String(index + 1).padStart(3, "0");
    docIdByFilePath.set(
      documents[index].filePath,
      `pergamum-export-doc-${docIndexStr}`
    );
  }

  interface TocTreeNode {
    name: string;
    children: Map<string, TocTreeNode>;
    filePath?: string;
    docId?: string;
  }

  const rootNodes = new Map<string, TocTreeNode>();

  for (const doc of documents) {
    const docId = docIdByFilePath.get(doc.filePath);
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
        node.docId = docId;
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
      if (node.filePath && node.docId) {
        const displayPath = escapeHtmlText(node.filePath.replace(/\\/g, "/"));
        const hrefAttr = escapeHtmlAttr(`#${node.docId}`);
        items.push(
          `<li><a href="${hrefAttr}"><code>${displayPath}</code></a></li>`
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
  assembly: ExportAssembly,
  options?: { isPdf?: boolean; pdfWritingMode?: PdfWritingMode }
): CombinedHtmlResult {
  const titleText = assembly.projectName
    ? escapeHtmlText(assembly.projectName)
    : "Pergamum Export";

  const pdfWritingMode =
    options?.pdfWritingMode ?? assembly.pdfWritingMode ?? "horizontal";
  const isVertical = options?.isPdf === true && pdfWritingMode === "vertical-rl";

  const allAssets: ExportImageAssetCopyItem[] = [];
  const seenAssets = new Set<string>();

  const docSections: string[] = [];

  for (let i = 0; i < assembly.documents.length; i += 1) {
    const doc = assembly.documents[i];
    const docIndexStr = String(i + 1).padStart(3, "0");
    const docId = `pergamum-export-doc-${docIndexStr}`;

    const { bodyHtml, assets } = renderDocumentToHtml(
      doc,
      assembly.bodyNotation,
      assembly.headingRemovalLevel,
      assembly.imageAssetFolderName,
      options
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
        `  <span id="${docId}" class="pergamum-export-document-anchor" aria-hidden="true"></span>`,
        bodyHtml,
        `</section>`
      ].join("\n")
    );
  }

  const tocHtml = assembly.appendFileStructureToc
    ? generateFileStructureTocHtml(assembly.documents)
    : "";

  const customFont = assembly.pdfFontFamily
    ? escapeCssFontFamily(assembly.pdfFontFamily)
    : "";
  const fontFamilyCss = customFont
    ? `"${customFont}", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif`
    : `"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", serif`;

  const styleRules = options?.isPdf
    ? [
        `    @page {`,
        `      size: ${isVertical ? "A4 landscape" : "A4"};`,
        `      margin: 20mm;`,
        `    }`,
        `    body {`,
        `      font-family: ${fontFamilyCss};`,
        `      font-size: 10.5pt;`,
        `      line-height: 1.8;`,
        `      color: #000000;`,
        `      background-color: #ffffff;`,
        `      margin: 0;`,
        `      padding: 0;`,
        `    }`,
        ...(isVertical
          ? [
              `    body.pergamum-export-pdf-vertical {`,
              `      writing-mode: vertical-rl;`,
              `      -webkit-writing-mode: vertical-rl;`,
              `      text-orientation: mixed;`,
              `      -webkit-text-orientation: mixed;`,
              `      line-break: strict;`,
              `    }`,
              `    body.pergamum-export-pdf-vertical .pergamum-export {`,
              `      writing-mode: vertical-rl;`,
              `      -webkit-writing-mode: vertical-rl;`,
              `      text-orientation: mixed;`,
              `      -webkit-text-orientation: mixed;`,
              `    }`,
              `    body.pergamum-export-pdf-vertical p {`,
              `      line-height: 1.8;`,
              `    }`
            ]
          : []),
        `    .pergamum-export-document {`,
        `      break-after: page;`,
        `      page-break-after: always;`,
        `    }`,
        `    .pergamum-export-document:last-child {`,
        `      break-after: auto;`,
        `      page-break-after: auto;`,
        `    }`,
        `    .pergamum-export-document-anchor {`,
        `      display: block;`,
        `      width: 1px;`,
        `      height: 1px;`,
        `      overflow: hidden;`,
        `      opacity: 0;`,
        `      pointer-events: none;`,
        `    }`,
        `    .pergamum-export-file-structure {`,
        `      break-before: page;`,
        `      page-break-before: always;`,
        `    }`,
        `    .emphasis-mark {`,
        `      text-emphasis-style: sesame;`,
        `      -webkit-text-emphasis-style: sesame;`,
        `    }`,
        `    .pergamum-export-image-placeholder {`,
        `      color: #666666;`,
        `      font-size: 0.9em;`,
        `      font-style: italic;`,
        `    }`,
        `    img {`,
        `      max-width: 100%;`,
        `      height: auto;`,
        `    }`
      ].join("\n")
    : [
        `    .pergamum-export-document-anchor {`,
        `      display: block;`,
        `      width: 1px;`,
        `      height: 1px;`,
        `      overflow: hidden;`,
        `      opacity: 0;`,
        `      pointer-events: none;`,
        `    }`,
        `    .pergamum-export-file-structure {`,
        `      break-before: page;`,
        `      page-break-before: always;`,
        `    }`,
        `    .emphasis-mark {`,
        `      text-emphasis-style: sesame;`,
        `      -webkit-text-emphasis-style: sesame;`,
        `    }`
      ].join("\n");

  const htmlContent = [
    `<!doctype html>`,
    `<html lang="ja">`,
    `<head>`,
    `  <meta charset="utf-8">`,
    `  <title>${titleText}</title>`,
    `  <style>`,
    styleRules,
    `  </style>`,
    `</head>`,
    `<body${isVertical ? ' class="pergamum-export-pdf-vertical"' : ""}>`,
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
