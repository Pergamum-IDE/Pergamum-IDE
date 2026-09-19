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
}

export interface CollectExportCandidatesOptions {
  readonly enablePlainTextDocuments: boolean;
}

export interface CollectExportCandidatesDeps {
  readonly listFileExplorerChildren: (
    directoryRelativePath: string | null
  ) => Promise<ListFileExplorerChildrenResult>;
}

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

function candidateFromRelativePath(
  relativePath: string,
  options: CollectExportCandidatesOptions
): ExportCandidateListItem | null {
  const filePath = normalizeProjectRelativePath(relativePath);
  const kind = exportDocumentKindForPath(filePath, options);

  if (kind === null) {
    return null;
  }

  return {
    documentKey: filePath,
    filePath,
    parentPath: parentPathFor(filePath),
    fileName: fileNameFor(filePath),
    kind
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

    const candidate = candidateFromRelativePath(entry.relativePath, options);
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
    const candidate = candidateFromRelativePath(origin.filePath, options);
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
