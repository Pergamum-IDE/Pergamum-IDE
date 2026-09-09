/**
 * #424 Slice 4 — the candidate source for the active-document Find panel's
 * `語彙` (Vocabulary) surfaces: the Slice 5 Ctrl+Space IntelliSense and the
 * Slice 6 glossary-search-mode selectors.
 *
 * Flattens every project glossary entry's registered forms in the PROJECT'S
 * OWN entry / atom order (never the Search pane's label-sorted
 * `collectSelectableGlossaryAtoms`). The SELECTED atom's RAW value is always
 * used — never normalized to the entry's representative form. Each row also
 * carries `matchFlags` so Slice 6 can drive the shared glossary surface
 * matcher (`glossaryAtomSearch.ts`) exactly as the Search pane / Document Map
 * do.
 */
import {
  representativeGlossaryAtom,
  type GlossaryEntry
} from "../../shared/glossary";

/** One selectable row in the Find panel's `語彙` surfaces. */
export interface FindGlossaryCandidate {
  readonly atomId: string;
  readonly entryId: string;
  /** The atom's authored value — used verbatim (search surface / insert text). */
  readonly value: string;
  /**
   * The atom's machine-match bitmask (boundary policies + single-char opt-in),
   * so Slice 6's glossary search honours the same settings as the Glossary.
   */
  readonly matchFlags: number;
  /**
   * The parent entry's representative form — the context line for a
   * non-representative atom (e.g. `迷子 → シズク`). Falls back to the entry id.
   */
  readonly entryLabel: string;
  /** `true` when this atom IS its entry's representative form. */
  readonly isRepresentative: boolean;
}

/**
 * Every non-empty registered form across `entries`, in the project's own entry
 * order then each entry's atom `sortOrder`, tagged with whether it is its
 * entry's representative atom (so a `→ 代表語` context line shows only for the
 * non-representative ones).
 */
export function collectFindGlossaryCandidates(
  entries: readonly GlossaryEntry[]
): FindGlossaryCandidate[] {
  const rows: FindGlossaryCandidate[] = [];

  for (const entry of entries) {
    const representative = representativeGlossaryAtom(entry);
    const entryLabel = representative?.value ?? entry.id;
    for (const atom of entry.atoms) {
      if (atom.value.trim().length === 0) {
        continue;
      }
      rows.push({
        atomId: atom.id,
        entryId: entry.id,
        value: atom.value,
        matchFlags: atom.matchFlags,
        entryLabel,
        isRepresentative: representative?.id === atom.id
      });
    }
  }

  return rows;
}

/**
 * Case-insensitive substring filter over `value` and `entryLabel`, preserving
 * candidate order. An empty / whitespace-only filter returns every candidate.
 */
export function filterFindGlossaryCandidates(
  candidates: readonly FindGlossaryCandidate[],
  filter: string
): FindGlossaryCandidate[] {
  const needle = filter.trim().toLowerCase();
  if (needle.length === 0) {
    return [...candidates];
  }
  return candidates.filter(
    (candidate) =>
      candidate.value.toLowerCase().includes(needle) ||
      candidate.entryLabel.toLowerCase().includes(needle)
  );
}
