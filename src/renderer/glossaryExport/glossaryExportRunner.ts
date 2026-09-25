import type {
  ExportHtmlCombinedRequest,
  ExportHtmlCombinedResult,
  ExportImageAssetCopyItem,
  ExportPdfCombinedRequest,
  ExportPdfCombinedResult
} from "../../shared/api";
import { buildFontFamilyCss, type FontFamilySetting } from "../../shared/fontSettings";
import type { GlossaryEntry, GlossaryEntryId } from "../../shared/glossary";
import {
  DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
  type PdfPageNumberSettings
} from "../../shared/pdfPageNumbering";
import {
  buildCombinedGlossaryExportHtml,
  buildGlossaryEntryExportHtml,
  type CombinedGlossaryEntrySectionInput,
  type GlossaryExportDocumentLabels,
  type RenderedGlossaryDescription
} from "./glossaryExportHtml";
import {
  defaultGlossaryExportContentOptions,
  type GlossaryExportContentOptions,
  type GlossaryExportPlan
} from "./glossaryExportModel";
import type { GlossaryEntryOccurrenceCounts } from "./glossaryExportOccurrences";

/**
 * #574 Slice 6: run one planned glossary export — load the entry's SAVED
 * state, count its occurrences, render its Description, assemble the HTML and
 * write it (plus copied images) through the existing #523 HTML export IPC.
 * Every I/O step is injected; nothing here logs entry content.
 */

export interface GlossaryExportRunDeps {
  readonly getEntry: (entryId: GlossaryEntryId) => Promise<GlossaryEntry | null>;
  readonly countOccurrences: (
    entry: GlossaryEntry
  ) => Promise<GlossaryEntryOccurrenceCounts>;
  readonly renderDescription: (
    description: string,
    imageAssetFolderName: string
  ) => Promise<RenderedGlossaryDescription>;
  readonly loadKatexCss: () => Promise<string>;
  readonly labels: (
    occurrences: GlossaryEntryOccurrenceCounts | null
  ) => GlossaryExportDocumentLabels;
  readonly lang: string;
  readonly writeHtml: (
    request: ExportHtmlCombinedRequest
  ) => Promise<ExportHtmlCombinedResult>;
}

export type GlossaryExportRunResult =
  | { readonly ok: true; readonly outputPath: string; readonly warningCount: number }
  | { readonly ok: false; readonly reason: "entryNotFound" | "failed" };

export async function runGlossaryExport(
  plan: GlossaryExportPlan,
  deps: GlossaryExportRunDeps
): Promise<GlossaryExportRunResult> {
  const entry = await deps.getEntry(plan.entryId);

  if (!entry) {
    return { ok: false, reason: "entryNotFound" };
  }

  const occurrences = plan.content.includeOccurrenceCounts
    ? await deps.countOccurrences(entry)
    : null;
  const description = plan.content.includeDescription
    ? await deps.renderDescription(entry.description, plan.imageAssetFolderName)
    : null;
  const katexCss = description?.usesMath ? await deps.loadKatexCss() : null;

  const htmlContent = buildGlossaryEntryExportHtml({
    entry,
    content: plan.content,
    occurrences,
    description,
    labels: deps.labels(occurrences),
    lang: deps.lang,
    katexCss
  });

  const result = await deps.writeHtml({
    defaultFileName: plan.fileName,
    htmlContent,
    imageAssets: description?.imageAssets ?? [],
    projectRootPath: null,
    targetPath: plan.outputFilePath,
    // The dialog already asked before overwriting an existing file.
    allowOverwrite: true
  });

  return result.ok
    ? { ok: true, outputPath: result.outputPath, warningCount: result.warningCount }
    : { ok: false, reason: "failed" };
}

/**
 * #581 Slice 2 & 3: combined glossary export plan.
 */
export interface CombinedGlossaryExportPlan {
  readonly format?: "html" | "pdf";
  readonly entries: readonly GlossaryEntry[];
  readonly occurrenceCountsByEntryId?: ReadonlyMap<string, unknown>;
  readonly outputFilePath: string;
  readonly fileName: string;
  readonly imageAssetFolderName: string;
  readonly includeToc: boolean;
  readonly tocPosition: "front" | "back";
  readonly pdfFontCandidates?: readonly FontFamilySetting[];
  readonly pdfPageSettings?: PdfPageNumberSettings;
  readonly documentTitle?: string;
  readonly contentOptions?: GlossaryExportContentOptions;
}

