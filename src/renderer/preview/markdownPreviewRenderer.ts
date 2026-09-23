import MarkdownIt from "markdown-it";
import markdownItKatex from "@vscode/markdown-it-katex";
import type { PreviewRenderer } from "./previewRenderer";
import {
  resolveProjectLocalImageSrc,
  type ProjectLocalImageResolutionContext
} from "../../shared/projectLocalImageLink";
import {
  isKakuyomuPreviewRenderer,
  isNarouPreviewRenderer,
  type PreviewRendererId
} from "../../shared/settings";
import { renderHighlightedCodeBlock } from "./codeHighlight";
import {
  isMermaidFenceInfo,
  renderMermaidPlaceholder
} from "./mermaidPreviewPlaceholder";

const markdown = new MarkdownIt({
  html: false,
  linkify: true
});

/**
 * #503: inject 1-based source line numbers (`data-source-line`) onto block-level
 * opening tags so preview scroll synchronization can use anchor-based mapping.
 */
markdown.core.ruler.push("source_line_anchors", (state) => {
  for (const token of state.tokens) {
    if (token.map && token.nesting >= 0) {
      token.attrSet("data-source-line", String(token.map[0] + 1));
    }
  }
});

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

function isNarouRubyReading(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB\s]+$/u.test(text);
}

/**
 * Parses Aozora / Narou / Kakuyomu-style ruby notation in a plain text string.
 * Supports explicit ruby base markers (｜親文字《ルビ》 / |親文字《ルビ》)
 * and implicit ruby base (contiguous Kanji run immediately preceding 《ルビ》).
 * Supports Kakuyomu emphasis notation (《《...》》) when Kakuyomu/Narou renderer family is active.
 * Supports Narou shorthand ruby (漢字（かんじ） / 漢字(かんじ)) and escape markers (|（ / ｜（ / |( / ｜() when Narou renderer is active.
 */
function parseRubyInText(
  text: string,
  previewRenderer?: PreviewRendererId
): RubyTextChunk[] {
  const result: RubyTextChunk[] = [];
  let pos = 0;
  const max = text.length;

  const isKakuyomu = isKakuyomuPreviewRenderer(previewRenderer);
  const isNarou = isNarouPreviewRenderer(previewRenderer);
  // Default/unspecified or Kakuyomu/Narou renderer allows Kakuyomu emphasis 《《...》》
  const allowKakuyomuEmphasis = isKakuyomu || isNarou || !previewRenderer;

  while (pos < max) {
    const openExplicit = text.indexOf("《", pos);
    let openParen = -1;

    if (isNarou) {
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
      break;
    }

    if (nextTokenType === "explicit") {
      const openIndex = nextTokenIndex;

      // Check 0: Kakuyomu emphasis notation 《《...》》
      if (allowKakuyomuEmphasis && text.startsWith("《《", openIndex)) {
        const closeDouble = text.indexOf("》》", openIndex + 2);
        if (closeDouble > openIndex + 2) {
          const emphasisContent = text.slice(openIndex + 2, closeDouble);
          if (
            emphasisContent.length > 0 &&
            !/[\r\n《》｜|]/.test(emphasisContent)
          ) {
            if (openIndex > pos) {
              result.push({
                type: "text",
                content: text.slice(pos, openIndex)
              });
            }
            result.push({
              type: "html_inline",
              content: `<span class="emphasis-mark">${escapeHtml(emphasisContent)}</span>`
            });
            pos = closeDouble + 2;
            continue;
          }
        }
      }

      const closeIndex = text.indexOf("》", openIndex + 1);
      if (closeIndex === -1) {
        pos = openIndex + 1;
        continue;
      }

      const rubyText = text.slice(openIndex + 1, closeIndex);
      if (rubyText.length === 0 || /[\r\n《》｜|]/.test(rubyText)) {
        result.push({
          type: "text",
          content: text.slice(pos, openIndex + 1)
        });
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
        content: `<ruby>${escapeHtml(baseText)}<rt>${escapeHtml(rubyText)}</rt></ruby>`
      });

      pos = closeIndex + 1;
      continue;
    }

    if (nextTokenType === "paren") {
      const openParenIndex = nextTokenIndex;
      const parenChar = text[openParenIndex];
      const closeParenChar = parenChar === "（" ? "）" : ")";

      // Check escape marker: |（, ｜（, |(, ｜(
      if (
        openParenIndex > pos &&
        (text[openParenIndex - 1] === "|" || text[openParenIndex - 1] === "｜")
      ) {
        if (openParenIndex - 1 > pos) {
          result.push({
            type: "text",
            content: text.slice(pos, openParenIndex - 1)
          });
        }
        result.push({
          type: "text",
          content: parenChar
        });
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

          if (kanjiStart < openParenIndex) {
            if (kanjiStart > pos) {
              result.push({
                type: "text",
                content: text.slice(pos, kanjiStart)
              });
            }

            const baseText = text.slice(kanjiStart, openParenIndex);
            result.push({
              type: "html_inline",
              content: `<ruby>${escapeHtml(baseText)}<rt>${escapeHtml(rubyCandidate)}</rt></ruby>`
            });

            pos = closeParenIndex + 1;
            continue;
          }
        }
      }

      result.push({
        type: "text",
        content: text.slice(pos, openParenIndex + 1)
      });
      pos = openParenIndex + 1;
      continue;
    }
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
 * #507: Post-inline core ruler transform for Aozora / Narou-style ruby.
 * Walks inline token children after inline parsing and transforms text tokens
 * containing ruby notation into (text + html_inline) token sequences before HTML rendering.
 */
