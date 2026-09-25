import type {
  ExportHtmlCombinedRequest,
  ExportHtmlCombinedResult
} from "../../shared/api";
import type { GlossaryEntry, GlossaryEntryId } from "../../shared/glossary";
import {
  buildGlossaryEntryExportHtml,
  type GlossaryExportDocumentLabels,
  type RenderedGlossaryDescription
} from "./glossaryExportHtml";
import type { GlossaryExportPlan } from "./glossaryExportModel";
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
