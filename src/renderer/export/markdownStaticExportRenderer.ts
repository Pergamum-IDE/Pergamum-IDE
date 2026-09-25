import type { ExportImageAssetCopyItem } from "../../shared/api";
import type { ProjectLocalImageResolutionContext } from "../../shared/projectLocalImageLink";
import { collectProjectLocalImagesForMarkdown } from "../exportHtml";
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
import { loadKatexExportCss } from "./katexExportCss";

/**
 * #577 Slice 1: Reusable static Markdown export renderer.
 *
 * Converts Markdown text into a preview-compatible static HTML fragment with:
 * - Markdown-it rendering (html: false, linkify: true)
 * - Mermaid code blocks converted to static SVG
 * - GitHub Alert-style callouts
 * - highlight.js syntax highlighting
 * - KaTeX math rendering and conditional font-embedded CSS loading
 * - Rewritten project-local image URLs (context-aware: projectRoot or sourceFile)
 */

export interface RenderMarkdownStaticExportOptions {
  readonly markdown: string;

  /**
   * Image path resolution context.
   *
   * Glossary Description:
   *   { kind: "projectRoot" }
   *
   * Markdown document export in Slice 2:
   *   { kind: "sourceFile", sourceMarkdownProjectRelativePath: doc.filePath }
   */
  readonly imageResolutionContext: ProjectLocalImageResolutionContext;

  readonly imageAssetFolderName: string;
  readonly calloutLabels?: MarkdownCalloutLabels;
  readonly mermaidMessages: MermaidPreviewMessages;

  /**
   * Optional ID prefix for Mermaid static diagram elements.
   * Defaults to `"pergamum-glossary-export-mermaid"`.
   */
  readonly mermaidIdPrefix?: string;

  /**
   * Optional injection for tests (defaults to real `mermaid.render`).
   */
  readonly mermaidRender?: MermaidRenderFn;
}

export interface RenderedMarkdownStaticExport {
  /** Trusted rendered HTML fragment (markdown-it with html: false + Mermaid static SVGs). */
  readonly html: string;
  /** Image asset copy items to copy next to output file. */
  readonly imageAssets: readonly ExportImageAssetCopyItem[];
  /** Whether math (KaTeX) is present in the rendered HTML. */
  readonly usesMath: boolean;
  /**
   * Combined export CSS rules for callouts, code syntax highlighting, and KaTeX (when usesMath is true).
   */
  readonly exportCss: string;
  /** Loaded KaTeX CSS string with inlined fonts, or null if usesMath is false. */
  readonly katexCss: string | null;
}

export async function renderMarkdownStaticExport(
  options: RenderMarkdownStaticExportOptions
): Promise<RenderedMarkdownStaticExport> {
  const { modifiedMarkdownText, assets } = collectProjectLocalImagesForMarkdown(
    options.markdown,
    options.imageResolutionContext,
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
      options.mermaidIdPrefix ?? "pergamum-glossary-export-mermaid",
      options.mermaidMessages,
      options.mermaidRender
    );
    html = container.innerHTML;
  }

  const usesMath = html.includes('class="katex');
  const katexCss = usesMath ? await loadKatexExportCss() : null;

  const exportCss = [
    markdownCalloutExportCss,
    codeHighlightExportCss,
    usesMath && katexCss ? katexCss : ""
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html,
    imageAssets: assets,
    usesMath,
    exportCss,
    katexCss
  };
}
