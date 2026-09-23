import type MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import noteIcon from "../../../assets/icons/feather/callout/alert-circle.svg?raw";
import tipIcon from "../../../assets/icons/codicons/callout/lightbulb.svg?raw";
import importantIcon from "../../../assets/icons/svgrepo/callout/info-message.svg?raw";
import warningIcon from "../../../assets/icons/feather/callout/alert-triangle.svg?raw";
import cautionIcon from "../../../assets/icons/feather/callout/alert-octagon.svg?raw";
import { defaultLanguage, t, type TranslationKey } from "../../shared/i18n";

/**
 * #568: GitHub Alert-style callouts (`> [!NOTE]` ...).
 *
 * One markdown-it plugin shared by every output path that renders Markdown
 * through markdown-it — the Markdown horizontal preview
 * (`markdownPreviewRenderer.ts`) and the Markdown HTML / PDF export parsers
 * (`exportHtml.ts`) — so all three produce the same HTML structure:
 *
 * ```html
 * <div class="markdown-callout markdown-callout-note" data-callout-type="note">
 *   <div class="markdown-callout-title">
 *     <span class="markdown-callout-icon" aria-hidden="true"><svg>…</svg></span>
 *     <span class="markdown-callout-label">補足</span>
 *   </div>
 *   <div class="markdown-callout-body">…</div>
 * </div>
 * ```
 *
 * Icons are the bundled SVG assets inlined as markup (`?raw`), so exported
 * HTML/PDF needs no asset copying or network access. The label is always
 * rendered as text next to the icon, so the callout stays meaningful with
 * the icon missing, without color, and in black-and-white print.
 */

export const markdownCalloutTypes = [
  "note",
  "tip",
  "important",
  "warning",
  "caution"
] as const;

export type MarkdownCalloutType = (typeof markdownCalloutTypes)[number];

export type MarkdownCalloutLabels = Readonly<Record<MarkdownCalloutType, string>>;

const calloutLabelKeys: Readonly<Record<MarkdownCalloutType, TranslationKey>> = {
  note: "callout.note",
  tip: "callout.tip",
  important: "callout.important",
  warning: "callout.warning",
  caution: "callout.caution"
};

/** Repository-relative icon asset path per type (the SVGs inlined below). */
export const markdownCalloutIconPaths: Readonly<Record<MarkdownCalloutType, string>> = {
  note: "assets/icons/feather/callout/alert-circle.svg",
  tip: "assets/icons/codicons/callout/lightbulb.svg",
  important: "assets/icons/svgrepo/callout/info-message.svg",
  warning: "assets/icons/feather/callout/alert-triangle.svg",
  caution: "assets/icons/feather/callout/alert-octagon.svg"
};

const calloutIconSvgs: Readonly<Record<MarkdownCalloutType, string>> = {
  note: noteIcon,
  tip: tipIcon,
  important: importantIcon,
  warning: warningIcon,
  caution: cautionIcon
};

export function markdownCalloutLabelsFor(
  translate: (key: TranslationKey) => string
): MarkdownCalloutLabels {
  return {
    note: translate(calloutLabelKeys.note),
    tip: translate(calloutLabelKeys.tip),
    important: translate(calloutLabelKeys.important),
    warning: translate(calloutLabelKeys.warning),
    caution: translate(calloutLabelKeys.caution)
  };
}

export const defaultMarkdownCalloutLabels: MarkdownCalloutLabels =
  markdownCalloutLabelsFor((key) => t(defaultLanguage, key));

const calloutMarkerPattern = /^\[!(note|tip|important|warning|caution)\]$/i;

/**
 * Recognizes a callout marker line (the first line of a blockquote, `>`
 * already stripped). The marker must be alone on its line; type matching is
 * case-insensitive. Unknown types (`[!MEMO]`) return `null`.
 */
export function parseMarkdownCalloutMarker(
  line: string
): MarkdownCalloutType | null {
  const match = calloutMarkerPattern.exec(line.trim());
  return match ? (match[1].toLowerCase() as MarkdownCalloutType) : null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * `extraAttrsHtml` is markdown-it's already-escaped `renderAttrs()` output
 * (e.g. the preview's ` data-source-line="3"`), or `""`.
 */
export function renderMarkdownCalloutOpen(
  type: MarkdownCalloutType,
  label: string,
  extraAttrsHtml = ""
): string {
  return (
    `<div class="markdown-callout markdown-callout-${type}" data-callout-type="${type}"${extraAttrsHtml}>\n` +
    `<div class="markdown-callout-title">` +
    `<span class="markdown-callout-icon" aria-hidden="true">${calloutIconSvgs[type]}</span>` +
    `<span class="markdown-callout-label">${escapeHtml(label)}</span>` +
    `</div>\n` +
    `<div class="markdown-callout-body">\n`
  );
}

export const markdownCalloutCloseHtml = "</div>\n</div>\n";

export interface MarkdownCalloutEnv {
  /** Localized labels; `defaultMarkdownCalloutLabels` (ja) when omitted. */
  readonly markdownCalloutLabels?: MarkdownCalloutLabels;
}

export interface MarkdownCalloutPluginOptions {
  /**
   * Per-render gate read from the markdown-it `env`. The preview instance is
   * shared by Markdown / Narou / Kakuyomu previews, so it enables callouts
   * for `previewRenderer === "markdown"` only. Always enabled when omitted.
   */
  readonly isEnabled?: (env: unknown) => boolean;
}

const CALLOUT_OPEN = "markdown_callout_open";
const CALLOUT_CLOSE = "markdown_callout_close";

function findMatchingBlockquoteClose(
  tokens: Token[],
  openIndex: number
): number {
  const level = tokens[openIndex].level;
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "blockquote_close" && token.level === level) {
      return index;
    }
  }
  return -1;
}

