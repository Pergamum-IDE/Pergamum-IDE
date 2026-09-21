import type {
  ExportCandidateListItem,
  ExportDocumentKind,
  ExportOrigin,
  HeadingRemovalLevel
} from "./exportCandidates";
import type { PdfPageNumberSettings } from "../shared/pdfPageNumbering";
import { DEFAULT_PDF_PAGE_NUMBER_SETTINGS } from "../shared/pdfPageNumbering";

export type ExportFormat = "txtUtf8" | "htmlCombined" | "pdfCombined" | "pdf" | "docx";

export type ExportBodyNotation =
  | "markdown"
  | "aozora"
  | "narou"
  | "kakuyomu";

export const TXT_UTF8_EXPORT_FORMAT = "txtUtf8" satisfies ExportFormat;
export const HTML_COMBINED_EXPORT_FORMAT = "htmlCombined" satisfies ExportFormat;
export const PDF_COMBINED_EXPORT_FORMAT = "pdfCombined" satisfies ExportFormat;

export const DEFAULT_EXPORT_BODY_NOTATION =
  "markdown" satisfies ExportBodyNotation;

export const DEFAULT_INCLUDE_FILE_STRUCTURE_TOC = false;
export const DEFAULT_IMAGE_ASSET_FOLDER_NAME = "exports.assets";

export const EXPORT_BODY_NOTATIONS = [
  "markdown",
  "aozora",
  "narou",
  "kakuyomu"
] as const satisfies readonly ExportBodyNotation[];

export interface ExportDialogOptionsState {
  readonly exportFormat: ExportFormat;
  readonly bodyNotation: ExportBodyNotation;
  readonly includeFileStructureToc: boolean;
  readonly imageAssetFolderName: string;
  readonly pdfFontFamily: string | null;
  readonly pdfPageNumberSettings: PdfPageNumberSettings;
}

export interface ExportAssemblyDocument {
  readonly filePath: string;
  readonly parentPath: string;
  readonly fileName: string;
  readonly kind: ExportDocumentKind;
  readonly text: string;
  readonly rawText: string;
}

export interface ExportAssembly {
  readonly format: ExportFormat;
  readonly bodyNotation: ExportBodyNotation;
  readonly headingRemovalLevel: HeadingRemovalLevel;
  readonly documents: readonly ExportAssemblyDocument[];
  readonly appendFileStructureToc: boolean;
  readonly imageAssetFolderName: string;
  readonly projectName: string | null;
  readonly pdfFontFamily?: string | null;
  readonly pdfPageNumberSettings?: PdfPageNumberSettings | null;
}

export const DEFAULT_EXPORT_DIALOG_OPTIONS_STATE: ExportDialogOptionsState = {
  exportFormat: TXT_UTF8_EXPORT_FORMAT,
  bodyNotation: DEFAULT_EXPORT_BODY_NOTATION,
  includeFileStructureToc: DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  imageAssetFolderName: DEFAULT_IMAGE_ASSET_FOLDER_NAME,
  pdfFontFamily: null,
  pdfPageNumberSettings: DEFAULT_PDF_PAGE_NUMBER_SETTINGS
};

export type ExportWizardStep =
  | "sourceInterpretation"
  | "outputFormat"
  | "outputDestination"
  | "result";

export function sanitizeFileName(name: string): string {
  if (!name) return "Untitled";
  let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  sanitized = sanitized.replace(/[. ]+$/, "");
  if (!sanitized) return "Untitled";
  return sanitized;
}

export function getFixedExtensionForFormat(format: ExportFormat): string {
  switch (format) {
    case "txtUtf8":
      return ".txt";
    case "htmlCombined":
      return ".html";
    case "pdfCombined":
    case "pdf":
      return ".pdf";
    default:
      return ".txt";
  }
}

export function validateImageAssetFolderName(folderName: string): boolean {
  const trimmed = folderName.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed === "." || trimmed === "..") {
    return false;
  }

  if (/[\\/]/u.test(trimmed)) {
    return false;
  }

  return true;
}
