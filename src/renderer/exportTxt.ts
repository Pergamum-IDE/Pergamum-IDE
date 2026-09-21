import { sanitizeJsonFileNameStem } from "../shared/settingsExport";
import {
  applyHeadingRemoval,
  type ExportCandidateListItem,
  type ExportDocumentKind,
  type ExportOrigin,
  type HeadingRemovalLevel
} from "./exportCandidates";
import { replaceAozoraGaijiInText } from "./preview/aozoraGaijiResolver";
import {
  DEFAULT_EXPORT_BODY_NOTATION,
  DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
  DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  EXPORT_BODY_NOTATIONS,
  TXT_UTF8_EXPORT_FORMAT,
  type ExportAssembly,
  type ExportAssemblyDocument,
  type ExportBodyNotation,
  type ExportDialogOptionsState,
  type ExportFormat
} from "./exportTypes";

export {
  DEFAULT_EXPORT_BODY_NOTATION,
  DEFAULT_EXPORT_DIALOG_OPTIONS_STATE,
  DEFAULT_INCLUDE_FILE_STRUCTURE_TOC,
  EXPORT_BODY_NOTATIONS,
  TXT_UTF8_EXPORT_FORMAT,
  type ExportAssembly,
  type ExportAssemblyDocument,
  type ExportBodyNotation,
  type ExportDialogOptionsState,
  type ExportFormat
};

export interface ExportTxtExecutionRequest {
  readonly assembly: ExportAssembly;
  readonly defaultFileName: string;
  readonly targetPath?: string | null;
  readonly allowOverwrite?: boolean;
}

export interface CreateExportAssemblyOptions {
  readonly format: ExportFormat;
  readonly bodyNotation: ExportBodyNotation;
  readonly headingRemovalLevel: HeadingRemovalLevel;
  readonly appendFileStructureToc?: boolean;
  readonly imageAssetFolderName?: string;
  readonly pdfFontFamily?: string | null;
  readonly projectName?: string | null;
  readonly aozoraTextByFilePath?: Readonly<Record<string, string>>;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function applyMarkdownHeadingRemovalForCandidate(
  text: string,
  kind: ExportDocumentKind,
  headingRemovalLevel: HeadingRemovalLevel
): string {
  return kind === "markdown" ? applyHeadingRemoval(text, headingRemovalLevel) : text;
}

function stripMarkdownBlockSyntax(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (/^\s{0,3}(```|~~~)/u.test(line)) {
        return "";
      }

      if (/^\s{0,3}(?:[-*_]\s*){3,}$/u.test(line)) {
        return "";
      }

      let next = line.replace(/^\s{0,3}(?:>\s?)*/u, "");
      next = next.replace(/^\s*[-+*]\s+/u, "");
      next = next.replace(/^\s*\d+[.)]\s+/u, "");
      next = next.replace(/^\s{0,3}(#{1,6})(?:\s+|$)(.*?)(?:\s+#+\s*)?$/u, "$2");
      return next;
    })
    .join("\n");
}

function stripMarkdownInlineSyntax(text: string): string {
  let next = text;

  next = next.replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1");
  next = next.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1");
  next = next.replace(/<\s*(u|ins)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/giu, "$2");
  next = next.replace(/\|\|([\s\S]*?)\|\|/gu, "$1");
  next = next.replace(/~~([\s\S]*?)~~/gu, "$1");
  next = next.replace(/(\*\*|__)([\s\S]*?)\1/gu, "$2");
  next = next.replace(/(^|[^\p{L}\p{N}])\*([^*\n]+)\*(?=$|[^\p{L}\p{N}])/gu, "$1$2");
  next = next.replace(/(^|[^\p{L}\p{N}])_([^_\n]+)_(?=$|[^\p{L}\p{N}])/gu, "$1$2");
  next = next.replace(/`([^`\n]+)`/gu, "$1");
  next = next.replace(/<\/?[A-Za-z][^>]*>/gu, "");

  return next;
}

export function stripMarkdownForTxt(text: string): string {
  return stripMarkdownInlineSyntax(stripMarkdownBlockSyntax(normalizeLineEndings(text)));
}

export function normalizeAozoraForTxt(text: string): string {
  return replaceAozoraGaijiInText(normalizeLineEndings(text));
}

export function createTxtExportDocumentText(
  rawText: string,
  kind: ExportDocumentKind,
  bodyNotation: ExportBodyNotation,
  headingRemovalLevel: HeadingRemovalLevel
): string {
  const headingProcessed = applyMarkdownHeadingRemovalForCandidate(
    rawText,
    kind,
    headingRemovalLevel
  );

  if (bodyNotation === "aozora") {
    return normalizeAozoraForTxt(headingProcessed);
  }

  return stripMarkdownForTxt(headingProcessed);
}

export function createExportAssembly(
  candidatesInExportOrder: readonly ExportCandidateListItem[],
  options: CreateExportAssemblyOptions
): ExportAssembly {
  return {
    format: options.format,
    bodyNotation: options.bodyNotation,
    headingRemovalLevel: options.headingRemovalLevel,
    appendFileStructureToc: options.appendFileStructureToc ?? false,
    imageAssetFolderName: options.imageAssetFolderName ?? "exports.assets",
    pdfFontFamily: options.pdfFontFamily ?? null,
    projectName: options.projectName ?? null,
    documents: candidatesInExportOrder
      .filter((candidate) => candidate.included)
      .map((candidate) => {
        const rawText =
          options.bodyNotation === "aozora"
            ? (options.aozoraTextByFilePath?.[candidate.filePath] ??
              candidate.rawText)
            : candidate.rawText;

        return {
          filePath: candidate.filePath,
          parentPath: candidate.parentPath,
          fileName: candidate.fileName,
          kind: candidate.kind,
          rawText,
          text: createTxtExportDocumentText(
            rawText,
            candidate.kind,
            options.bodyNotation,
            options.headingRemovalLevel
          )
        };
      })
  };
}

export function createTxtUtf8ExportText(assembly: ExportAssembly): string {
  return assembly.documents.map((document) => document.text).join("\n\n");
}

function pathBaseName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\/+$/u, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? "";
}

function fileNameStem(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

export function txtExportDefaultFileName(
  origin: ExportOrigin,
  projectName: string | null
): string {
  const rawStem =
    origin.kind === "projectRoot"
      ? (projectName ?? "")
      : origin.kind === "folder"
        ? pathBaseName(origin.folderPath)
        : fileNameStem(pathBaseName(origin.filePath));

  return `${sanitizeJsonFileNameStem(rawStem, "export")}.txt`;
}
