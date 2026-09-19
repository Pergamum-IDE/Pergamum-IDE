import type {
  FileExplorerEntry,
  ListFileExplorerChildrenResult
} from "../shared/api";
import { getProjectDocumentKind } from "../shared/projectDocumentKind";

export type ExportOrigin =
  | { readonly kind: "projectRoot" }
  | { readonly kind: "folder"; readonly folderPath: string }
  | { readonly kind: "file"; readonly filePath: string };

export type ExportDocumentKind = "markdown" | "text";

export interface ExportCandidateListItem {
  readonly documentKey: string;
  readonly filePath: string;
  readonly parentPath: string;
  readonly fileName: string;
  readonly kind: ExportDocumentKind;
  readonly rawText: string;
  readonly previewStart: string;
  readonly previewEnd: string;
  readonly previewStartHover: string;
  readonly previewEndHover: string;
  readonly characterCount: number;
  readonly included: boolean;
}

export interface CollectExportCandidatesOptions {
  readonly enablePlainTextDocuments: boolean;
}

export interface CollectExportCandidatesDeps {
  readonly listFileExplorerChildren: (
    directoryRelativePath: string | null
  ) => Promise<ListFileExplorerChildrenResult>;
  readonly readProjectDocumentContent: (
    relativePath: string
  ) => Promise<string>;
}

export interface ExportCandidateSummary {
  readonly candidateCount: number;
  readonly includedCount: number;
  readonly includedCharacterCount: number;
}

export type ExportCandidateFolderIncludeState = "on" | "off" | "mixed";
export type HeadingRemovalLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ExportCandidateFolderGroup {
  readonly parentPath: string;
  readonly label: string;
  readonly items: readonly ExportCandidateListItem[];
  readonly totalFileCount: number;
  readonly includedFileCount: number;
  readonly includedCharacterCount: number;
  readonly includeState: ExportCandidateFolderIncludeState;
}

export const EXPORT_PREVIEW_LENGTH = 10;
export const EXPORT_PREVIEW_HOVER_LENGTH = 20;
export const EXPORT_PREVIEW_EMPTY_PLACEHOLDER = "—";
export const HEADING_REMOVAL_LEVELS = [0, 1, 2, 3, 4, 5, 6] as const;

function normalizeProjectRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function parentPathFor(relativePath: string): string {
  const normalized = normalizeProjectRelativePath(relativePath);
  const slashIndex = normalized.lastIndexOf("/");

  return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
}

function fileNameFor(relativePath: string): string {
  const normalized = normalizeProjectRelativePath(relativePath);
  const slashIndex = normalized.lastIndexOf("/");

  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

export function normalizeExportPreviewText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function createExportPreviewText(
  text: string,
  edge: "start" | "end",
  length = EXPORT_PREVIEW_LENGTH
): string {
  const normalized = normalizeExportPreviewText(text);
  const characters = Array.from(normalized);
  if (characters.length === 0) {
    return EXPORT_PREVIEW_EMPTY_PLACEHOLDER;
  }

  if (characters.length <= length) {
    return characters.join("");
  }

  return edge === "start"
    ? `${characters.slice(0, length).join("")}…`
    : `…${characters.slice(-length).join("")}`;
}

export function isHeadingRemovalLevel(
  value: number
): value is HeadingRemovalLevel {
  return HEADING_REMOVAL_LEVELS.includes(value as HeadingRemovalLevel);
}

function lineTextWithoutEnding(line: string): string {
  return line.replace(/(?:\r\n|\r|\n)$/u, "");
}

function splitLinesWithEndings(text: string): string[] {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu) ?? [];

  return lines.filter((line, index) => line.length > 0 || index < lines.length - 1);
}

