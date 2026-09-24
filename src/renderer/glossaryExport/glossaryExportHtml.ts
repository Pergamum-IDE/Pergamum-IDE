import type { ExportImageAssetCopyItem } from "../../shared/api";
import {
  representativeGlossaryAtom,
  type GlossaryEntry
} from "../../shared/glossary";
import {
  collectProjectLocalImagesForMarkdown,
  escapeHtmlAttr,
  escapeHtmlText
} from "../exportHtml";
import { codeHighlightExportCss } from "../preview/codeHighlight";
import {
  markdownCalloutExportCss,
  type MarkdownCalloutLabels
} from "../preview/markdownCallout";
import {
  renderMermaidDiagramsToStaticHtml,
  type MermaidPreviewMessages,
  type MermaidRenderFn
} from "../preview/markdownMermaidRendering";
import { markdownPreviewRenderer } from "../preview/markdownPreviewRenderer";
import { MERMAID_BLOCK_CLASS } from "../preview/mermaidPreviewPlaceholder";
import type { GlossaryEntryOccurrenceCounts } from "./glossaryExportOccurrences";
import type { GlossaryExportContentOptions } from "./glossaryExportModel";

/**
 * #574 Slice 6: one glossary entry as a standalone HTML document.
 *
 * The Description is rendered by the Markdown PREVIEW pipeline
 * (`markdownPreviewRenderer`, "markdown" target) — not the #523 export
 * parser — so callouts, KaTeX math and highlight.js code blocks come out
 * exactly as the preview shows them. Mermaid placeholders are then rendered
 * to static SVG. Project images resolve against the project ROOT (the
 * glossary Description's virtual base) and are copied next to the HTML.
 */

export interface RenderedGlossaryDescription {
  /** Trusted renderer output (markdown-it with `html: false`). */
  readonly html: string;
  readonly imageAssets: readonly ExportImageAssetCopyItem[];
  /** KaTeX output present → the KaTeX stylesheet must be embedded. */
  readonly usesMath: boolean;
}

export interface RenderGlossaryDescriptionOptions {
  readonly imageAssetFolderName: string;
  readonly calloutLabels?: MarkdownCalloutLabels;
  readonly mermaidMessages: MermaidPreviewMessages;
  /** Injectable for tests (defaults to the real `mermaid.render`). */
  readonly mermaidRender?: MermaidRenderFn;
}

export async function renderGlossaryDescriptionForExport(
  description: string,
  options: RenderGlossaryDescriptionOptions
): Promise<RenderedGlossaryDescription> {
  const { modifiedMarkdownText, assets } = collectProjectLocalImagesForMarkdown(
    description,
    { kind: "projectRoot" },
    options.imageAssetFolderName
  );

  let html = markdownPreviewRenderer.render(modifiedMarkdownText, {
    previewRenderer: "markdown",
    // Links were already rewritten to the export asset folder above.
    projectLocalImageResolution: { kind: "none" },
    calloutLabels: options.calloutLabels
  });

  if (html.includes(MERMAID_BLOCK_CLASS)) {
    const container = document.createElement("div");

    container.innerHTML = html;
    await renderMermaidDiagramsToStaticHtml(
      container,
      "pergamum-glossary-export-mermaid",
      options.mermaidMessages,
      options.mermaidRender
    );
    html = container.innerHTML;
  }

  return {
    html,
    imageAssets: assets,
    usesMath: html.includes('class="katex')
  };
}

export interface GlossaryExportDocumentLabels {
  readonly infoHeading: string;
  readonly representative: string;
  readonly atoms: string;
  readonly tags: string;
  readonly noTags: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly occurrencesHeading: string;
  readonly atomColumn: string;
  readonly countColumn: string;
  readonly total: string;
  /** Already formatted with the counted document count. */
  readonly occurrenceScope: string;
  /** Already formatted; `null` when every document was read. */
  readonly occurrenceSkipped: string | null;
  readonly descriptionHeading: string;
  readonly emptyDescription: string;
}

