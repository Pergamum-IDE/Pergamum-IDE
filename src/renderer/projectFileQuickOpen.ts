import type { ProjectDocument } from "../shared/api";
import type {
  ActiveProjectContext,
  EditorId
} from "../shared/editorId";
import {
  createProjectDocumentEditorId,
  editorIdEquals
} from "../shared/editorId";
import {
  pathHasReservedFileExplorerSegment,
  SUPPORTED_MARKDOWN_FILE_EXTENSIONS
} from "../shared/fileExplorerCreate";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import type { NavigationHistorySnapshot } from "./navigationHistory";

export const PROJECT_FILE_QUICK_OPEN_RECENT_LIMIT = 5;

export type ProjectFileQuickOpenMatchKind = "filename" | "relativePath";

export interface ProjectFileQuickOpenMatchRange {
  readonly start: number;
  readonly end: number;
}

export interface ProjectFileQuickOpenDisplayLine {
  readonly text: string;
  readonly ranges: readonly ProjectFileQuickOpenMatchRange[];
}

export interface ProjectFileQuickOpenCandidate {
  readonly document: ProjectDocument;
  readonly filename: ProjectFileQuickOpenDisplayLine;
  readonly relativePath: ProjectFileQuickOpenDisplayLine;
  readonly matchKind: ProjectFileQuickOpenMatchKind | null;
}

function normalizeProjectFileQuickOpenRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeProjectFileQuickOpenNeedle(value: string): string {
  return normalizeProjectFileQuickOpenRelativePath(value.trim()).toLowerCase();
}

function filenameForProjectDocument(document: ProjectDocument): string {
  const relativePath = normalizeProjectFileQuickOpenRelativePath(
    document.relativePath
  );

  return relativePath.split("/").pop() ?? document.name;
}

function projectFileQuickOpenDocument(
  document: ProjectDocument
): ProjectDocument {
  const relativePath = normalizeProjectFileQuickOpenRelativePath(
    document.relativePath
  );

  return {
    relativePath,
    name: filenameForProjectDocument({ ...document, relativePath })
  };
}

