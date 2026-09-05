/**
 * #390 PoC: pure helpers for Ctrl+Space Glossary Completion.
 *
 * Candidate SOURCE mirrors `commandPaletteGlossaryJump.ts`'s
 * `collectGlossaryJumpAtoms` (every project Glossary entry's non-empty
 * registered form, "Atom" internally - never surfaced to the user), but is
 * deliberately its OWN copy: this module must stay free-standing so changes
 * here can never affect the Command Palette `@` Glossary Jump mode (#142) or
 * the Search pane's own atom picker (#384).
 *
 * Candidate unit is the registered form. Tags and entry descriptions are
 * never part of the flattened atom list, so they are never matched.
 */

import { representativeGlossaryAtom, type GlossaryEntry } from "../shared/glossary";

/** Upper bound on rendered completion candidates - a large glossary must not
 *  flood the popup. Candidates are truncated from the front of the given
 *  (sortOrder-ordered) sequence, so the limit never reorders anything. */
export const GLOSSARY_COMPLETION_CANDIDATE_LIMIT = 200;

/** Caret-preceding window (in characters) the "better Japanese" suffix
 *  strategy searches within - see `extractGlossaryCompletionPrefix`. */
export const GLOSSARY_COMPLETION_SUFFIX_LOOKBACK = 10;

/** One flattened, project-ordered registered form - the candidate SOURCE. */
export interface GlossaryCompletionAtom {
  readonly atomId: string;
  readonly entryId: string;
  readonly value: string;
  readonly entryLabel: string;
}

/** One completion candidate, ready to render / insert. */
export interface GlossaryCompletionCandidate {
  readonly id: string;
  readonly entryId: string;
  readonly atomId: string;
  /** The matching registered form - both the label and the insert value. */
  readonly value: string;
  /** The parent entry's representative form. */
  readonly entryLabel: string;
}

/**
 * Flattens `entries` into every atom with a non-empty trim-normalized value,
 * in `entries`' own array order (the project's Entry sortOrder) and then each
 * entry's atom `sortOrder` (atoms already arrive pre-sorted per
 * `GlossaryEntry.atoms`). Empty-value atoms are dropped; Tags and
 * descriptions are never part of this list.
 */
export function collectGlossaryCompletionAtoms(
  entries: readonly GlossaryEntry[]
): GlossaryCompletionAtom[] {
  const rows: GlossaryCompletionAtom[] = [];

  for (const entry of entries) {
    const entryLabel = representativeGlossaryAtom(entry)?.value ?? entry.id;

    for (const atom of entry.atoms) {
      if (atom.value.trim().length === 0) {
        continue;
      }

      rows.push({
        atomId: atom.id,
        entryId: entry.id,
        value: atom.value,
        entryLabel
      });
    }
  }

  return rows;
}

function normalizeGlossaryCompletionText(value: string): string {
  // Latin case-insensitive, Japanese unaffected - mirrors
  // commandPaletteGlossaryJump.ts's normalizeGlossaryJumpNeedle policy.
  return value.toLowerCase();
}

/**
 * The candidate's `detail` text - `"→ "` plus the parent entry's
 * representative form - or `null` when it would just repeat the registered
 * form itself (the common case: most forms ARE their entry's representative
 * form, so showing it again next to itself is pure noise). No "親語彙:" /
 * "Atom" label text - just the arrow and the bare representative form. Atom
 * values are already stored trimmed (see `GlossaryAtom.value`'s own doc
 * comment), but this still trim-normalizes both sides defensively before
 * comparing.
 */
export function glossaryCompletionCandidateDetail(
  candidate: Pick<GlossaryCompletionCandidate, "value" | "entryLabel">
): string | null {
  return candidate.value.trim() === candidate.entryLabel.trim()
    ? null
    : `→ ${candidate.entryLabel}`;
}

/**
 * v1 semantics: prefix `startsWith` only, never fuzzy / substring /
 * subsequence. An empty prefix yields every candidate, unfiltered, in the
 * given (project-ordered) sequence - a bare Ctrl+Space lists the whole
 * glossary top-to-bottom, exactly like an empty Command Palette `@` query.
 */