export interface BuildGlossaryEntryExportHtmlInput {
  readonly entry: GlossaryEntry;
  readonly content: GlossaryExportContentOptions;
  readonly occurrences: GlossaryEntryOccurrenceCounts | null;
  readonly description: RenderedGlossaryDescription | null;
  readonly labels: GlossaryExportDocumentLabels;
  readonly lang: string;
  /** KaTeX stylesheet (fonts inlined); embedded only when math is used. */
  readonly katexCss: string | null;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function formatDate(iso: string): string {
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

function tagChipHtml(tag: GlossaryEntry["tags"][number]): string {
  const style =
    HEX_COLOR.test(tag.backgroundRgb) && HEX_COLOR.test(tag.foregroundRgb)
      ? ` style="background-color: ${tag.backgroundRgb}; color: ${tag.foregroundRgb};"`
      : "";

  return `<span class="glossary-export__tag"${style}>${escapeHtmlText(tag.label)}</span>`;
}

function infoSectionHtml(
  entry: GlossaryEntry,
  labels: GlossaryExportDocumentLabels
): string {
  const representative = representativeGlossaryAtom(entry)?.value ?? "";
  const atomValues = [...entry.atoms]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((atom) => atom.value)
    .filter((value) => value.trim().length > 0);
  const tagsHtml =
    entry.tags.length > 0
      ? entry.tags.map(tagChipHtml).join(" ")
      : `<span class="glossary-export__muted">${escapeHtmlText(labels.noTags)}</span>`;

  const rows: Array<[string, string]> = [
    [labels.representative, escapeHtmlText(representative)],
    [
      labels.atoms,
      atomValues.map((value) => `<span class="glossary-export__atom">${escapeHtmlText(value)}</span>`).join(" ")
    ],
    [labels.tags, tagsHtml],
    [labels.createdAt, escapeHtmlText(formatDate(entry.createdAt))],
    [labels.updatedAt, escapeHtmlText(formatDate(entry.updatedAt))]
  ];

  return [
    `<section class="glossary-export__info">`,
    `<h2>${escapeHtmlText(labels.infoHeading)}</h2>`,
    `<dl>`,
    ...rows.map(
      ([term, valueHtml]) =>
        `<dt>${escapeHtmlText(term)}</dt><dd>${valueHtml}</dd>`
    ),
    `</dl>`,
    `</section>`
  ].join("\n");
}

function occurrencesSectionHtml(
  occurrences: GlossaryEntryOccurrenceCounts,
  labels: GlossaryExportDocumentLabels
): string {
  return [
    `<section class="glossary-export__occurrences">`,
    `<h2>${escapeHtmlText(labels.occurrencesHeading)}</h2>`,
    `<table>`,
    `<thead><tr><th scope="col">${escapeHtmlText(labels.atomColumn)}</th><th scope="col" class="glossary-export__count">${escapeHtmlText(labels.countColumn)}</th></tr></thead>`,
    `<tbody>`,
    ...occurrences.atoms.map(
      (atom) =>
        `<tr><td>${escapeHtmlText(atom.value)}</td><td class="glossary-export__count">${atom.count}</td></tr>`
    ),
    `</tbody>`,
    `<tfoot><tr><th scope="row">${escapeHtmlText(labels.total)}</th><td class="glossary-export__count">${occurrences.total}</td></tr></tfoot>`,
    `</table>`,
    `<p class="glossary-export__muted">${escapeHtmlText(labels.occurrenceScope)}</p>`,
    labels.occurrenceSkipped
      ? `<p class="glossary-export__muted">${escapeHtmlText(labels.occurrenceSkipped)}</p>`
      : "",
    `</section>`
  ]
    .filter(Boolean)
    .join("\n");
}

function descriptionSectionHtml(
  description: RenderedGlossaryDescription,
  labels: GlossaryExportDocumentLabels
): string {
  const body =
    description.html.trim().length > 0
      ? description.html
      : `<p class="glossary-export__muted">${escapeHtmlText(labels.emptyDescription)}</p>`;

  return [
    `<section class="glossary-export__description">`,
    `<h2>${escapeHtmlText(labels.descriptionHeading)}</h2>`,
    `<div class="glossary-export__markdown">`,
    body,
    `</div>`,
    `</section>`
  ].join("\n");
}

const baseCss = [
  `body {`,
  `  margin: 0;`,
  `  padding: 24px;`,
  `  font-family: system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Noto Sans CJK JP", sans-serif;`,
  `  line-height: 1.7;`,
  `  color: #1f2328;`,
  `  background: #ffffff;`,
  `}`,
  `.glossary-export {`,
  `  max-inline-size: 960px;`,
  `  margin-inline: auto;`,
  `}`,
  `.glossary-export h1 {`,
  `  margin-block: 0 16px;`,
  `  font-size: 1.8em;`,
  `}`,
  `.glossary-export h2 {`,
  `  margin-block: 32px 12px;`,
  `  padding-block-end: 4px;`,
  `  border-block-end: 1px solid #d0d7de;`,
  `  font-size: 1.3em;`,
  `}`,
  `.glossary-export__info dl {`,
  `  display: grid;`,
  `  grid-template-columns: max-content 1fr;`,
  `  gap: 6px 16px;`,
  `  margin: 0;`,
  `}`,
  `.glossary-export__info dt {`,
  `  font-weight: 600;`,
  `}`,
  `.glossary-export__info dd {`,
  `  margin: 0;`,
  `}`,
  `.glossary-export__atom,`,
  `.glossary-export__tag {`,
  `  display: inline-block;`,
  `  margin-inline-end: 4px;`,
  `  padding: 0 8px;`,
  `  border: 1px solid #d0d7de;`,
  `  border-radius: 999px;`,
  `  font-size: 0.9em;`,
  `}`,
  `.glossary-export__muted {`,
  `  color: #656d76;`,
  `  font-size: 0.9em;`,
  `}`,
  `.glossary-export table {`,
  `  border-collapse: collapse;`,
  `}`,
  `.glossary-export th,`,
  `.glossary-export td {`,
  `  padding: 4px 12px;`,
  `  border: 1px solid #d0d7de;`,
  `  text-align: start;`,
  `}`,
  `.glossary-export .glossary-export__count {`,
  `  text-align: end;`,
  `  font-variant-numeric: tabular-nums;`,
  `}`,
  `.glossary-export__markdown img {`,
  `  max-inline-size: 100%;`,
  `  height: auto;`,
  `}`,
  `.glossary-export__markdown blockquote {`,
  `  margin-inline: 0;`,
  `  padding-inline-start: 12px;`,
  `  border-inline-start: 4px solid #d0d7de;`,
  `  color: #656d76;`,
  `}`,
  `.glossary-export__markdown code {`,
  `  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;`,
  `}`,
  `.emphasis-mark {`,
  `  text-emphasis-style: sesame;`,
  `  -webkit-text-emphasis-style: sesame;`,
  `}`,
  `.markdownMermaidBlock {`,
  `  display: block;`,
  `  margin: 12px 0;`,
  `}`,
  `.markdownMermaidDiagram {`,
  `  display: flex;`,
  `  justify-content: center;`,
  `  overflow-x: auto;`,
  `}`,
  `.markdownMermaidDiagram svg {`,
  `  max-inline-size: 100%;`,
  `  height: auto;`,
  `}`,
  `.markdownMermaidEmpty,`,
  `.markdownMermaidError {`,
  `  padding: 8px 12px;`,
  `  border: 1px solid #8a4c0f;`,
  `  border-radius: 4px;`,
  `}`,
  `.markdownMermaidErrorReason,`,
  `.markdownMermaidErrorSource {`,
  `  white-space: pre-wrap;`,
  `  word-break: break-word;`,
  `}`
].join("\n");

export function buildGlossaryEntryExportHtml(
  input: BuildGlossaryEntryExportHtmlInput
): string {
  const title = representativeGlossaryAtom(input.entry)?.value ?? input.entry.id;
  const sections: string[] = [];

  if (input.content.includeGlossaryInfo) {
    sections.push(infoSectionHtml(input.entry, input.labels));
  }
  if (input.content.includeOccurrenceCounts && input.occurrences) {
    sections.push(occurrencesSectionHtml(input.occurrences, input.labels));
  }
  if (input.content.includeDescription && input.description) {
    sections.push(descriptionSectionHtml(input.description, input.labels));
  }

  const styles = [
    baseCss,
    markdownCalloutExportCss,
    codeHighlightExportCss,
    input.description?.usesMath && input.katexCss ? input.katexCss : ""
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `<!doctype html>`,
    `<html lang="${escapeHtmlAttr(input.lang)}">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<meta name="generator" content="Pergamum">`,
    `<title>${escapeHtmlText(title)}</title>`,
    `<style>`,
    styles,
    `</style>`,
    `</head>`,
    `<body>`,
    `<article class="glossary-export">`,
    `<header>`,
    `<h1>${escapeHtmlText(title)}</h1>`,
    `</header>`,
    ...sections,
    `</article>`,
    `</body>`,
    `</html>`,
    ``
  ].join("\n");
}
