import type { ProjectTextSearchResult } from "../projectTextSearch";
import type { ReplacePreviewCandidate } from "./replacePreviewTypes";

/**
 * #386 - derive Replace Preview candidates from a project text search.
 *
 * PoC only: this reuses the project text search so the dialog shows real-looking
 * previews without any extra candidate generation or regex expansion. It never
 * edits a buffer or writes a file. A later phase replaces this with a proper
 * open-documents / project scan.
 *
 * The candidates are NOT the Search pane's displayed result list: the pane caps
 * that list at {@link import("../projectTextSearch").PROJECT_TEXT_SEARCH_MAX_TOTAL_MATCHES}
 * (1000) purely to keep the list light. A replace must not silently stop at
 * 1000, so the Replace Preview runs its own search with the much higher
 * {@link REPLACE_PREVIEW_CANDIDATE_LIMIT}, and `limitReached` is surfaced when
 * even that is hit.
 */

/** Context characters kept on each side of a match for the preview row. */
const CONTEXT_CHARS = 24;

/**
 * The Replace Preview's own candidate ceiling, deliberately separate from and
 * far above the Search pane's 1000-result display cap. When a search produces
 * more sites than this, the dialog tells the user to narrow the condition
 * rather than silently dropping replacements.
 */
export const REPLACE_PREVIEW_CANDIDATE_LIMIT = 10_000;

export interface ReplacePreviewCandidateBuild {
  readonly candidates: ReplacePreviewCandidate[];
  /**
   * `true` when the source search truncated, or the candidate count reached
   * {@link REPLACE_PREVIEW_CANDIDATE_LIMIT} - i.e. some replacement sites are
   * not shown and the search should be narrowed.
   */
  readonly limitReached: boolean;
}

export function buildReplacePreviewCandidates(
  result: ProjectTextSearchResult,
  replaceText: string,
  limit: number = REPLACE_PREVIEW_CANDIDATE_LIMIT
): ReplacePreviewCandidateBuild {
  const candidates: ReplacePreviewCandidate[] = [];
  let limitReached = result.truncated;

  outer: for (const file of result.files) {
    for (const match of file.matches) {
      if (candidates.length >= limit) {
        limitReached = true;
        break outer;
      }

      const beforeWindow = match.previewText.slice(0, match.previewMatchStart);
      const afterWindow = match.previewText.slice(match.previewMatchEnd);
      const contextBefore = beforeWindow.slice(
        Math.max(0, beforeWindow.length - CONTEXT_CHARS)
      );
      const contextAfter = afterWindow.slice(0, CONTEXT_CHARS);

      candidates.push({
        id: `${file.relativePath}:${match.startOffset}`,
        fileId: file.relativePath,
        fileLabel: file.name,
        filePath:
          file.relativePath !== file.name ? file.relativePath : undefined,
        line: match.line,
        column: match.column,
        contextBefore,
        contextAfter,
        truncatedStart: beforeWindow.length > contextBefore.length,
        truncatedEnd: afterWindow.length > contextAfter.length,
        beforeText: match.matchedText,
        afterText: replaceText,
        enabled: true
      });
    }
  }

  return { candidates, limitReached };
}
