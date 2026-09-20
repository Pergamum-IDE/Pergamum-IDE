import type {
  ExportCandidateListItem,
  ExportDocumentKind,
  ExportOrigin,
  HeadingRemovalLevel
} from "./exportCandidates";

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
}

export const DEFAULT_EXPORT_DIALOG_OPTIONS_STATE: ExportDialogOptionsState = {
  exportFormat: TXT_UTF8_EXPORT_FORMAT,
  bodyNotation: DEFAULT_EXPORT_BODY_NOTATION,
  includeFileStructureToc: DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  imageAssetFolderName: DEFAULT_IMAGE_ASSET_FOLDER_NAME
};

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
