import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// #701: Pergamum-owned Markdown syntax highlight.
//
// Replaces CodeMirror's `defaultHighlightStyle`, whose literal colors are
// tuned for a white background and became unreadable on dark themes
// (e.g. `#219` URLs at 1.28:1 and `#404740` marks at 1.75:1 on Night Dark).
//
// Colors come from semantic `--pg-color-editor-syntax-*` tokens defined per
// application theme in styles.css, so a theme switch needs no reconfiguration.
// Body text (headings, strong, emphasis, link text, quotes, lists, inline
// code) stays uncolored; only typography is applied to it.
export const markdownSyntaxColorTokens = [
  "--pg-color-editor-syntax-marker",
  "--pg-color-editor-syntax-link",
  "--pg-color-editor-syntax-string",
  "--pg-color-editor-syntax-escape",
  "--pg-color-editor-syntax-tag",
  "--pg-color-editor-syntax-comment"
] as const;

const color = (token: (typeof markdownSyntaxColorTokens)[number]): string => `var(${token})`;

export const markdownSyntaxHighlightStyle = HighlightStyle.define([
  // Typography only (same as the previous default style).
  { tag: tags.heading, textDecoration: "underline", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline" },
  // Markup marks (`#`, `*`, `>`, list markers, fences, ...).
  { tag: [tags.processingInstruction, tags.meta], color: color("--pg-color-editor-syntax-marker") },
  // URL, link label / reference label, fenced-code info string, horizontal rule.
  {
    tag: [tags.url, tags.labelName, tags.contentSeparator],
    color: color("--pg-color-editor-syntax-link")
  },
  { tag: tags.string, color: color("--pg-color-editor-syntax-string") },
  { tag: [tags.escape, tags.character], color: color("--pg-color-editor-syntax-escape") },
  // Inline HTML tag names.
  { tag: [tags.tagName, tags.typeName], color: color("--pg-color-editor-syntax-tag") },
  { tag: tags.comment, color: color("--pg-color-editor-syntax-comment") },
  { tag: tags.invalid, color: "var(--pg-color-editor-diagnostic-error)" }
]);