markdown.core.ruler.push("aozora_ruby_transform", (state) => {
  const Token = state.Token;
  const env = state.env as { previewRenderer?: PreviewRendererId } | undefined;
  const previewRenderer = env?.previewRenderer;
  const isNarou = isNarouPreviewRenderer(previewRenderer);

  for (const blockToken of state.tokens) {
    if (blockToken.type !== "inline" || !blockToken.children) {
      continue;
    }

    const newChildren: typeof blockToken.children = [];
    for (const child of blockToken.children) {
      const hasRubyTrigger =
        child.content.includes("《") ||
        (isNarou &&
          (child.content.includes("（") || child.content.includes("(")));
      if (child.type !== "text" || !hasRubyTrigger) {
        newChildren.push(child);
        continue;
      }

      const chunks = parseRubyInText(child.content, previewRenderer);
      for (const chunk of chunks) {
        if (chunk.type === "text") {
          const t = new Token("text", "", 0);
          t.content = chunk.content;
          newChildren.push(t);
        } else {
          const t = new Token("html_inline", "", 0);
          t.content = chunk.content;
          newChildren.push(t);
        }
      }
    }
    blockToken.children = newChildren;
  }
});

const NO_IMAGE_RESOLUTION: ProjectLocalImageResolutionContext = { kind: "none" };

/**
 * #536: Syntax-highlight fenced code blocks in Markdown Preview.
 * Delegates to the shared `renderHighlightedCodeBlock` helper which uses
 * highlight.js for known languages and falls back to escaped plaintext for
 * unknown or missing languages.  `highlightAuto` is never called.
 *
 * `data-source-line` is forwarded from the token attrs (set by
 * `source_line_anchors`, #503) so that preview scroll-sync and
 * jump-to-source (#504) continue to function correctly.
 *
 * #564: a `mermaid` fence (exact first-token match — `mmd` and other
 * aliases are NOT Mermaid) becomes a Mermaid placeholder INSTEAD, but only
 * when this render call is for the "markdown" (horizontal) preview target
 * — `env.previewRenderer` is checked explicitly. `markdownPreviewRenderer`
 * is the SAME markdown-it instance shared by Narou / Kakuyomu horizontal
 * AND vertical previews (only Aozora has its own separate pipeline), so
 * this exact-match guard is what keeps Mermaid rendering scoped to Markdown
 * horizontal preview only, per #564's scope. A `mermaid` fence never
 * reaches `renderHighlightedCodeBlock` / highlight.js.
 */
markdown.renderer.rules.fence = (tokens, idx, _options, env) => {
  const token = tokens[idx];
  const rawSourceLine = token.attrGet("data-source-line");
  const sourceLine = rawSourceLine != null ? String(rawSourceLine) : undefined;

  const previewRenderer = (env as { previewRenderer?: PreviewRendererId } | undefined)
    ?.previewRenderer;

  if (previewRenderer === "markdown" && isMermaidFenceInfo(token.info)) {
    return renderMermaidPlaceholder(token.content, sourceLine);
  }

  return renderHighlightedCodeBlock(token.info, token.content, sourceLine);
};

/**
 * #566: KaTeX math rendering — inline `$...$` and display `$$...$$` — for
 * Markdown horizontal preview only.
 *
 * `@vscode/markdown-it-katex` is installed unconditionally on this SAME
 * shared markdown-it instance (it never touches `md.renderer.rules.fence`
 * unless its `enableFencedBlocks` option is passed, which it is not here, so
 * it cannot interact with #536's highlight.js path or #564's Mermaid
 * placeholders). What actually scopes math to Markdown horizontal preview
 * is `markdownPreviewRenderer.render` below, which enables/disables the
 * plugin's parser rules (`math_inline` / `math_inline_block` / `math_block`)
 * by name on every call based on `previewRenderer === "markdown"` —
 * `.use()` itself has no per-call env awareness, so toggling via
 * markdown-it's own `enable`/`disable` API immediately before each
 * synchronous `markdown.render()` call is the only reliable way to scope a
 * plugin registered on a shared instance to one render target (same
 * constraint #564 solved for the Mermaid fence rule, by contrast, purely
 * inside the rule function itself since that one was custom-written here).
 *
 * `throwOnError: false` (per #566) means invalid math renders as KaTeX's
 * own safe, already-escaped inline error span instead of throwing — no
 * separate Pergamum error-card UI is needed (unlike #564's Mermaid, whose
 * `mermaid.render()` is async and DOM-external, `katex.renderToString` is
 * synchronous and fully self-contained within this one render() call).
 *
 * Third-party license: KaTeX and @vscode/markdown-it-katex are both MIT
 * licensed. See THIRD_PARTY_NOTICES.md for the full license text.
 */
