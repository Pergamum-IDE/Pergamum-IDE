/**
 * #142: Command Palette `@` / `＠` Glossary Jump mode - pure display / search /
 * selection helpers, mirroring the `#` heading-jump layer
 * (`commandPaletteHeadingJump.ts`).
 *
 * The candidate SOURCE is {@link collectGlossaryJumpAtoms} - every project
 * Glossary entry's non-empty registered forms, flattened while preserving the
 * PROJECT'S OWN entry order (`glossary_entries.sort_order`, i.e. the array
 * order of the `GlossaryEntry[]` App.tsx already hands the Palette / the
 * Search pane) and each entry's atom `sortOrder`. This is deliberately its
 * OWN flattening, not the Search pane's `collectSelectableGlossaryAtoms`
 * (#384, entry-LABEL-sorted) - #142.1 needs "Entry sortOrder -> Atom
 * sortOrder" browsing order for an empty query, and the Search pane's atom
 * picker behaviour must not change.
 *
 * Candidate unit is the registered form ("Atom" internally - never surfaced to
 * the user, who sees "表記" / "form"). Tags and entry descriptions are not
 * part of the flattened atom list at all, so they are never searched.
 */

import {
  representativeGlossaryAtom,
  type GlossaryEntry,
  type GlossaryEntryId
} from "../shared/glossary";
import {
  createNormalizedTextWithSourceMap,
  mapNormalizedRangeToSourceRange
} from "../shared/normalizedTextSourceMap";
import type { CommandPaletteMatchRange } from "./commandPaletteEntries";

/** Upper bound on rendered glossary-jump candidates, mirroring the heading-jump
 *  list bound - a large glossary must not flood the Palette. */
export const DEFAULT_MAX_GLOSSARY_JUMP_CANDIDATES = 50;

/** One flattened, project-ordered registered form - the candidate SOURCE. */
export interface CommandPaletteGlossaryJumpAtom {
  readonly atomId: string;
  readonly entryId: GlossaryEntryId;
  readonly value: string;
  readonly entryLabel: string;
}

export interface CommandPaletteGlossaryJumpCandidate {
  /** The matching atom's id - stable and unique across the project. */
  readonly id: string;
  readonly entryId: GlossaryEntryId;
  readonly atomId: string;
  /** The matching registered form ("表記") - row 1 and the highlight target. */
  readonly value: string;
  /** The parent entry's representative form - row 2. */
  readonly entryLabel: string;
  /** Matched prefix range within `value`; empty for an unfiltered (empty
   *  query) browse candidate - nothing is highlighted when nothing was typed. */
  readonly matchRanges: readonly CommandPaletteMatchRange[];
}

/**
 * Flattens `entries` into every atom with a non-empty trim-normalized value,
 * in `entries`' own array order (the project's Entry sortOrder) and then each
 * entry's atom `sortOrder` (atoms already arrive pre-sorted per
 * `GlossaryEntry.atoms`, so no re-sort is needed there). Empty-value atoms are
 * dropped; Tags and descriptions are never part of this list.
 */
export function collectGlossaryJumpAtoms(
  entries: readonly GlossaryEntry[]
): CommandPaletteGlossaryJumpAtom[] {
  const rows: CommandPaletteGlossaryJumpAtom[] = [];

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

function normalizeGlossaryJumpQuery(
  value: string,
  normalizeToNfc: boolean = false
): string {
  // Query text is trimmed + lowercased (Latin case-insensitive, Japanese unaffected).
  // Optional NFC normalization when workbench.normalizeUnicodeToNfc setting is enabled.
  const text = normalizeToNfc ? value.normalize("NFC") : value;
  return text.trim().toLowerCase();
}

function normalizeGlossaryJumpAtomValue(
  value: string,
  normalizeToNfc: boolean = false
): string {
  // Atom values are lowercased ONLY (never trimmed) - preserves raw atom matching semantics.
  // Optional NFC normalization when workbench.normalizeUnicodeToNfc setting is enabled.
  const text = normalizeToNfc ? value.normalize("NFC") : value;
  return text.toLowerCase();
}

/**
 * v1 semantics: prefix `startsWith` only, never fuzzy / substring / subsequence.
 *
 * #142.1: an EMPTY query no longer yields no candidates - it lists every
 * candidate atom, unfiltered, in `atoms`' given (project-ordered) sequence,
 * so a bare `@` can be browsed top-to-bottom like the Glossary Manager. A
 * non-empty query narrows that same ordering down to prefix matches.
 */
export function filterCommandPaletteGlossaryJumpCandidates(input: {
  readonly atoms: readonly CommandPaletteGlossaryJumpAtom[];
  readonly query: string;
  readonly limit?: number;
  readonly normalizeUnicodeToNfc?: boolean;
}): CommandPaletteGlossaryJumpCandidate[] {
  const normalizeToNfc = input.normalizeUnicodeToNfc ?? false;
  const needle = normalizeGlossaryJumpQuery(input.query, normalizeToNfc);
  const rawQueryLength = input.query.trim().length;
  const limit = input.limit ?? DEFAULT_MAX_GLOSSARY_JUMP_CANDIDATES;
  const result: CommandPaletteGlossaryJumpCandidate[] = [];

  for (const atom of input.atoms) {
    if (result.length >= limit) {
      break;
    }

    let matchRanges: CommandPaletteMatchRange[] = [];

    if (needle.length > 0) {
      const sourceMap = createNormalizedTextWithSourceMap(atom.value, {
        normalizeToNfc
      });
      const atomKey = normalizeGlossaryJumpAtomValue(
        sourceMap.normalizedText,
        false
      );

      if (atomKey.startsWith(needle)) {
        if (normalizeToNfc) {
          const mapped = mapNormalizedRangeToSourceRange(
            sourceMap,
            0,
            needle.length
          );
          const end = mapped
            ? mapped.end
            : Math.min(rawQueryLength, atom.value.length);
          matchRanges = [{ start: 0, end: Math.min(end, atom.value.length) }];
        } else {
          matchRanges = [
            { start: 0, end: Math.min(rawQueryLength, atom.value.length) }
          ];
        }
      } else {
        continue;
      }
    }

    result.push({
      id: atom.atomId,
      entryId: atom.entryId,
      atomId: atom.atomId,
      value: atom.value,
      entryLabel: atom.entryLabel,
      matchRanges
    });
  }

  return result;
}

export function resolveGlossaryJumpSelection(
  rowCount: number,
  currentIndex: number | null = null
): number | null {
  if (rowCount <= 0) {
    return null;
  }

  return currentIndex !== null && currentIndex >= 0 && currentIndex < rowCount
    ? currentIndex
    : 0;
}
