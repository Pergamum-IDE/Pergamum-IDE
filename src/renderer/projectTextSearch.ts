import type { ProjectDocument } from "../shared/api";
import {
  findTextSearchMatches,
  type TextSearchMatch,
  type TextSearchOptions
} from "../shared/textSearch";
import {
  findGlossaryAtomRelationMatches,
  type GlossaryAtomSearchTerm,
  type GlossarySearchRelationMode
} from "./glossaryAtomSearch";

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
  /** #384 telemetry: how many project documents the scan considered. */
  readonly documentCount: number;
  /** #384 telemetry: total characters actually scanned (skipped files and any
   *  documents past the total-match cap are not counted). */
  readonly searchedCharacterCount: number;
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
    skippedFileCount: 0,
    documentCount: 0,
    searchedCharacterCount: 0
  };
}

/** Reader shared by both search modes: dirty editor buffer first, disk file
 *  otherwise, `null` for an unreadable file (counted as skipped). */
export type ProjectDocumentReader = (
  relativePath: string
) => Promise<string | null>;

interface ScanProjectDocumentsInput {
  readonly documents: readonly ProjectDocument[];
  readonly readText: ProjectDocumentReader;
  /** Per-file matcher. `perFileLimit` already includes the +1 probe used to
   *  detect "there were more matches than kept". */
  readonly findMatches: (
    text: string,
    perFileLimit: number
  ) => readonly TextSearchMatch[];
  readonly isCancelled?: () => boolean;
}

/**
 * The file walk shared by text search and glossary atom search: documents in
 * `relativePath` order, per-file and whole-project match caps, unreadable
 * files skipped (not fatal), truncation flagged.
 */
async function scanProjectDocuments(
  query: string,
  input: ScanProjectDocumentsInput
): Promise<ProjectTextSearchResult> {
  const ordered = [...input.documents].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );

  const files: ProjectTextSearchFileResult[] = [];
  let totalMatches = 0;
  let skippedFileCount = 0;
  let searchedCharacterCount = 0;
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
    searchedCharacterCount += text.length;

    const perFileLimit = Math.min(
      PROJECT_TEXT_SEARCH_MAX_MATCHES_PER_FILE,
      PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES - totalMatches
    );
    // Ask for one extra so "there were more" is detectable.
    const found = input.findMatches(text, perFileLimit + 1);
    if (found.length === 0) {
      continue;
    }

    const fileTruncated = found.length > perFileLimit;
    const kept = fileTruncated
      ? found.slice(0, perFileLimit)
      : [...found];
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
    skippedFileCount,
    documentCount: ordered.length,
    searchedCharacterCount
  };
}

export interface RunProjectTextSearchInput {
  readonly documents: readonly ProjectDocument[];
  /** Text to search for a project doc, or `null` to skip it (unreadable). */
  readonly readText: ProjectDocumentReader;
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

  return scanProjectDocuments(query, {
    documents: input.documents,
    readText: input.readText,
    isCancelled: input.isCancelled,
    findMatches: (text, perFileLimit) =>
      findTextSearchMatches(text, query, {
        ...input.options,
        limit: perFileLimit
      })
  });
}

export interface RunProjectGlossaryAtomSearchInput {
  readonly documents: readonly ProjectDocument[];
  readonly readText: ProjectDocumentReader;
  /** The selected atoms' terms. An empty list yields an empty result. */
  readonly terms: readonly GlossaryAtomSearchTerm[];
  /** `any` (OR, default), `all` (per paragraph) or `nearby` (400-char window). */
  readonly relationMode?: GlossarySearchRelationMode;
  readonly isCancelled?: () => boolean;
}

/**
 * #384 Glossary Search: search the selected atoms across the project under the
 * chosen relation mode. Shares the file walk, caps, skip handling and result
 * shape with {@link runProjectTextSearch}; each match additionally carries its
 * glossary atom / entry identity (see {@link import("./glossaryAtomSearch")}).
 */
export async function runProjectGlossaryAtomSearch(
  input: RunProjectGlossaryAtomSearchInput
): Promise<ProjectTextSearchResult> {
  const terms = input.terms.filter(
    (term) => term.value.trim().length > 0
  );

  if (terms.length === 0) {
    return emptyProjectTextSearchResult("");
  }

  const relationMode = input.relationMode ?? "any";

  return scanProjectDocuments("", {
    documents: input.documents,
    readText: input.readText,
    isCancelled: input.isCancelled,
    findMatches: (text, perFileLimit) =>
      findGlossaryAtomRelationMatches(text, terms, relationMode, {
        limit: perFileLimit
      })
  });
}
