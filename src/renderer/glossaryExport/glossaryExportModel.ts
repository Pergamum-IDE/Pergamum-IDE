import type { GlossaryEntryId } from "../../shared/glossary";
import { sanitizeJsonFileNameStem } from "../../shared/settingsExport";
import {
  documentMapPngExportFilePath,
  validateDocumentMapPngBaseFileName,
  type DocumentMapPngBaseFileNameValidationError
} from "../documentMapPngExportPlan";

/**
 * #574 Slice 6: glossary entry export — the option / plan model.
 *
 * The model already names the future shapes (several / all entries, PDF) so
 * the dialog and the renderer can grow into them, but only ONE entry → HTML
 * is supported now: `planGlossaryExport` rejects anything else.
 */

export type GlossaryExportTarget =
  | { readonly kind: "single"; readonly entryId: GlossaryEntryId }
  // Future: several entries picked in Glossary Management.
  | { readonly kind: "selected"; readonly entryIds: readonly GlossaryEntryId[] }
  // Future: the whole glossary.
  | { readonly kind: "all" };

/** Output format. Future: `"pdf"`. */
export type GlossaryExportFormat = "html";

export interface GlossaryExportContentOptions {
  readonly includeGlossaryInfo: boolean;
  readonly includeOccurrenceCounts: boolean;
  readonly includeDescription: boolean;
}

/** Every section is exported in this slice (the dialog lists them fixed). */
export const defaultGlossaryExportContentOptions: GlossaryExportContentOptions = {
  includeGlossaryInfo: true,
  includeOccurrenceCounts: true,
  includeDescription: true
};

export interface GlossaryExportOptions {
  readonly target: GlossaryExportTarget;
  readonly format: GlossaryExportFormat;
  readonly content: GlossaryExportContentOptions;
  /** Absolute folder chosen through the folder picker. */
  readonly outputFolder: string;
  /** File name without extension, as edited in the dialog. */
  readonly baseFileName: string;
}

export interface GlossaryExportPlan {
  readonly entryId: GlossaryEntryId;
  readonly format: GlossaryExportFormat;
  readonly content: GlossaryExportContentOptions;
  /** `<outputFolder>/<baseFileName>.html` */
  readonly outputFilePath: string;
  readonly fileName: string;
  /** Folder (next to the HTML) that project images are copied into. */
  readonly imageAssetFolderName: string;
}

export type GlossaryExportPlanError =
  | "unsupportedTarget"
  | "missingOutputFolder"
  | DocumentMapPngBaseFileNameValidationError;

export type GlossaryExportPlanResult =
  | { readonly ok: true; readonly plan: GlossaryExportPlan }
  | { readonly ok: false; readonly error: GlossaryExportPlanError };

/** `<representative>` → a filesystem-safe default base file name. */
export function defaultGlossaryExportBaseFileName(entryLabel: string): string {
  return sanitizeJsonFileNameStem(entryLabel, "glossary");
}

export function glossaryExportImageAssetFolderName(baseFileName: string): string {
  return `${baseFileName}.assets`;
}

export function planGlossaryExport(
  options: GlossaryExportOptions
): GlossaryExportPlanResult {
  if (options.target.kind !== "single") {
    return { ok: false, error: "unsupportedTarget" };
  }

  const nameValidation = validateDocumentMapPngBaseFileName(options.baseFileName);

  if (!nameValidation.ok) {
    return { ok: false, error: nameValidation.error };
  }

  if (options.outputFolder.trim().length === 0) {
    return { ok: false, error: "missingOutputFolder" };
  }

  const fileName = `${options.baseFileName}.html`;

  return {
    ok: true,
    plan: {
      entryId: options.target.entryId,
      format: options.format,
      content: options.content,
      outputFilePath: documentMapPngExportFilePath(options.outputFolder, fileName),
      fileName,
      imageAssetFolderName: glossaryExportImageAssetFolderName(
        options.baseFileName
      )
    }
  };
}
