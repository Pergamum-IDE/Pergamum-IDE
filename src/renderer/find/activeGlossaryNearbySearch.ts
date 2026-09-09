/**
 * #424 Slice 7 — the `近傍` (Nearby) relation for the active Find panel's
 * Glossary search mode (Search tab, multi-atom selection only).
 *
 * "Nearby" = every selected Glossary Atom occurs within a configured range of
 * the others. Two units:
 *  - `"characters"` — the largest gap between consecutive participating
 *    occurrences is `<= characterDistance` (overlapping / adjacent = gap 0).
 *  - `"paragraphs"` — `max(paragraphIndex) - min(paragraphIndex) <=
 *    paragraphDistance` across the participating occurrences (blank-line split;
 *    `0` = same paragraph only).
 *
 * Only the occurrences that PARTICIPATE in at least one satisfying window are
 * returned (for mark-all highlight / prev-next navigation) — never group rows.
 * Matching itself reuses the shared glossary surface matcher via
 * `findGlossaryAtomMatches` (matchFlags respected, RAW atom value, no
 * representative normalization), so the ranges are CodeMirror-compatible and
 * agree with the rest of the app.
 */
import {
  findGlossaryAtomMatches,
  splitTextParagraphs,
  type GlossaryAtomSearchTerm
} from "../glossaryAtomSearch";
import type { TextSearchMatch } from "../../shared/textSearch";
import { ACTIVE_GLOSSARY_FIND_MATCH_LIMIT } from "./activeGlossaryFind";

export type ActiveGlossaryNearbyUnit = "characters" | "paragraphs";

export interface ActiveGlossaryNearbySettings {
  readonly unit: ActiveGlossaryNearbyUnit;
  readonly characterDistance: number;
  readonly paragraphDistance: number;
}

/** Catalog-backed defaults (see settingsCatalog.ts `search.nearby.*`). */
export const DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS: ActiveGlossaryNearbySettings =
  {
    unit: "paragraphs",
    characterDistance: 500,
    paragraphDistance: 2
  };

export interface ActiveGlossaryParagraph {
  readonly index: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Blank-line-separated paragraph blocks of `text` (whitespace-only lines are
 * separators), each `[startOffset, endOffset)` in JS string offsets. Headings /
 * lists / fenced code are treated as ordinary text (Slice 7 simplification).
 */
export function segmentParagraphs(text: string): ActiveGlossaryParagraph[] {
  return splitTextParagraphs(text).map((paragraph, index) => ({
    index,
    startOffset: paragraph.start,
    endOffset: paragraph.end
  }));
}

/** The paragraph index containing `offset`, or `null` when it falls in a gap. */
export function findParagraphIndexForOffset(
  paragraphs: readonly ActiveGlossaryParagraph[],
  offset: number
): number | null {
  for (const paragraph of paragraphs) {
    if (offset >= paragraph.startOffset && offset < paragraph.endOffset) {
      return paragraph.index;
    }
  }
  const last = paragraphs[paragraphs.length - 1];
  if (last && offset >= last.startOffset && offset <= last.endOffset) {
    return last.index;
  }
  return null;
}

interface FlatOccurrence {
  readonly termIndex: number;
  readonly match: TextSearchMatch;
}

function windowSatisfies(
  flat: readonly FlatOccurrence[],
  low: number,
  high: number,
  settings: ActiveGlossaryNearbySettings,
  paragraphs: readonly ActiveGlossaryParagraph[]
): boolean {
  if (settings.unit === "characters") {
    let maxGap = 0;
    for (let index = low; index < high; index += 1) {
      const gap =
        flat[index + 1].match.startOffset - flat[index].match.endOffset;
      if (gap > maxGap) {
        maxGap = gap;
      }
    }
    return maxGap <= settings.characterDistance;
  }

  let minParagraph = Number.POSITIVE_INFINITY;
  let maxParagraph = Number.NEGATIVE_INFINITY;
  for (let index = low; index <= high; index += 1) {
    const paragraphIndex =
      findParagraphIndexForOffset(paragraphs, flat[index].match.startOffset) ??
      -1;
    if (paragraphIndex < minParagraph) {
      minParagraph = paragraphIndex;
    }
    if (paragraphIndex > maxParagraph) {
      maxParagraph = paragraphIndex;
    }
  }
  return maxParagraph - minParagraph <= settings.paragraphDistance;
}

/**
 * The nearby matches for `terms` in `text` under `settings`. Ordered by
 * document offset, de-duplicated on exact range, deterministic, `limit`
 * respected.
 *
 * - `0` usable terms → `[]`.
 * - `1` usable term → identical to the `"any"` relation (every occurrence).
 * - `2+` terms → only the occurrences that take part in at least one window
 *   where all selected atoms sit within the configured distance.
 */
export function runActiveGlossaryNearbyFind(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  settings: ActiveGlossaryNearbySettings
): TextSearchMatch[] {
  const usableTerms = terms.filter((term) => term.value.trim().length > 0);
  if (text.length === 0 || usableTerms.length === 0) {
    return [];
  }
  if (usableTerms.length === 1) {
    return findGlossaryAtomMatches(text, usableTerms, {
      limit: ACTIVE_GLOSSARY_FIND_MATCH_LIMIT
    });
  }

  const perTerm = usableTerms.map((term) =>
    findGlossaryAtomMatches(text, [term], {
      limit: ACTIVE_GLOSSARY_FIND_MATCH_LIMIT
    })
  );
  if (perTerm.some((hits) => hits.length === 0)) {
    return [];
  }

  const flat: FlatOccurrence[] = [];
  perTerm.forEach((hits, termIndex) => {
    for (const match of hits) {
      flat.push({ termIndex, match });
    }
  });
  flat.sort(
    (left, right) =>
      left.match.startOffset - right.match.startOffset ||
      left.match.endOffset - right.match.endOffset ||
      left.termIndex - right.termIndex
  );

  const paragraphs =
    settings.unit === "paragraphs" ? segmentParagraphs(text) : [];

  const need = usableTerms.length;
  const counts = new Array<number>(need).fill(0);
  const participating = new Set<number>();
  let distinct = 0;
  let low = 0;

  for (let high = 0; high < flat.length; high += 1) {
    if (counts[flat[high].termIndex] === 0) {
      distinct += 1;
    }
    counts[flat[high].termIndex] += 1;

    while (distinct === need && counts[flat[low].termIndex] > 1) {
      counts[flat[low].termIndex] -= 1;
      low += 1;
    }
    if (distinct !== need) {
      continue;
    }
    if (windowSatisfies(flat, low, high, settings, paragraphs)) {
      for (let index = low; index <= high; index += 1) {
        participating.add(index);
      }
    }
  }

  const ordered = [...participating]
    .map((index) => flat[index].match)
    .sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset
    );

  const deduped: TextSearchMatch[] = [];
  let lastKey = "";
  for (const match of ordered) {
    const key = `${match.startOffset}:${match.endOffset}`;
    if (key !== lastKey) {
      deduped.push(match);
      lastKey = key;
    }
    if (deduped.length >= ACTIVE_GLOSSARY_FIND_MATCH_LIMIT) {
      break;
    }
  }
  return deduped;
}
