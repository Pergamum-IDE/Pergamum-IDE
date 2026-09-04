import {
  representativeGlossaryAtom,
  type GlossaryAtom,
  type GlossaryEntry
} from "../shared/glossary";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesInText
} from "../shared/glossarySurfaceMatching";
import {
  createTextSearchMatch,
  lineStartOffsets,
  type TextSearchMatch
} from "../shared/textSearch";

/**
 * #384 Glossary Atom Search - the pure helpers behind the Search pane's
 * `語彙検索` mode.
 *
 * In this mode the query is not free text: the user picks one or more
 * GlossaryAtoms and each atom's value is OR-searched across the project's
 * Markdown files, USING THAT ATOM'S MACHINE-MATCH SETTINGS. Matching goes
 * through the exact same surface-index helper the Glossary pane / Document Map
 * / Document Metrics use for occurrence detection
 * ({@link buildGlossarySurfaceIndex} / {@link matchGlossarySurfacesInText}), so
 * a strict-boundary atom like `ジャン` does not hit `ジャンヌ` / `ヴァルジャン`
 * and the Search pane result count matches what the rest of the app reports.
 * No tokenizer, no morphological analysis, no separate boundary rule.
 */

/** One selectable row in the atom picker (an atom plus its entry context). */
export interface SelectableGlossaryAtom {
  readonly atomId: string;
  readonly entryId: string;
  /** The atom's authored value (non-empty; empty atoms are dropped). */
  readonly value: string;
  /** The atom's `matchFlags` bitmask (boundary policies + single-char opt-in),
   *  so the search honours the same machine-match settings as the Glossary. */
  readonly matchFlags: number;
  /** The parent entry's representative atom value - the picker's second line
   *  and the result row / chip tooltip. Falls back to the entry id. */
  readonly entryLabel: string;
}

/** A resolved OR term: one selected atom's value, match settings and identity. */
export interface GlossaryAtomSearchTerm {
  readonly value: string;
  readonly matchFlags: number;
  readonly atomId: string;
  readonly entryId: string;
  readonly entryLabel: string;
}

/**
 * #384 Glossary Search relation mode.
 * - `any`    — OR: show any occurrence of any selected atom (v1 behaviour).
 * - `all`    — show a PARAGRAPH (blank-line block) that contains every
 *              selected atom at least once.
 * - `nearby` — show a window at most {@link NEARBY_WINDOW_CHARACTERS} wide
 *              that contains every selected atom.
 */
export type GlossarySearchRelationMode = "any" | "all" | "nearby";

/** `nearby` window width in UTF-16 code units (~one 400-char manuscript page).
 *  Not user-configurable in this phase. */
export const NEARBY_WINDOW_CHARACTERS = 400;

/** One selected atom's representative occurrence inside an `all` / `nearby`
 *  group result. */
