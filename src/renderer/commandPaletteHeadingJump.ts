/**
 * #141: Command Palette `#` heading-jump mode — pure display / search /
 * selection helpers, mirroring the `:` line-jump (`lineJumpPaletteState.ts`)
 * and prefix-less file quick open (`projectFileQuickOpen.ts`) layers.
 *
 * The Palette never inspects editor internals: App.tsx supplies an ordered
 * `MarkdownHeadingSearchCandidate[]` snapshot (built from the shared
 * `MarkdownOutlineIndex` — no new Markdown parser), and this module turns it
 * into the rendered 2-row candidates, applies the v1 prefix match, resolves
 * the active selection, and builds the footer detail model.
 */

import type { EditorId } from "../shared/editorId";
import type { MarkdownHeadingLevel } from "../shared/markdownOutline";
import type { CommandPaletteFooterModel } from "./CommandPalette";
import type { CommandPaletteMatchRange } from "./commandPaletteEntries";
import type { MarkdownHeadingSearchCandidate } from "./markdownOutlineIndex";

/**
 * Upper bound on rendered heading-jump candidates. The Command Palette has no
 * single shared cap (command mode shows every match); this mirrors the line
 * jump list bound so a document with hundreds of headings stays cheap.
 */
export const DEFAULT_MAX_HEADING_JUMP_CANDIDATES = 50;

export interface CommandPaletteHeadingJumpCandidate {
  /** `${editorKey}::${headingId}` — stable per result. */
  readonly id: string;
  /** `serializeEditorId(editorId)` of the owning open document. */
  readonly documentKey: string;
  readonly editorId: EditorId;
  readonly headingId: string;
  readonly level: MarkdownHeadingLevel;
  /** Heading text, `#`-stripped — the search AND highlight target. */
  readonly text: string;
  readonly lineNumber: number;
  /** Char offset of the heading line start — the jump target (`item.from`). */
  readonly from: number;
  /** `#`.repeat(level) — shown in row 1, never searched or highlighted. */
  readonly marker: string;
  /** Row-2 document path, always `/`-separated. */
  readonly documentPathLabel: string;
  /** Matched prefix range within `text`; `[]` when there is no query. */
  readonly matchRanges: readonly CommandPaletteMatchRange[];
  /** #141 footer detail preview line, or `null`. */
  readonly bodyPreview: string | null;
}

function normalizeHeadingJumpNeedle(value: string): string {
  return value.trim().toLowerCase();
}

function headingJumpDocumentPathLabel(
  candidate: MarkdownHeadingSearchCandidate
): string {
  if (candidate.documentPath === null) {
    // Untitled document — no path; fall back to the tab title.
    return candidate.documentTitle;
  }

  const normalized = candidate.documentPath.replace(/\\/g, "/");

  return candidate.documentKind === "project"
    ? `/${normalized.replace(/^\/+/, "")}`
    : normalized;
}

function toHeadingJumpCandidate(
  candidate: MarkdownHeadingSearchCandidate,
  matchRanges: readonly CommandPaletteMatchRange[]
): CommandPaletteHeadingJumpCandidate {
  return {
    id: candidate.id,
    documentKey: candidate.editorKey,
    editorId: candidate.editorId,
    headingId: candidate.headingId,
    level: candidate.level,
    text: candidate.text,
    lineNumber: candidate.lineNumber,
    from: candidate.from,
    marker: "#".repeat(candidate.level),
    documentPathLabel: headingJumpDocumentPathLabel(candidate),
    matchRanges,
    bodyPreview: candidate.bodyPreview
  };
}

/**
 * v1 semantics: an empty query lists every open-document heading (already
 * ordered active-first by the caller); a non-empty query keeps only headings
 * whose text prefix-matches, case-insensitively — no fuzzy / subsequence /
 * substring. The heading marker is never part of the match.
 */
export function filterCommandPaletteHeadingJumpCandidates(input: {
  readonly candidates: readonly MarkdownHeadingSearchCandidate[];
  readonly query: string;
  readonly limit?: number;
}): CommandPaletteHeadingJumpCandidate[] {
  const limit = input.limit ?? DEFAULT_MAX_HEADING_JUMP_CANDIDATES;
  const needle = normalizeHeadingJumpNeedle(input.query);
  const result: CommandPaletteHeadingJumpCandidate[] = [];

  for (const candidate of input.candidates) {
    if (result.length >= limit) {
      break;
    }

    if (needle.length === 0) {
      result.push(toHeadingJumpCandidate(candidate, []));
      continue;
    }

    if (candidate.text.toLowerCase().startsWith(needle)) {
      result.push(
        toHeadingJumpCandidate(candidate, [
          { start: 0, end: Math.min(needle.length, candidate.text.length) }
        ])
      );
    }
  }

  return result;
}

export function resolveHeadingJumpSelection(
  candidates: readonly CommandPaletteHeadingJumpCandidate[],
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

/**
 * Footer model for `#` heading-jump mode. When footer detail is enabled and
 * the selected heading has a body preview line, it rides the #370/#372 footer
 * detail channel (`detailText` + `detailResetKey`); `detailResetKey` includes
 * the candidate id so the marquee resets on selection change.
 */
export function resolveHeadingJumpFooterModel(input: {
  readonly activeCandidate: CommandPaletteHeadingJumpCandidate | null;
  readonly detailEnabled: boolean;
}): CommandPaletteFooterModel {
  const canRunSelected = input.activeCandidate !== null;
  const bodyPreview = input.activeCandidate?.bodyPreview ?? null;

  if (input.detailEnabled && bodyPreview !== null && bodyPreview.length > 0) {
    return {
      statusKey: null,
      detailText: bodyPreview,
      detailResetKey: `headingJumpPreview:${input.activeCandidate!.id}`,
      canRunSelected
    };
  }

  return { statusKey: null, canRunSelected };
}
