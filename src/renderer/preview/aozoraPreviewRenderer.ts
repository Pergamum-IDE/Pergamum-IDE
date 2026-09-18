import type { PreviewRenderer, PreviewRenderOptions } from "./previewRenderer";

function isKanjiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface RubyTextChunk {
  type: "text" | "html_inline";
  content: string;
}

/**
 * Parses Aozora-style ruby notation in HTML-escaped plain text string.
 * Supports explicit ruby base markers (｜親文字《るび》 / |親文字《るび》)
 * and implicit ruby base (contiguous Kanji run immediately preceding 《るび》).
 */
function parseRubyInText(text: string): RubyTextChunk[] {
  const result: RubyTextChunk[] = [];
  let pos = 0;
  const max = text.length;

  while (pos < max) {
    const openIndex = text.indexOf("《", pos);
    if (openIndex === -1) {
      break;
    }

    const closeIndex = text.indexOf("》", openIndex + 1);
    if (closeIndex === -1) {
      pos = openIndex + 1;
      continue;
    }

    const rubyText = text.slice(openIndex + 1, closeIndex);
    if (rubyText.length === 0 || /[\r\n《》｜|]/.test(rubyText)) {
      pos = openIndex + 1;
      continue;
    }

    let matchStart = -1;
    let baseText = "";

    // Check 1: Explicit ruby base marker (｜ or |) before openIndex
    const explicit1 = text.lastIndexOf("｜", openIndex - 1);
    const explicit2 = text.lastIndexOf("|", openIndex - 1);
    const explicitMarkerPos = Math.max(explicit1, explicit2);

    if (explicitMarkerPos >= pos) {
      const candidateBase = text.slice(explicitMarkerPos + 1, openIndex);
      if (candidateBase.length > 0 && !/[\r\n》｜|]/.test(candidateBase)) {
        matchStart = explicitMarkerPos;
        baseText = candidateBase;
      }
    }

    // Check 2: Implicit ruby base (contiguous Kanji run immediately preceding openIndex)
    if (matchStart === -1) {
      let kanjiStart = openIndex;
      while (kanjiStart > pos) {
        let prevPos = kanjiStart - 1;
        if (
          prevPos > pos &&
          text.charCodeAt(prevPos) >= 0xdc00 &&
          text.charCodeAt(prevPos) <= 0xdfff &&
          text.charCodeAt(prevPos - 1) >= 0xd800 &&
          text.charCodeAt(prevPos - 1) <= 0xdbff
        ) {
          prevPos -= 1;
        }
        const cp = text.codePointAt(prevPos);
        if (cp === undefined || !isKanjiCodePoint(cp)) {
          break;
        }
        kanjiStart = prevPos;
      }

      if (kanjiStart < openIndex) {
        matchStart = kanjiStart;
        baseText = text.slice(kanjiStart, openIndex);
      }
    }

    if (matchStart === -1) {
      result.push({
        type: "text",
        content: text.slice(pos, openIndex + 1)
      });
      pos = openIndex + 1;
      continue;
    }

    if (matchStart > pos) {
      result.push({
        type: "text",
        content: text.slice(pos, matchStart)
      });
    }

    result.push({
      type: "html_inline",
      content: `<ruby>${baseText}<rt>${rubyText}</rt></ruby>`
    });

    pos = closeIndex + 1;
  }

  if (pos < max) {
    result.push({
      type: "text",
      content: text.slice(pos)
    });
  }

  return result;
}

/**
 * Transforms inline annotations in escaped source text:
 * - Ruby (｜漢字《るび》, 漢字《るび》)
 * - Bouten (［＃傍点］...［＃傍点終わり］)
 * - Bold (［＃太字］...［＃太字終わり］)
 * - Italic (［＃斜体］...［＃斜体終わり］)
 * And strips remaining unsupported annotations (［＃...］, ※［＃...］).
 */