function projectFileQuickOpenExtension(relativePath: string): string {
  const filename = relativePath.split("/").pop() ?? relativePath;
  const dotIndex = filename.lastIndexOf(".");

  return dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

export function isProjectFileQuickOpenDocument(
  document: ProjectDocument
): boolean {
  const relativePath = normalizeProjectFileQuickOpenRelativePath(
    document.relativePath
  );

  if (
    !SUPPORTED_MARKDOWN_FILE_EXTENSIONS.includes(
      projectFileQuickOpenExtension(relativePath)
    )
  ) {
    return false;
  }

  if (pathHasReservedFileExplorerSegment(relativePath)) {
    return false;
  }

  return !relativePath
    .split("/")
    .some((segment) => isProtectedPergamumDataFilePath(segment));
}

function prefixMatchRange(
  text: string,
  normalizedNeedle: string
): readonly ProjectFileQuickOpenMatchRange[] {
  if (normalizedNeedle.length === 0) {
    return [];
  }

  return text.toLowerCase().startsWith(normalizedNeedle)
    ? [{ start: 0, end: Math.min(normalizedNeedle.length, text.length) }]
    : [];
}

function segmentPrefixMatchRange(
  text: string,
  normalizedNeedle: string
): readonly ProjectFileQuickOpenMatchRange[] {
  if (normalizedNeedle.length === 0) {
    return [];
  }

  const normalizedText = normalizeProjectFileQuickOpenRelativePath(text);
  let segmentStart = 0;

  for (let index = 0; index <= normalizedText.length; index += 1) {
    if (index !== normalizedText.length && normalizedText[index] !== "/") {
      continue;
    }

    const segment = normalizedText.slice(segmentStart, index);

    if (segment.toLowerCase().startsWith(normalizedNeedle)) {
      return [
        {
          start: segmentStart,
          end: segmentStart + Math.min(normalizedNeedle.length, segment.length)
        }
      ];
    }

    segmentStart = index + 1;
  }

  return [];
}

function compareProjectFileQuickOpenCandidates(
  left: ProjectFileQuickOpenCandidate,
  right: ProjectFileQuickOpenCandidate
): number {
  const leftRank = left.matchKind === "relativePath" ? 1 : 0;
  const rightRank = right.matchKind === "relativePath" ? 1 : 0;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const filenameOrder = left.filename.text.localeCompare(right.filename.text);

  return filenameOrder !== 0
    ? filenameOrder
    : left.relativePath.text.localeCompare(right.relativePath.text);
}

function uniqueProjectFileQuickOpenDocuments(
  documents: readonly ProjectDocument[]
): ProjectDocument[] {
  const seen = new Set<string>();
  const unique: ProjectDocument[] = [];

  for (const document of documents) {
    const normalized = projectFileQuickOpenDocument(document);

    if (seen.has(normalized.relativePath)) {
      continue;
    }

    seen.add(normalized.relativePath);
    unique.push(normalized);
  }

  return unique;
}

function createProjectFileQuickOpenCandidate(
  document: ProjectDocument,
  matchKind: ProjectFileQuickOpenMatchKind | null,
  ranges: readonly ProjectFileQuickOpenMatchRange[]
): ProjectFileQuickOpenCandidate {
  const normalized = projectFileQuickOpenDocument(document);
  const filename =
    matchKind === "filename"
      ? { text: normalized.name, ranges }
      : { text: normalized.name, ranges: [] };
  const relativePath =
    matchKind === "relativePath"
      ? { text: normalized.relativePath, ranges }
      : { text: normalized.relativePath, ranges: [] };

  return {
    document: normalized,
    filename,
    relativePath,
    matchKind
  };
}

export function filterProjectFileQuickOpenCandidates(input: {
  readonly documents: readonly ProjectDocument[];
  readonly query: string;
}): ProjectFileQuickOpenCandidate[] {
  const normalizedNeedle = normalizeProjectFileQuickOpenNeedle(input.query);

  if (normalizedNeedle.length === 0) {
    return [];
  }

  return uniqueProjectFileQuickOpenDocuments(input.documents)
    .filter(isProjectFileQuickOpenDocument)
    .flatMap((document) => {
      const filenameRanges = prefixMatchRange(
        document.name,
        normalizedNeedle
      );

      if (filenameRanges.length > 0) {
        return [
          createProjectFileQuickOpenCandidate(
            document,
            "filename",
            filenameRanges
          )
        ];
      }

      const relativePathRanges = segmentPrefixMatchRange(
        document.relativePath,
        normalizedNeedle
      );

      return relativePathRanges.length > 0
        ? [
            createProjectFileQuickOpenCandidate(
              document,
              "relativePath",
              relativePathRanges
            )
          ]
        : [];
    })
    .sort(compareProjectFileQuickOpenCandidates);
}

function findProjectDocumentForEditorId(input: {
  readonly documents: readonly ProjectDocument[];
  readonly editorId: EditorId;
  readonly activeProjectContext: ActiveProjectContext;
}): ProjectDocument | null {
  if (input.editorId.kind !== "projectDocument") {
    return null;
  }

  return (
    input.documents.find((document) =>
      editorIdEquals(
        createProjectDocumentEditorId(
          document.relativePath,
          input.activeProjectContext
        ),
        input.editorId
      )
    ) ?? null
  );
}

export function recentProjectFileQuickOpenDocuments(input: {
  readonly documents: readonly ProjectDocument[];
  readonly history: NavigationHistorySnapshot;
  readonly activeProjectContext: ActiveProjectContext | null;
  readonly limit?: number;
}): ProjectDocument[] {
  if (!input.activeProjectContext || input.history.currentIndex < 0) {
    return [];
  }

  const result: ProjectDocument[] = [];
  const seen = new Set<string>();
  const limit = input.limit ?? PROJECT_FILE_QUICK_OPEN_RECENT_LIMIT;
  const historyEntries = input.history.entries.slice(
    0,
    input.history.currentIndex + 1
  );

  for (const editorId of historyEntries.reverse()) {
    const document = findProjectDocumentForEditorId({
      documents: input.documents,
      editorId,
      activeProjectContext: input.activeProjectContext
    });

    if (!document || !isProjectFileQuickOpenDocument(document)) {
      continue;
    }

    const normalized = projectFileQuickOpenDocument(document);

    if (seen.has(normalized.relativePath)) {
      continue;
    }

    seen.add(normalized.relativePath);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export function projectFileQuickOpenCandidates(input: {
  readonly documents: readonly ProjectDocument[];
  readonly recentDocuments: readonly ProjectDocument[];
  readonly query: string;
}): ProjectFileQuickOpenCandidate[] {
  return input.query.trim().length === 0
    ? uniqueProjectFileQuickOpenDocuments(input.recentDocuments)
        .filter(isProjectFileQuickOpenDocument)
        .slice(0, PROJECT_FILE_QUICK_OPEN_RECENT_LIMIT)
        .map((document) =>
          createProjectFileQuickOpenCandidate(document, null, [])
        )
    : filterProjectFileQuickOpenCandidates({
        documents: input.documents,
        query: input.query
      });
}

export function resolveProjectFileQuickOpenSelection(
  candidates: readonly ProjectFileQuickOpenCandidate[],
  currentIndex: number | null = null
): number | null {
  if (candidates.length === 0) {
    return null;
  }

  return currentIndex !== null &&
    currentIndex >= 0 &&
    currentIndex < candidates.length
    ? currentIndex
    : 0;
}
