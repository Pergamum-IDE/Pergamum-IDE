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
