import type { ProjectDocument } from "../shared/api";
import {
  findTextSearchMatches,
  type TextSearchMatch,
  type TextSearchOptions
} from "../shared/textSearch";

/**
 * #384 Phase 2 - orchestrates a plain-text search across the current
 * project's Markdown documents. Pure and I/O-injected: the caller supplies
 * `readText` (dirty editor buffer first, disk file otherwise) and an
 * `isCancelled` probe so a superseded search stops early. Results are
 * grouped by file, capped so a huge project cannot blow up the pane.
 */

/** Per-file match cap. */
export const PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE = 100;
/** Whole-project match cap. */
export const PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES = 1000;

export interface ProjectTextSearchFileResult {
  readonly relativePath: string;
  readonly name: string;
  readonly matches: readonly TextSearchMatch[];
  /** `true` when this file had more matches than were kept. */
  readonly truncated: boolean;
}

export interface ProjectTextSearchResult {
  readonly query: string;
  readonly files: readonly ProjectTextSearchFileResult[];
  readonly totalMatches: number;
  /** Number of files with at least one kept match. */
  readonly fileCount: number;
  /** `true` when a per-file or the total cap dropped some matches. */
  readonly truncated: boolean;
  /** Files that could not be read (skipped, not fatal). */
  readonly skippedFileCount: number;
}

export function emptyProjectTextSearchResult(
  query: string
): ProjectTextSearchResult {
  return {
    query,
    files: [],
    totalMatches: 0,
    fileCount: 0,
    truncated: false,
    skippedFileCount: 0
  };
}

export interface RunProjectTextSearchInput {
  readonly documents: readonly ProjectDocument[];
  /** Text to search for a project doc, or `null` to skip it (unreadable). */
  readonly readText: (relativePath: string) => Promise<string | null>;
  readonly query: string;
  readonly options: TextSearchOptions;
  /** Polled between files; when it returns `true` the run stops. */
  readonly isCancelled?: () => boolean;
}

export async function runProjectTextSearch(
  input: RunProjectTextSearchInput
): Promise<ProjectTextSearchResult> {
  const { query } = input;

  if (query.trim().length === 0) {
    return emptyProjectTextSearchResult(query);
  }

  const ordered = [...input.documents].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );

  const files: ProjectTextSearchFileResult[] = [];
  let totalMatches = 0;
  let skippedFileCount = 0;
  let truncated = false;

  for (const document of ordered) {
    if (input.isCancelled?.()) {
      break;
    }
    if (totalMatches >= PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES) {
      truncated = true;
      break;
    }

    let text: string | null;
    try {
      text = await input.readText(document.relativePath);
    } catch {
      text = null;
    }
    if (text === null) {
      skippedFileCount += 1;
      continue;
    }

    const perFileLimit = Math.min(
      PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE,
      PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES - totalMatches
    );
    // Ask for one extra so "there were more" is detectable.
    const found = findTextSearchMatches(text, query, {
      ...input.options,
      limit: perFileLimit + 1
    });
    if (found.length === 0) {
      continue;
    }

    const fileTruncated = found.length > perFileLimit;
    const kept = fileTruncated ? found.slice(0, perFileLimit) : found;
    if (fileTruncated) {
      truncated = true;
    }
    totalMatches += kept.length;
    files.push({
      relativePath: document.relativePath,
      name: document.name,
      matches: kept,
      truncated: fileTruncated
    });
  }

  return {
    query,
    files,
    totalMatches,
    fileCount: files.length,
    truncated,
    skippedFileCount
  };
}