const MATH_RULE_NAMES = ["math_inline", "math_inline_block", "math_block"] as const;

markdown.use(markdownItKatex, { throwOnError: false });

/**
 * #566: the plugin's own `math_block` renderer builds its HTML directly
 * from `tokens[idx].content`, bypassing markdown-it's normal
 * attribute-rendering path — so the `data-source-line` `source_line_anchors`
 * (#503) already set ON THE TOKEN never reaches the output HTML. Wrapping
 * the plugin's (already-safe) output in a `data-source-line` container —
 * rather than parsing/rewriting its inner markup — keeps preview scroll-sync
 * / jump-to-source (#504) working for display math without depending on the
 * plugin's exact HTML shape.
 */
const katexBlockRenderer = markdown.renderer.rules.math_block;
if (katexBlockRenderer) {
  markdown.renderer.rules.math_block = (tokens, idx, options, env, self) => {
    const html = katexBlockRenderer(tokens, idx, options, env, self);
    const sourceLine = tokens[idx].attrGet("data-source-line");
    return sourceLine != null
      ? `<div data-source-line="${escapeHtml(String(sourceLine))}">${html}</div>`
      : html;
  };
}

/**
 * #409 / #412: rewrite project-local image `src` to `pergamum-asset://` so the
 * Preview can display images that live in the project (e.g. the ones #407's
 * clipboard paste saves). Both the Markdown document Preview and the Glossary
 * vocabulary Preview go through this one path — the only difference is the
 * `ProjectLocalImageResolutionContext` the caller passes via `env`
 * (`sourceFile` → resolve against the document's folder; `projectRoot` →
 * resolve against the project root; `none` → no rewrite). External URLs /
 * data: / blob: links are always untouched. The main-process protocol
 * handler re-validates every request.
 */
const renderImageToken =
  markdown.renderer.rules.image ??
  ((tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options));

function imageResolutionContextFromEnv(
  env: unknown
): ProjectLocalImageResolutionContext {
  const candidate = (
    env as { projectLocalImageResolution?: ProjectLocalImageResolutionContext }
  )?.projectLocalImageResolution;
  if (
    candidate &&
    (candidate.kind === "none" ||
      candidate.kind === "projectRoot" ||
      (candidate.kind === "sourceFile" &&
        typeof candidate.sourceMarkdownProjectRelativePath === "string"))
  ) {
    return candidate;
  }
  return NO_IMAGE_RESOLUTION;
}

markdown.renderer.rules.image = (tokens, idx, options, env, self) => {
  const context = imageResolutionContextFromEnv(env);

  if (context.kind !== "none") {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs) {
      // markdown-it has already run its link normalization on the `src`
      // (`\` -> `%5C`, spaces -> `%20`, ...). Decode it back so the resolver
      // sees the same shape the author wrote and its backslash / `..` /
      // control-character guards still fire.
      const rawSrc = String(token.attrs[srcIndex][1]);
      let authoredSrc = rawSrc;
      try {
        authoredSrc = decodeURI(rawSrc);
      } catch {
        // Malformed percent-encoding: fall back to the raw value; the shape
        // validator + the main-process handler still gate it.
      }
      const resolution = resolveProjectLocalImageSrc(authoredSrc, context);
      if (resolution.kind === "rewrite") {
        token.attrs[srcIndex][1] = resolution.url;
      } else if (resolution.kind === "blocked") {
        // Neutralize: an empty data URL never hits the network and is
        // CSP-clean (`data:` is already allowed by `img-src`).
        token.attrs[srcIndex][1] = "data:,";
      }
    }
  }

  return renderImageToken(tokens, idx, options, env, self);
};

export const markdownPreviewRenderer: PreviewRenderer = {
  render: (content, options) => {
    const previewRenderer = options?.previewRenderer;

    // #566: toggle KaTeX's parser rules on this SHARED markdown-it instance
    // immediately before the synchronous render call below — see the block
    // comment above `markdown.use(markdownItKatex, ...)` for why this
    // enable/disable toggle (rather than a check inside the rule itself, as
    // #564's custom Mermaid fence rule does) is what scopes math to
    // Markdown horizontal preview only. Every caller of `render()` goes
    // through this one function, and JS is single-threaded with no `await`
    // inside `markdown.render()`, so this toggle-then-render is race-free.
    if (previewRenderer === "markdown") {
      markdown.enable([...MATH_RULE_NAMES]);
    } else {
      markdown.disable([...MATH_RULE_NAMES]);
    }

    return markdown.render(content, {
      projectLocalImageResolution:
        options?.projectLocalImageResolution ?? NO_IMAGE_RESOLUTION,
      previewRenderer
    });
  }
};