export interface GlossarySearchMatchAtom {
  readonly atomId: string;
  readonly atomValue: string;
  readonly entryId: string;
  readonly entryLabel: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

/** A `TextSearchMatch` that carries the glossary atom / entry it came from. */
export interface GlossarySearchMatch extends TextSearchMatch {
  readonly glossaryAtomId: string;
  readonly glossaryAtomValue: string;
  readonly glossaryEntryId: string;
  readonly glossaryEntryLabel: string;
  /** The relation mode that produced this row. Absent / `any` for OR matches. */
  readonly glossaryRelationMode?: GlossarySearchRelationMode;
  /** `all` / `nearby`: every selected atom's representative occurrence covered
   *  by this group (length >= 2). Absent for `any` match rows. */
  readonly glossaryAtoms?: readonly GlossarySearchMatchAtom[];
}

/** Narrow a `TextSearchMatch` to a glossary-search match. */
export function isGlossarySearchMatch(
  match: TextSearchMatch
): match is GlossarySearchMatch {
  return typeof (match as GlossarySearchMatch).glossaryAtomId === "string";
}

/**
 * Every atom across `entries`, flattened for the picker. Atoms whose value is
 * empty or whitespace-only are dropped (they cannot be searched). Ordered by
 * the parent entry's representative label, then the atom's `sortOrder`, so the
 * list reads like the Glossary pane.
 */
export function collectSelectableGlossaryAtoms(
  entries: readonly GlossaryEntry[]
): SelectableGlossaryAtom[] {
  const rows: Array<{
    row: SelectableGlossaryAtom;
    entrySort: string;
    atomSort: number;
  }> = [];

  for (const entry of entries) {
    const entryLabel = representativeGlossaryAtom(entry)?.value ?? entry.id;
    for (const atom of entry.atoms) {
      if (atom.value.trim().length === 0) {
        continue;
      }
      rows.push({
        row: {
          atomId: atom.id,
          entryId: entry.id,
          value: atom.value,
          matchFlags: atom.matchFlags,
          entryLabel
        },
        entrySort: entryLabel,
        atomSort: atom.sortOrder
      });
    }
  }

  rows.sort(
    (left, right) =>
      left.entrySort.localeCompare(right.entrySort) ||
      left.atomSort - right.atomSort
  );

  return rows.map((entry) => entry.row);
}

/**
 * The OR terms for `selectedAtomIds`, in selection order. Unknown ids and
 * empty-value atoms are skipped; the same atom id is never emitted twice.
 */
export function buildGlossaryAtomSearchTerms(
  atoms: readonly SelectableGlossaryAtom[],
  selectedAtomIds: Iterable<string>
): GlossaryAtomSearchTerm[] {
  const byId = new Map(atoms.map((atom) => [atom.atomId, atom]));
  const seen = new Set<string>();
  const terms: GlossaryAtomSearchTerm[] = [];

  for (const atomId of selectedAtomIds) {
    if (seen.has(atomId)) {
      continue;
    }
    seen.add(atomId);

    const atom = byId.get(atomId);
    if (!atom || atom.value.trim().length === 0) {
      continue;
    }
    terms.push({
      value: atom.value,
      matchFlags: atom.matchFlags,
      atomId: atom.atomId,
      entryId: atom.entryId,
      entryLabel: atom.entryLabel
    });
  }

  return terms;
}

export interface FindGlossaryAtomMatchesOptions {
  /** Stop after this many result rows (per document). `0` / omitted = no cap. */
  readonly limit?: number;
}

function resolveLimit(limit: number | undefined): number {
  return typeof limit === "number" && limit > 0
    ? limit
    : Number.POSITIVE_INFINITY;
}

const SYNTHETIC_TIMESTAMP = "";

/** Rebuild minimal `GlossaryEntry` objects (one per entry id) that carry only
 *  the selected atoms, so {@link buildGlossarySurfaceIndex} can index them. */
function syntheticEntriesFromTerms(
  terms: readonly GlossaryAtomSearchTerm[]
): GlossaryEntry[] {
  const byEntryId = new Map<string, GlossaryEntry>();

  for (const term of terms) {
    let entry = byEntryId.get(term.entryId);
    if (!entry) {
      entry = {
        id: term.entryId,
        description: "",
        atoms: [],
        tags: [],
        createdAt: SYNTHETIC_TIMESTAMP,
        updatedAt: SYNTHETIC_TIMESTAMP
      };
      byEntryId.set(term.entryId, entry);
    }

    const atom: GlossaryAtom = {
      id: term.atomId,
      entryId: term.entryId,
      sortOrder: entry.atoms.length,
      value: term.value,
      matchFlags: term.matchFlags,
      createdAt: SYNTHETIC_TIMESTAMP,
      updatedAt: SYNTHETIC_TIMESTAMP
    };
    entry.atoms.push(atom);
  }

  return [...byEntryId.values()];
}

/**
 * OR search of the selected atoms over `text`, honouring each atom's
 * `matchFlags` (start / end boundary policies, single-character opt-in) exactly
 * as glossary occurrence detection does. Matches are non-overlapping and, at
 * any given position, the longest atom surface wins (so `ジャンヌ` is preferred
 * over `ジャン`). Each result carries the (first) atom / entry that produced it.
 */
export function findGlossaryAtomMatches(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  options: FindGlossaryAtomMatchesOptions = {}
): GlossarySearchMatch[] {
  if (text.length === 0) {
    return [];
  }

  const usableTerms = terms.filter((term) => term.value.trim().length > 0);
  if (usableTerms.length === 0) {
    return [];
  }

  const limit = resolveLimit(options.limit);

  const entryLabelByAtomId = new Map(
    usableTerms.map((term) => [term.atomId, term.entryLabel])
  );

  const index = buildGlossarySurfaceIndex(syntheticEntriesFromTerms(usableTerms));
  const surfaceMatches = matchGlossarySurfacesInText(text, index);
  if (surfaceMatches.length === 0) {
    return [];
  }

  const lineStarts = lineStartOffsets(text);
  const matches: GlossarySearchMatch[] = [];

  for (const surfaceMatch of surfaceMatches) {
    if (matches.length >= limit) {
      break;
    }
    // Candidates are sorted (entryId, atomId); the range is already the
    // longest surface at this position, so any candidate is a valid label.
    const [primary] = surfaceMatch.candidates;
    if (!primary) {
      continue;
    }
    matches.push({
      ...createTextSearchMatch(
        text,
        lineStarts,
        surfaceMatch.range.start,
        surfaceMatch.range.end
      ),
      glossaryAtomId: primary.atomId,
      glossaryAtomValue: primary.surface,
      glossaryEntryId: primary.entryId,
      glossaryEntryLabel: entryLabelByAtomId.get(primary.atomId) ?? primary.entryId
    });
  }

  return matches;
}

/**
 * Dispatch by relation mode. `any` is the OR search above; `all` / `nearby`
 * return GROUP rows (one per qualifying paragraph / window) whose
 * `glossaryAtoms` lists every selected atom's occurrence.
 */
export function findGlossaryAtomRelationMatches(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  relationMode: GlossarySearchRelationMode,
  options: FindGlossaryAtomMatchesOptions = {}
): GlossarySearchMatch[] {
  if (relationMode === "all") {
    return findGlossaryAtomAllMatches(text, terms, options);
  }
  if (relationMode === "nearby") {
    return findGlossaryAtomNearbyMatches(text, terms, options);
  }
  return findGlossaryAtomMatches(text, terms, options);
}

interface TermOccurrences {
  readonly term: GlossaryAtomSearchTerm;
  readonly hits: readonly GlossarySearchMatch[];
}

/** Each term's own occurrences (unambiguous — one term per pass). */
function collectTermOccurrences(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[]
): TermOccurrences[] {
  return terms.map((term) => ({
    term,
    hits: findGlossaryAtomMatches(text, [term], {})
  }));
}

function occurrenceOf(
  term: GlossaryAtomSearchTerm,
  hit: GlossarySearchMatch
): GlossarySearchMatchAtom {
  return {
    atomId: term.atomId,
    atomValue: hit.glossaryAtomValue,
    entryId: term.entryId,
    entryLabel: term.entryLabel,
    startOffset: hit.startOffset,
    endOffset: hit.endOffset
  };
}

/** Build a group result anchored at the earliest atom occurrence. */
function groupMatch(
  text: string,
  lineStarts: readonly number[],
  atoms: readonly GlossarySearchMatchAtom[],
  relationMode: GlossarySearchRelationMode
): GlossarySearchMatch {
  const ordered = [...atoms].sort(
    (left, right) =>
      left.startOffset - right.startOffset || left.endOffset - right.endOffset
  );
  const anchor = ordered[0];

  return {
    ...createTextSearchMatch(
      text,
      lineStarts,
      anchor.startOffset,
      anchor.endOffset
    ),
    glossaryAtomId: anchor.atomId,
    glossaryAtomValue: anchor.atomValue,
    glossaryEntryId: anchor.entryId,
    glossaryEntryLabel: anchor.entryLabel,
    glossaryRelationMode: relationMode,
    glossaryAtoms: ordered
  };
}

/**
 * Blank-line-separated paragraphs of `text` as `[start, end)` code-unit
 * ranges. A "paragraph" is a run of consecutive lines that each contain a
 * non-whitespace character; whitespace-only lines are separators. No Markdown
 * AST — this is the deliberately simple v1 split.
 */
export function splitTextParagraphs(
  text: string
): Array<{ start: number; end: number }> {
  const paragraphs: Array<{ start: number; end: number }> = [];
  const paragraphPattern = /[^\n]*\S[^\n]*(?:\n[^\n]*\S[^\n]*)*/g;
  let match: RegExpExecArray | null;
  while ((match = paragraphPattern.exec(text)) !== null) {
    paragraphs.push({
      start: match.index,
      end: match.index + match[0].length
    });
    if (match[0].length === 0) {
      paragraphPattern.lastIndex += 1;
    }
  }
  return paragraphs;
}

function findGlossaryAtomAllMatches(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  options: FindGlossaryAtomMatchesOptions
): GlossarySearchMatch[] {
  const usableTerms = terms.filter((term) => term.value.trim().length > 0);
  if (text.length === 0 || usableTerms.length === 0) {
    return [];
  }

  const perTerm = collectTermOccurrences(text, usableTerms);
  if (perTerm.some(({ hits }) => hits.length === 0)) {
    return [];
  }

  const limit = resolveLimit(options.limit);
  const lineStarts = lineStartOffsets(text);
  const results: GlossarySearchMatch[] = [];

  for (const paragraph of splitTextParagraphs(text)) {
    if (results.length >= limit) {
      break;
    }

    const atoms: GlossarySearchMatchAtom[] = [];
    let complete = true;
    for (const { term, hits } of perTerm) {
      const inParagraph = hits.find(
        (hit) =>
          hit.startOffset >= paragraph.start && hit.endOffset <= paragraph.end
      );
      if (!inParagraph) {
        complete = false;
        break;
      }
      atoms.push(occurrenceOf(term, inParagraph));
    }
    if (!complete) {
      continue;
    }

    results.push(groupMatch(text, lineStarts, atoms, "all"));
  }

  return results;
}

function findGlossaryAtomNearbyMatches(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  options: FindGlossaryAtomMatchesOptions
): GlossarySearchMatch[] {
  const usableTerms = terms.filter((term) => term.value.trim().length > 0);
  if (text.length === 0 || usableTerms.length === 0) {
    return [];
  }

  const perTerm = collectTermOccurrences(text, usableTerms);
  if (perTerm.some(({ hits }) => hits.length === 0)) {
    return [];
  }

  // Every occurrence, tagged with its term index, in document order.
  const flat: Array<{ termIndex: number; occurrence: GlossarySearchMatchAtom }> =
    [];
  perTerm.forEach(({ term, hits }, termIndex) => {
    for (const hit of hits) {
      flat.push({ termIndex, occurrence: occurrenceOf(term, hit) });
    }
  });
  flat.sort(
    (left, right) =>
      left.occurrence.startOffset - right.occurrence.startOffset ||
      left.occurrence.endOffset - right.occurrence.endOffset
  );

  const need = usableTerms.length;
  const limit = resolveLimit(options.limit);
  const lineStarts = lineStartOffsets(text);
  const counts = new Array<number>(need).fill(0);
  const results: GlossarySearchMatch[] = [];
  let distinctTerms = 0;
  let low = 0;
  let lastWindowStart = -1;

  for (let high = 0; high < flat.length; high += 1) {
    if (counts[flat[high].termIndex]++ === 0) {
      distinctTerms += 1;
    }
    // Shrink to the smallest window ending at `high` that still holds them all.
    while (distinctTerms === need && counts[flat[low].termIndex] > 1) {
      counts[flat[low].termIndex] -= 1;
      low += 1;
    }
    if (distinctTerms !== need) {
      continue;
    }

    const windowStart = flat[low].occurrence.startOffset;
    const windowEnd = flat[high].occurrence.endOffset;
    if (windowEnd - windowStart > NEARBY_WINDOW_CHARACTERS) {
      continue;
    }
    // Dedupe: one result per distinct leading occurrence.
    if (windowStart === lastWindowStart) {
      continue;
    }
    lastWindowStart = windowStart;

    const firstByTerm = new Map<number, GlossarySearchMatchAtom>();
    for (let index = low; index <= high; index += 1) {
      if (!firstByTerm.has(flat[index].termIndex)) {
        firstByTerm.set(flat[index].termIndex, flat[index].occurrence);
      }
    }
    results.push(
      groupMatch(text, lineStarts, [...firstByTerm.values()], "nearby")
    );
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}