export interface CombinedGlossaryExportRunDeps {
  readonly renderDescription: (
    description: string,
    imageAssetFolderName: string
  ) => Promise<RenderedGlossaryDescription>;
  readonly loadKatexCss: () => Promise<string>;
  readonly labels: (
    occurrences: GlossaryEntryOccurrenceCounts | null
  ) => GlossaryExportDocumentLabels;
  readonly lang: string;
  readonly writeHtml: (
    request: ExportHtmlCombinedRequest
  ) => Promise<ExportHtmlCombinedResult>;
  readonly writePdf?: (
    request: ExportPdfCombinedRequest
  ) => Promise<ExportPdfCombinedResult>;
  readonly tocTitle?: string;
  readonly tocNavLabel?: string;
}

export type CombinedGlossaryExportRunResult =
  | { readonly ok: true; readonly outputPath: string; readonly warningCount: number }
  | { readonly ok: false; readonly reason: "failed" };

export async function runCombinedGlossaryExport(
  plan: CombinedGlossaryExportPlan,
  deps: CombinedGlossaryExportRunDeps
): Promise<CombinedGlossaryExportRunResult> {
  const contentOptions = plan.contentOptions ?? defaultGlossaryExportContentOptions;
  const sections: CombinedGlossaryEntrySectionInput[] = [];

  for (const entry of plan.entries) {
    let occurrences: GlossaryEntryOccurrenceCounts | null = null;

    if (contentOptions.includeOccurrenceCounts && plan.occurrenceCountsByEntryId) {
      const countVal = plan.occurrenceCountsByEntryId.get(entry.id);
      if (countVal !== undefined && typeof countVal === "object" && countVal !== null) {
        const valObj = countVal as Record<string, unknown>;
        if ("occurrences" in valObj && valObj.occurrences) {
          occurrences = valObj.occurrences as GlossaryEntryOccurrenceCounts;
        } else if (valObj.status === "ready" && typeof valObj.count === "number") {
          occurrences = {
            atoms: entry.atoms.map((atom) => ({ atomId: atom.id, value: atom.value, count: 0 })),
            total: valObj.count as number,
            documentCount: 0,
            skippedFileCount: 0
          };
        }
      } else if (typeof countVal === "number") {
        occurrences = {
          atoms: entry.atoms.map((atom) => ({ atomId: atom.id, value: atom.value, count: 0 })),
          total: countVal,
          documentCount: 0,
          skippedFileCount: 0
        };
      }
    }

    const description =
      contentOptions.includeDescription && entry.description
        ? await deps.renderDescription(entry.description, plan.imageAssetFolderName)
        : null;

    sections.push({
      entry,
      occurrences,
      description
    });
  }

  const allAssets = sections.flatMap((sec) => sec.description?.imageAssets ?? []);
  const imageAssets: ExportImageAssetCopyItem[] = [];
  const seenAssets = new Set<string>();

  for (const asset of allAssets) {
    if (!seenAssets.has(asset.outputRelativePath)) {
      seenAssets.add(asset.outputRelativePath);
      imageAssets.push(asset);
    }
  }

  const usesMath = sections.some((sec) => sec.description?.usesMath);
  const katexCss = usesMath ? await deps.loadKatexCss() : null;

  const pdfFontFamily =
    plan.pdfFontCandidates && plan.pdfFontCandidates.length > 0
      ? buildFontFamilyCss(plan.pdfFontCandidates)
      : null;

  const htmlContent = buildCombinedGlossaryExportHtml({
    documentTitle: plan.documentTitle ?? "語彙集",
    sections,
    content: contentOptions,
    includeToc: plan.includeToc,
    tocPosition: plan.tocPosition,
    labels: deps.labels(null),
    tocTitle: deps.tocTitle,
    tocNavLabel: deps.tocNavLabel,
    lang: deps.lang,
    katexCss,
    pdfFontFamily
  });

  if (plan.format === "pdf") {
    if (!deps.writePdf) {
      return { ok: false, reason: "failed" };
    }

    const pdfResult = await deps.writePdf({
      defaultFileName: plan.fileName,
      htmlContent,
      imageAssets,
      projectRootPath: null,
      targetPath: plan.outputFilePath,
      pdfFontFamily:
        plan.pdfFontCandidates && plan.pdfFontCandidates.length > 0
          ? plan.pdfFontCandidates[0].family
          : null,
      pdfPageNumberSettings: plan.pdfPageSettings ?? DEFAULT_PDF_PAGE_NUMBER_SETTINGS,
      allowOverwrite: true
    });

    return pdfResult.ok
      ? { ok: true, outputPath: pdfResult.outputPath, warningCount: pdfResult.warningCount }
      : { ok: false, reason: "failed" };
  }

  const result = await deps.writeHtml({
    defaultFileName: plan.fileName,
    htmlContent,
    imageAssets,
    projectRootPath: null,
    targetPath: plan.outputFilePath,
    allowOverwrite: true
  });

  return result.ok
    ? { ok: true, outputPath: result.outputPath, warningCount: result.warningCount }
    : { ok: false, reason: "failed" };
}

