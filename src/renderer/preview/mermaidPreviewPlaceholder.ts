/**
 * #564: Mermaid fenced code block detection + placeholder HTML generation
 * for Markdown horizontal preview.
 *
 * Pure, markdown-it-independent helpers. The actual `mermaid.render()` call
 * happens later, from the live preview DOM (see `markdownMermaidRendering.ts`)
 * — this module never touches the DOM or imports `mermaid` itself.
 *
 * Third-party license: mermaid is MIT licensed. See THIRD_PARTY_NOTICES.md
 * for the full license text.
 */

/** Escapes the five HTML-special characters in a plain text string. */
function escapeHtmlForMermaid(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const MERMAID_BLOCK_CLASS = "markdownMermaidBlock";
export const MERMAID_SOURCE_CLASS = "markdownMermaidSource";

/**
 * True when the fence info string identifies a Mermaid block. Only the
 * first whitespace-separated token is considered (matches how markdown-it
 * exposes `token.info`, and mirrors `codeHighlight.ts`'s own tokenization),
 * compared case-insensitively — ` ```Mermaid` / ` ```MERMAID` must be just
 * as recognizable as ` ```mermaid`, since a case mismatch silently falling
 * back to a plain code block would be hard for the author to notice. `mmd`
 * or any other alias is intentionally NOT treated as Mermaid (#564 scope).
 */
export function isMermaidFenceInfo(info: string): boolean {
  const firstToken = info.trim().split(/\s+/)[0] ?? "";
  return firstToken.toLowerCase() === "mermaid";
}

/**
 * Renders a Mermaid fence as a placeholder `<div>` — never raw Mermaid
 * source as unescaped HTML. The source is stored as escaped TEXT CONTENT
 * inside a non-rendered `hidden` `<pre>` child; because it goes through
 * ordinary HTML parsing (not a `<script>` raw-text region), entities decode
 * correctly and `.textContent` later returns the exact original source.
 * `<pre>` is already excluded from Glossary preview decoration
 * (`skippedDecorationAncestorTagNames`), so this placeholder is inert to it
 * for free.
 *
 * `dataSourceLine`, when provided, is placed on the container so existing
 * preview scroll-sync / jump-to-source (`[data-source-line]`, #503/#504)
 * keeps working for Mermaid blocks.
 */
export function renderMermaidPlaceholder(
  source: string,
  dataSourceLine?: string
): string {
  const sourceLineAttr =
    dataSourceLine != null
      ? ` data-source-line="${escapeHtmlForMermaid(dataSourceLine)}"`
      : "";

  return (
    `<div class="${MERMAID_BLOCK_CLASS}"${sourceLineAttr}>` +
    `<pre class="${MERMAID_SOURCE_CLASS}" hidden>${escapeHtmlForMermaid(source)}</pre>` +
    `</div>\n`
  );
}