export function filterGlossaryCompletionCandidates(input: {
  readonly atoms: readonly GlossaryCompletionAtom[];
  readonly prefix: string;
  readonly limit?: number;
}): GlossaryCompletionCandidate[] {
  const needle = normalizeGlossaryCompletionText(input.prefix);
  const limit = input.limit ?? GLOSSARY_COMPLETION_CANDIDATE_LIMIT;
  const result: GlossaryCompletionCandidate[] = [];

  for (const atom of input.atoms) {
    if (result.length >= limit) {
      break;
    }

    if (
      needle.length > 0 &&
      !normalizeGlossaryCompletionText(atom.value).startsWith(needle)
    ) {
      continue;
    }

    result.push({
      id: atom.atomId,
      entryId: atom.entryId,
      atomId: atom.atomId,
      value: atom.value,
      entryLabel: atom.entryLabel
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Prefix extraction
// ---------------------------------------------------------------------------

// Whitespace, punctuation, brackets, and common Markdown symbols - a
// contiguous run of caret-preceding characters none of which are in this set
// is taken as the delimiter-based prefix. Deliberately excludes the
// Japanese prolonged sound mark "ー" (part of words like "オーダー").
const GLOSSARY_COMPLETION_DELIMITER_CHARS = new Set(
  Array.from(
    " \t\r\n　" +
      ",.，。、！!？?；;：:" +
      "()[]{}「」『』（）［］｛｝【】〈〉《》" +
      "\"'`" +
      "*_#~>|\\/／・"
  )
);

function isGlossaryCompletionDelimiterChar(char: string): boolean {
  return GLOSSARY_COMPLETION_DELIMITER_CHARS.has(char);
}

/**
 * PoC v1 baseline: caret-preceding text up to the nearest delimiter (space,
 * punctuation, bracket, Markdown symbol, ...). No knowledge of the actual
 * Glossary candidates is needed - a pure function of the text alone.
 */
export function extractDelimitedGlossaryCompletionPrefix(
  textBeforeCaret: string
): string {
  let index = textBeforeCaret.length;

  while (
    index > 0 &&
    !isGlossaryCompletionDelimiterChar(textBeforeCaret[index - 1])
  ) {
    index -= 1;
  }

  return textBeforeCaret.slice(index);
}

/**
 * Better-for-Japanese prefix extraction: Japanese has no word boundaries, so
 * a delimiter-only scan can't isolate e.g. "アレ" out of "彼はアレ". This
 * instead searches the last `GLOSSARY_COMPLETION_SUFFIX_LOOKBACK` characters
 * before the caret for the LONGEST suffix that is itself a `startsWith`
 * prefix of some registered Glossary form, and uses that as the completion
 * prefix / replace range. Falls back to
 * {@link extractDelimitedGlossaryCompletionPrefix} when no such suffix
 * exists (covers every v1 baseline case too, since a delimiter-bounded word
 * that IS a real prefix is found by the same search whenever it fits within
 * the lookback window).
 */
export function extractGlossaryCompletionPrefix(
  textBeforeCaret: string,
  candidateValues: readonly string[]
): string {
  const windowStart = Math.max(
    0,
    textBeforeCaret.length - GLOSSARY_COMPLETION_SUFFIX_LOOKBACK
  );
  const window = textBeforeCaret.slice(windowStart);
  const normalizedCandidates = candidateValues.map((value) =>
    normalizeGlossaryCompletionText(value)
  );

  for (let length = window.length; length > 0; length -= 1) {
    const suffix = window.slice(window.length - length);
    const needle = normalizeGlossaryCompletionText(suffix);
    const hasMatch = normalizedCandidates.some((value) =>
      value.startsWith(needle)
    );

    if (hasMatch) {
      return suffix;
    }
  }

  return extractDelimitedGlossaryCompletionPrefix(textBeforeCaret);
}
