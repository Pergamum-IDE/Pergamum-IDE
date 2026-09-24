/**
 * #536: Fenced code block syntax highlighter for Markdown Preview.
 *
 * Uses highlight.js for known languages.
 * Falls back to HTML-escaped plaintext for unknown or missing languages.
 * Does NOT use automatic language detection (`highlightAuto`).
 *
 * Third-party license: highlight.js is BSD 3-Clause licensed.
 * See THIRD_PARTY_NOTICES.md for the full license text.
 */

import hljs from "highlight.js";

/**
 * #574 Slice 6: the Markdown Preview's highlight.js theme (GitHub light, see
 * the `.preview .hljs*` rules in styles.css) without the `.preview` scope, for
 * standalone exported HTML. Keep in sync with styles.css.
 */
export const codeHighlightExportCss = [
  "pre code.hljs {",
  "  display: block;",
  "  overflow-x: auto;",
  "  padding: 1em;",
  "  background: #ffffff;",
  "  color: #24292e;",
  "  border-radius: 4px;",
  "}",
  "",
  ".hljs-doctag,",
  ".hljs-keyword,",
  ".hljs-meta .hljs-keyword,",
  ".hljs-template-tag,",
  ".hljs-template-variable,",
  ".hljs-type,",
  ".hljs-variable.language_ {",
  "  color: #d73a49;",
  "}",
  "",
  ".hljs-title,",
  ".hljs-title.class_,",
  ".hljs-title.class_.inherited__,",
  ".hljs-title.function_ {",
  "  color: #6f42c1;",
  "}",
  "",
  ".hljs-attr,",
  ".hljs-attribute,",
  ".hljs-literal,",
  ".hljs-meta,",
  ".hljs-number,",
  ".hljs-operator,",
  ".hljs-variable,",
  ".hljs-selector-attr,",
  ".hljs-selector-class,",
  ".hljs-selector-id {",
  "  color: #005cc5;",
  "}",
  "",
  ".hljs-regexp,",
  ".hljs-string,",
  ".hljs-meta .hljs-string {",
  "  color: #032f62;",
  "}",
  "",
  ".hljs-built_in,",
  ".hljs-symbol {",
  "  color: #e36209;",
  "}",
  "",
  ".hljs-comment,",
  ".hljs-code,",
  ".hljs-formula {",
  "  color: #6a737d;",
  "}",
  "",
  ".hljs-name,",
  ".hljs-quote,",
  ".hljs-selector-tag,",
  ".hljs-selector-pseudo {",
  "  color: #22863a;",
  "}",
  "",
  ".hljs-subst {",
  "  color: #24292e;",
  "}",
  "",
  ".hljs-section {",
  "  color: #005cc5;",
  "  font-weight: bold;",
  "}",
  "",
  ".hljs-bullet {",
  "  color: #735c0f;",
  "}",
  "",
  ".hljs-emphasis {",
  "  color: #24292e;",
  "  font-style: italic;",
  "}",
  "",
  ".hljs-strong {",
  "  color: #24292e;",
  "  font-weight: bold;",
  "}",
  "",
  ".hljs-addition {",
  "  color: #22863a;",
  "  background-color: #f0fff4;",
  "}",
  "",
  ".hljs-deletion {",
  "  color: #b31d28;",
  "  background-color: #ffeef0;",
  "}"
].join("\n");

/**
 * Escapes the five HTML-special characters in a plain text string.
 * Used for the plaintext fallback path where hljs is not called.
 */
function escapeHtmlForCode(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders a fenced code block as an HTML `<pre><code>` fragment.
 *
 * - `info`: the raw info string from the fence (e.g. `"typescript"`, `"js filename.ts"`, `""`).
 * - `code`: the raw code text (not yet HTML-escaped).
 * - `dataSourceLine`: optional value for the `data-source-line` attribute on the `<code>` element.
 *   When provided, the attribute is emitted on the `<code>` tag (matching the markdown-it
 *   default fence renderer's placement) so that preview scroll-sync and jump-to-source
 *   features (#503 / #504) continue to function correctly.
 *
 * Behaviour:
 * - Only the first whitespace-separated token of `info` is used as the
 *   language candidate (matches how markdown-it exposes `token.info`).
 * - If the language is known to highlight.js, `hljs.highlight()` is called
 *   with `ignoreIllegals: true`; its output is used verbatim (already escaped).
 * - If the language is unknown or absent, the code is HTML-escaped and
 *   wrapped in a plain `<pre><code>` block.
 * - `highlightAuto` is never called.
 *
 * Returns a self-contained `<pre><code>…</code></pre>` HTML string.
 */
export function renderHighlightedCodeBlock(
  info: string,
  code: string,
  dataSourceLine?: string
): string {
  const lang = info.trim().split(/\s+/)[0] ?? "";
  // Emit data-source-line on the <code> element to match the markdown-it default
  // fence renderer's placement (#503 source_line_anchors / #504 jump-to-source).
  const sourceLineAttr = dataSourceLine != null
    ? ` data-source-line="${escapeHtmlForCode(dataSourceLine)}"`
    : "";

  if (lang !== "" && hljs.getLanguage(lang)) {
    const highlighted = hljs.highlight(code, {
      language: lang,
      ignoreIllegals: true
    });
    // highlighted.value is already HTML-escaped by highlight.js; do not re-escape.
    return `<pre><code class="hljs language-${escapeHtmlForCode(lang)}"${sourceLineAttr}>${highlighted.value}</code></pre>\n`;
  }

  // Plaintext fallback: escape then wrap.
  const langClass = lang !== "" ? ` class="language-${escapeHtmlForCode(lang)}"` : "";
  return `<pre><code${langClass}${sourceLineAttr}>${escapeHtmlForCode(code)}</code></pre>\n`;
}