function labelsFromEnv(env: unknown): MarkdownCalloutLabels {
  return (
    (env as MarkdownCalloutEnv | undefined)?.markdownCalloutLabels ??
    defaultMarkdownCalloutLabels
  );
}

export function markdownItCallout(
  md: InstanceType<typeof MarkdownIt>,
  options: MarkdownCalloutPluginOptions = {}
): void {
  // Runs after block parsing but BEFORE inline parsing, so the marker line
  // is removed from the paragraph source and the rest of the body goes
  // through markdown-it's normal inline rendering (emphasis, code spans,
  // ruby transform, ...) unchanged.
  md.core.ruler.after("block", "markdown_callout", (state) => {
    if (options.isEnabled && !options.isEnabled(state.env)) {
      return;
    }

    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
      const open = tokens[index];
      if (open.type !== "blockquote_open") {
        continue;
      }

      const paragraphOpen = tokens[index + 1];
      const inline = tokens[index + 2];
      if (
        paragraphOpen?.type !== "paragraph_open" ||
        inline?.type !== "inline" ||
        tokens[index + 3]?.type !== "paragraph_close"
      ) {
        continue;
      }

      const newlineIndex = inline.content.indexOf("\n");
      const firstLine =
        newlineIndex === -1 ? inline.content : inline.content.slice(0, newlineIndex);
      const type = parseMarkdownCalloutMarker(firstLine);
      if (!type) {
        continue;
      }

      const closeIndex = findMatchingBlockquoteClose(tokens, index);
      if (closeIndex === -1) {
        continue;
      }

      open.type = CALLOUT_OPEN;
      open.tag = "div";
      open.meta = { calloutType: type };
      tokens[closeIndex].type = CALLOUT_CLOSE;
      tokens[closeIndex].tag = "div";

      const body = newlineIndex === -1 ? "" : inline.content.slice(newlineIndex + 1);
      if (body.trim().length === 0) {
        // Marker-only first paragraph: drop it entirely.
        tokens.splice(index + 1, 3);
      } else {
        inline.content = body;
        // The paragraph now starts one line later (keeps preview
        // `data-source-line` scroll-sync anchors accurate).
        for (const token of [paragraphOpen, inline]) {
          if (token.map) {
            token.map = [token.map[0] + 1, token.map[1]];
          }
        }
      }
    }
  });

  md.renderer.rules[CALLOUT_OPEN] = (tokens, idx, _options, env, self) => {
    const token = tokens[idx];
    const type = (token.meta as { calloutType: MarkdownCalloutType }).calloutType;
    return renderMarkdownCalloutOpen(
      type,
      labelsFromEnv(env)[type],
      self.renderAttrs(token)
    );
  };

  md.renderer.rules[CALLOUT_CLOSE] = () => markdownCalloutCloseHtml;
}

/**
 * Standalone callout CSS for exported HTML / PDF (the app preview's
 * equivalent lives in styles.css next to the other `.preview` rules).
 * Logical properties keep the accent on the inline-start edge, which also
 * does the right thing for vertical-rl PDF output. Colors only enhance:
 * the label text and a neutral border remain in black-and-white print.
 */
export const markdownCalloutExportCss = [
  `    .markdown-callout {`,
  `      --markdown-callout-accent: #0969da;`,
  `      --markdown-callout-background: #f1f7ff;`,
  `      margin-block: 0 1em;`,
  `      padding-block: 0.5em;`,
  `      padding-inline: 0.9em;`,
  `      border: 1px solid #b0b8c0;`,
  `      border-inline-start: 0.3em solid var(--markdown-callout-accent);`,
  `      border-radius: 4px;`,
  `      background-color: var(--markdown-callout-background);`,
  `      break-inside: avoid;`,
  `      page-break-inside: avoid;`,
  `      print-color-adjust: exact;`,
  `      -webkit-print-color-adjust: exact;`,
  `    }`,
  `    .markdown-callout-tip { --markdown-callout-accent: #1a7f37; --markdown-callout-background: #effaf1; }`,
  `    .markdown-callout-important { --markdown-callout-accent: #8250df; --markdown-callout-background: #f6f1ff; }`,
  `    .markdown-callout-warning { --markdown-callout-accent: #9a6700; --markdown-callout-background: #fff8e5; }`,
  `    .markdown-callout-caution { --markdown-callout-accent: #cf222e; --markdown-callout-background: #fff0f0; }`,
  `    .markdown-callout-title {`,
  `      display: flex;`,
  `      align-items: center;`,
  `      gap: 0.4em;`,
  `      margin-block-end: 0.3em;`,
  `      color: var(--markdown-callout-accent);`,
  `      font-weight: bold;`,
  `    }`,
  `    .markdown-callout-icon {`,
  `      display: inline-flex;`,
  `      flex: none;`,
  `    }`,
  `    .markdown-callout-icon svg {`,
  `      width: 1em;`,
  `      height: 1em;`,
  `    }`,
  `    .markdown-callout-body > :first-child {`,
  `      margin-block-start: 0;`,
  `    }`,
  `    .markdown-callout-body > :last-child {`,
  `      margin-block-end: 0;`,
  `    }`
].join("\n");
