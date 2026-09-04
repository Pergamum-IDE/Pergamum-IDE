import {
  compileSearchRegex,
  createTextSearchMatch,
  findTextSearchMatches,
  lineStartOffsets,
  type TextSearchMatch
} from "../../shared/textSearch";
import {
  countCaptureGroups,
  renderReplacement,
  validateReplacementTemplate,
  type ReplacementToken,
  type ReplacementTemplateError
} from "./replacementTemplate";
import type { ReplacePreviewCandidate } from "./replacePreviewTypes";

/**
 * #386 - Open Documents Replace candidate generation.
 *
 * Scans the CURRENT text of open Markdown editor buffers (never disk, never the
 * Search pane's 1000-capped result list) and produces preview candidates. Plain
 * substring or JavaScript regex; Match Case and Whole Word (incl. the #384
 * Japanese-aware katakana-compound rule) are honoured through the shared
 * `findTextSearchMatches` helper.
 *
 * Nothing here mutates a buffer or writes a file - `applyReplacementEditsToText`
 * is a pure string transform the caller uses to build the new buffer text.
 * The search query, replace text and regex pattern are never logged.
 */

/** Context characters kept on each side of a match for the preview row. */
const CONTEXT_CHARS = 20;

export interface OpenDocumentReplaceTarget {
  /** Stable per-open-document key (a serialized EditorId in the app). */
  readonly documentId: string;
  /** File name shown as the group header. */
  readonly fileLabel: string;
  /** Optional secondary label (relative path / absolute path). */
  readonly filePath?: string;
  /** The buffer's current text (already `\n`-normalized). */
  readonly text: string;
}

export interface OpenDocumentsReplaceOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly useRegex: boolean;
}

export type OpenDocumentsReplaceResult =
  | { readonly status: "ok"; readonly candidates: ReplacePreviewCandidate[] }
  /** Regex ON, the search pattern will not compile. */
  | { readonly status: "invalidRegex" }
  /** Regex ON, the replacement template failed preflight. */
  | {
      readonly status: "invalidTemplate";
      readonly error: ReplacementTemplateError;
    };

function candidateFromMatch(
  target: OpenDocumentReplaceTarget,
  match: TextSearchMatch,
  afterMatchText: string,
  indexInDocument: number
): ReplacePreviewCandidate {
  const beforeWindow = match.previewText.slice(0, match.previewMatchStart);
  const afterWindow = match.previewText.slice(match.previewMatchEnd);
  const contextBefore = beforeWindow.slice(
    Math.max(0, beforeWindow.length - CONTEXT_CHARS)
  );
  const contextAfter = afterWindow.slice(0, CONTEXT_CHARS);

  return {
    // documentId + offsets keep the id unique even for repeated matches at a
    // shared offset (cannot happen for a single scan, but the index guards it).
    id: `${target.documentId}:${match.startOffset}:${match.endOffset}:${indexInDocument}`,
    fileId: target.documentId,
    fileLabel: target.fileLabel,
    filePath: target.filePath,
    line: match.line,
    column: match.column,
    contextBefore,
    contextAfter,
    truncatedStart: beforeWindow.length > contextBefore.length,
    truncatedEnd: afterWindow.length > contextAfter.length,
    beforeText: match.matchedText,
    afterText: afterMatchText,
    enabled: true,
    documentId: target.documentId,
    startOffset: match.startOffset,
    endOffset: match.endOffset
  };
}

function plainCandidatesForTarget(
  target: OpenDocumentReplaceTarget,
  findText: string,
  replaceText: string,
  options: OpenDocumentsReplaceOptions
): ReplacePreviewCandidate[] {
  const matches = findTextSearchMatches(target.text, findText, {
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    useRegex: false
  });
  return matches.map((match, index) =>
    candidateFromMatch(target, match, replaceText, index)
  );
}

function regexCandidatesForTarget(
  target: OpenDocumentReplaceTarget,
  pattern: string,
  caseSensitive: boolean,
  tokens: readonly ReplacementToken[]
): ReplacePreviewCandidate[] {
  const { regex } = compileSearchRegex(pattern, caseSensitive);
  if (regex === null) {
    return [];
  }

  const lineStarts = lineStartOffsets(target.text);
  const candidates: ReplacePreviewCandidate[] = [];
  regex.lastIndex = 0;

  let execResult: RegExpExecArray | null;
  let indexInDocument = 0;
  while ((execResult = regex.exec(target.text)) !== null) {
    const matchedText = execResult[0];
    if (matchedText.length === 0) {
      // Global exec does not advance past a zero-length match on its own.
      regex.lastIndex += 1;
      continue;
    }
    const start = execResult.index;
    const end = start + matchedText.length;
    const match = createTextSearchMatch(target.text, lineStarts, start, end);
    candidates.push(
      candidateFromMatch(
        target,
        match,
        renderReplacement(tokens, execResult),
        indexInDocument
      )
    );
    indexInDocument += 1;
  }

  return candidates;
}

export function generateOpenDocumentsReplaceCandidates(
  targets: readonly OpenDocumentReplaceTarget[],
  findText: string,
  replaceText: string,
  options: OpenDocumentsReplaceOptions
): OpenDocumentsReplaceResult {
  if (options.useRegex) {
    const compiled = compileSearchRegex(findText, options.caseSensitive);
    if (compiled.regex === null) {
      return { status: "invalidRegex" };
    }

    const validation = validateReplacementTemplate(
      replaceText,
      countCaptureGroups(findText)
    );
    if (!validation.ok) {
      return { status: "invalidTemplate", error: validation.error };
    }

    const candidates: ReplacePreviewCandidate[] = [];
    for (const target of targets) {
      candidates.push(
        ...regexCandidatesForTarget(
          target,
          findText,
          options.caseSensitive,
          validation.tokens
        )
      );
    }
    return { status: "ok", candidates };
  }

  const candidates: ReplacePreviewCandidate[] = [];
  for (const target of targets) {
    candidates.push(
      ...plainCandidatesForTarget(target, findText, replaceText, options)
    );
  }
  return { status: "ok", candidates };
}

export interface ReplacementEdit {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly afterText: string;
}

export interface AppliedReplacements {
  readonly text: string;
  readonly appliedCount: number;
}

/**
 * Apply a set of non-overlapping replacements to `text`.
 *
 * Edits are applied back-to-front (highest `startOffset` first) so an earlier
 * edit's offsets never shift under a later one. An edit that overlaps one
 * already applied - or whose range is out of bounds - is skipped, so a
 * malformed candidate set can never corrupt the buffer.
 */
export function applyReplacementEditsToText(
  text: string,
  edits: readonly ReplacementEdit[]
): AppliedReplacements {
  const ordered = [...edits].sort((a, b) => b.startOffset - a.startOffset);

  let result = text;
  let appliedCount = 0;
  let lowestAppliedStart = text.length + 1;

  for (const edit of ordered) {
    if (
      edit.startOffset < 0 ||
      edit.startOffset > edit.endOffset ||
      edit.endOffset > text.length ||
      edit.endOffset > lowestAppliedStart
    ) {
      continue;
    }
    result =
      result.slice(0, edit.startOffset) +
      edit.afterText +
      result.slice(edit.endOffset);
    lowestAppliedStart = edit.startOffset;
    appliedCount += 1;
  }

  return { text: result, appliedCount };
}