function processInlineContent(rawText: string): string {
  const escaped = escapeHtml(rawText);

  // 1. Ruby parsing
  const rubyChunks = parseRubyInText(escaped);
  let html = rubyChunks.map((chunk) => chunk.content).join("");

  // 2. Bouten parsing: ［＃傍点］...［＃傍点終わり］
  html = html.replace(
    /［＃傍点］([\s\S]*?)［＃傍点終わり］/g,
    '<span class="aozora-bouten">$1</span>'
  );

  // 3. Bold parsing: ［＃太字］...［＃太字終わり］
  html = html.replace(
    /［＃太字］([\s\S]*?)［＃太字終わり］/g,
    "<strong>$1</strong>"
  );

  // 4. Italic parsing: ［＃斜体］...［＃斜体終わり］
  html = html.replace(
    /［＃斜体］([\s\S]*?)［＃斜体終わり］/g,
    "<em>$1</em>"
  );

  // 5. Strip unsupported Aozora annotations: ［＃...］ and ※［＃...］
  html = html.replace(/※?［＃[^］]+］/g, "");

  return html;
}

/**
 * #509: Aozora Bunko-like horizontal novel preview renderer.
 * Plain-text + Aozora annotations renderer (does NOT use markdown-it).
 */
export const aozoraPreviewRenderer: PreviewRenderer = {
  render(content: string, _options?: PreviewRenderOptions): string {
    const lines = content.split(/\r\n|\r|\n/);
    const htmlBlocks: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const rawLine = lines[i];

      // Page break check: ［＃改ページ］
      if (rawLine.includes("［＃改ページ］")) {
        htmlBlocks.push(
          `<hr class="aozora-page-break" data-source-line="${lineNo}" />`
        );
        continue;
      }

      // Check range headings
      // 大見出し -> h2
      const oomidashiMatch = rawLine.match(
        /^[\s]*［＃大見出し］([\s\S]*?)［＃大見出し終わり］[\s]*$/
      );
      if (oomidashiMatch) {
        const headingText = processInlineContent(oomidashiMatch[1]);
        htmlBlocks.push(
          `<h2 data-source-line="${lineNo}">${headingText}</h2>`
        );
        continue;
      }

      // 中見出し -> h3
      const nakamidashiMatch = rawLine.match(
        /^[\s]*［＃中見出し］([\s\S]*?)［＃中見出し終わり］[\s]*$/
      );
      if (nakamidashiMatch) {
        const headingText = processInlineContent(nakamidashiMatch[1]);
        htmlBlocks.push(
          `<h3 data-source-line="${lineNo}">${headingText}</h3>`
        );
        continue;
      }

      // 小見出し -> h4
      const komidashiMatch = rawLine.match(
        /^[\s]*［＃小見出し］([\s\S]*?)［＃小見出し終わり］[\s]*$/
      );
      if (komidashiMatch) {
        const headingText = processInlineContent(komidashiMatch[1]);
        htmlBlocks.push(
          `<h4 data-source-line="${lineNo}">${headingText}</h4>`
        );
        continue;
      }

      // Check indent: ［＃N字下げ］...［＃N字下げ終わり］ (or ［＃字下げ終わり］)
      const indentMatch = rawLine.match(
        /^[\s]*［＃(\d+)字下げ］([\s\S]*?)［＃(?:\d+字下げ|字下げ)終わり］[\s]*$/
      );
      if (indentMatch) {
        const indentCount = parseInt(indentMatch[1], 10);
        const validIndent = isNaN(indentCount) || indentCount < 1 ? 1 : indentCount;
        const innerHtml = processInlineContent(indentMatch[2]);
        htmlBlocks.push(
          `<p class="aozora-indent" style="--aozora-indent: ${validIndent}em;" data-source-line="${lineNo}">${innerHtml || "<br>"}</p>`
        );
        continue;
      }

      // Check right align (地付き): ［＃地付き］...［＃地付き終わり］
      const chitsukiMatch = rawLine.match(
        /^[\s]*［＃地付き］([\s\S]*?)［＃地付き終わり］[\s]*$/
      );
      if (chitsukiMatch) {
        const innerHtml = processInlineContent(chitsukiMatch[1]);
        htmlBlocks.push(
          `<p class="aozora-align-right" data-source-line="${lineNo}">${innerHtml || "<br>"}</p>`
        );
        continue;
      }

      // Regular line (process inline annotations)
      const lineHtml = processInlineContent(rawLine);
      if (lineHtml.length === 0) {
        htmlBlocks.push(`<p data-source-line="${lineNo}"><br></p>`);
      } else {
        htmlBlocks.push(`<p data-source-line="${lineNo}">${lineHtml}</p>`);
      }
    }

    return htmlBlocks.join("\n");
  }
};
