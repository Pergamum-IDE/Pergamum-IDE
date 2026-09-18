import MarkdownIt from "markdown-it";
import type { PreviewRenderer } from "./previewRenderer";
import {
  resolveProjectLocalImageSrc,
  type ProjectLocalImageResolutionContext
} from "../../shared/projectLocalImageLink";

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

/**
 * Parses Aozora / Narou-style ruby notation in a plain text string.
 * Supports explicit ruby base markers (｜親文字《ルビ》 / |親文字《ルビ》)
 * and implicit ruby base (contiguous Kanji run immediately preceding 《ルビ》).
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
      content: `<ruby>${escapeHtml(baseText)}<rt>${escapeHtml(rubyText)}</rt></ruby>`
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
 * #507: Post-inline core ruler transform for Aozora / Narou-style ruby.
 * Walks inline token children after inline parsing and transforms text tokens
 * containing ruby notation into (text + html_inline) token sequences before HTML rendering.
 */
markdown.core.ruler.push("aozora_ruby_transform", (state) => {
  const Token = state.Token;
  for (const blockToken of state.tokens) {
    if (blockToken.type !== "inline" || !blockToken.children) {
      continue;
    }

    const newChildren: typeof blockToken.children = [];
    for (const child of blockToken.children) {
      if (child.type !== "text" || !child.content.includes("《")) {
        newChildren.push(child);
        continue;
      }

      const chunks = parseRubyInText(child.content);
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
  render: (content, options) =>
    markdown.render(content, {
      projectLocalImageResolution:
        options?.projectLocalImageResolution ?? NO_IMAGE_RESOLUTION
    })
};