function atxHeadingLevel(line: string): HeadingRemovalLevel | null {
  const match = /^(#{1,6})(?:\s+|$)/u.exec(lineTextWithoutEnding(line));
  if (!match) {
    return null;
  }

  const level = match[1].length;
  return isHeadingRemovalLevel(level) ? level : null;
}

export function applyHeadingRemoval(
  text: string,
  headingRemovalLevel: HeadingRemovalLevel
): string {
  if (headingRemovalLevel === 0) {
    return text;
  }

  return splitLinesWithEndings(text)
    .filter((line) => {
      const level = atxHeadingLevel(line);
      return level === null || level > headingRemovalLevel;
    })
    .join("");
}

export function createExportCandidateMetadata(
  rawText: string,
  kind: ExportDocumentKind,
  headingRemovalLevel: HeadingRemovalLevel = 0
): Pick<
  ExportCandidateListItem,
  | "previewStart"
  | "previewEnd"
  | "previewStartHover"
  | "previewEndHover"
  | "characterCount"
> {
  const effectiveText =
    kind === "markdown"
      ? applyHeadingRemoval(rawText, headingRemovalLevel)
      : rawText;

  return {
    previewStart: createExportPreviewText(effectiveText, "start"),
    previewEnd: createExportPreviewText(effectiveText, "end"),
    previewStartHover: createExportPreviewText(
      effectiveText,
      "start",
      EXPORT_PREVIEW_HOVER_LENGTH
    ),
    previewEndHover: createExportPreviewText(
      effectiveText,
      "end",
      EXPORT_PREVIEW_HOVER_LENGTH
    ),
    characterCount: Array.from(effectiveText).length
  };
}

export function createExportCandidateTextDetails(
  text: string,
  kind: ExportDocumentKind = "markdown",
  headingRemovalLevel: HeadingRemovalLevel = 0
): Pick<
  ExportCandidateListItem,
  | "previewStart"
  | "previewEnd"
  | "previewStartHover"
  | "previewEndHover"
  | "characterCount"
  | "included"
> {
  return {
    ...createExportCandidateMetadata(text, kind, headingRemovalLevel),
    included: true
  };
}

export function recalculateExportCandidateMetadata(
  candidates: readonly ExportCandidateListItem[],
  headingRemovalLevel: HeadingRemovalLevel
): readonly ExportCandidateListItem[] {
  return candidates.map((candidate) => ({
    ...candidate,
    ...createExportCandidateMetadata(
      candidate.rawText,
      candidate.kind,
      headingRemovalLevel
    )
  }));
}

export function exportDocumentKindForPath(
  relativePath: string,
  options: CollectExportCandidatesOptions
): ExportDocumentKind | null {
  const kind = getProjectDocumentKind(
    normalizeProjectRelativePath(relativePath),
    options
  );

  if (kind === "markdown") {
    return "markdown";
  }

  if (kind === "plainText") {
    return "text";
  }

  return null;
}

export function isExportableDocumentForExport(
  relativePath: string,
  options: CollectExportCandidatesOptions
): boolean {
  return exportDocumentKindForPath(relativePath, options) !== null;
}

async function candidateFromRelativePath(
  relativePath: string,
  deps: CollectExportCandidatesDeps,
  options: CollectExportCandidatesOptions
): Promise<ExportCandidateListItem | null> {
  const filePath = normalizeProjectRelativePath(relativePath);
  const kind = exportDocumentKindForPath(filePath, options);

  if (kind === null) {
    return null;
  }

  const text = await deps.readProjectDocumentContent(filePath);

  return {
    documentKey: filePath,
    filePath,
    parentPath: parentPathFor(filePath),
    fileName: fileNameFor(filePath),
    kind,
    rawText: text,
    ...createExportCandidateTextDetails(text, kind)
  };
}

export async function flattenExportCandidatesInExplorerOrder(
  entries: readonly FileExplorerEntry[],
  deps: CollectExportCandidatesDeps,
  options: CollectExportCandidatesOptions
): Promise<ExportCandidateListItem[]> {
  const candidates: ExportCandidateListItem[] = [];

  for (const entry of entries) {
    if (entry.kind === "folder") {
      const result = await deps.listFileExplorerChildren(entry.relativePath);
      if (result.kind === "ok") {
        candidates.push(
          ...(await flattenExportCandidatesInExplorerOrder(
            result.entries,
            deps,
            options
          ))
        );
      }
      continue;
    }

    const candidate = await candidateFromRelativePath(
      entry.relativePath,
      deps,
      options
    );
    if (candidate !== null) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export async function collectExportCandidatesFromOrigin(
  origin: ExportOrigin,
  deps: CollectExportCandidatesDeps,
  options: CollectExportCandidatesOptions
): Promise<ExportCandidateListItem[]> {
  if (origin.kind === "file") {
    const candidate = await candidateFromRelativePath(
      origin.filePath,
      deps,
      options
    );
    return candidate === null ? [] : [candidate];
  }

  const directoryRelativePath =
    origin.kind === "projectRoot" ? null : origin.folderPath;
  const result = await deps.listFileExplorerChildren(directoryRelativePath);

  if (result.kind !== "ok") {
    return [];
  }

  return flattenExportCandidatesInExplorerOrder(result.entries, deps, options);
}

export function summarizeExportCandidates(
  candidates: readonly ExportCandidateListItem[]
): ExportCandidateSummary {
  return candidates.reduce<ExportCandidateSummary>(
    (summary, candidate) => ({
      candidateCount: summary.candidateCount + 1,
      includedCount: summary.includedCount + (candidate.included ? 1 : 0),
      includedCharacterCount:
        summary.includedCharacterCount +
        (candidate.included ? candidate.characterCount : 0)
    }),
    {
      candidateCount: 0,
      includedCount: 0,
      includedCharacterCount: 0
    }
  );
}

export function getFolderIncludeState(
  totalFileCount: number,
  includedFileCount: number
): ExportCandidateFolderIncludeState {
  if (totalFileCount === 0 || includedFileCount === 0) {
    return "off";
  }

  return includedFileCount === totalFileCount ? "on" : "mixed";
}

export function calculateFolderSummary(
  parentPath: string,
  label: string,
  items: readonly ExportCandidateListItem[]
): ExportCandidateFolderGroup {
  const includedFileCount = items.filter((item) => item.included).length;
  const includedCharacterCount = items.reduce(
    (total, item) => total + (item.included ? item.characterCount : 0),
    0
  );

  return {
    parentPath,
    label,
    items,
    totalFileCount: items.length,
    includedFileCount,
    includedCharacterCount,
    includeState: getFolderIncludeState(items.length, includedFileCount)
  };
}

export function groupExportCandidatesByParentPath(
  candidates: readonly ExportCandidateListItem[],
  projectRootLabel: string
): readonly ExportCandidateFolderGroup[] {
  const groups = new Map<string, ExportCandidateListItem[]>();

  for (const candidate of candidates) {
    const items = groups.get(candidate.parentPath);
    if (items) {
      items.push(candidate);
    } else {
      groups.set(candidate.parentPath, [candidate]);
    }
  }

  return Array.from(groups.entries()).map(([parentPath, items]) =>
    calculateFolderSummary(
      parentPath,
      parentPath === "" ? projectRootLabel : parentPath,
      items
    )
  );
}

export function setFolderIncluded(
  candidates: readonly ExportCandidateListItem[],
  parentPath: string,
  included: boolean
): readonly ExportCandidateListItem[] {
  return candidates.map((candidate) =>
    candidate.parentPath === parentPath ? { ...candidate, included } : candidate
  );
}

export function toggleFolderIncluded(
  candidates: readonly ExportCandidateListItem[],
  parentPath: string
): readonly ExportCandidateListItem[] {
  const items = candidates.filter((candidate) => candidate.parentPath === parentPath);
  const group = calculateFolderSummary(parentPath, parentPath, items);

  return setFolderIncluded(
    candidates,
    parentPath,
    group.includeState === "on" ? false : true
  );
}

export function mergeExportCandidateIncludedStates(
  nextCandidates: readonly ExportCandidateListItem[],
  previousCandidates: readonly ExportCandidateListItem[]
): readonly ExportCandidateListItem[] {
  const previousIncludedByFilePath = new Map(
    previousCandidates.map((candidate) => [
      candidate.filePath,
      candidate.included
    ])
  );

  return nextCandidates.map((candidate) => ({
    ...candidate,
    included:
      previousIncludedByFilePath.get(candidate.filePath) ?? candidate.included
  }));
}
