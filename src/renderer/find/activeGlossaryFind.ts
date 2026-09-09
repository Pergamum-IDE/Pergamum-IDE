/**
 * #424 Slice 6 — pure executor for the active Find panel's Glossary search
 * mode.
 *
 * Matching goes through the SHARED glossary surface matcher
 * (`glossaryAtomSearch.ts` → `matchGlossarySurfacesInText`), the same one the
 * project-wide Search pane's `語彙検索` mode, the Document Map and Document
 * Metrics use, so a strict-boundary atom like `ジャン` never hits `ジャンヌ`
 * and the panel's match count agrees with the rest of the app. The atom's RAW
 * value + its own `matchFlags` are used — never normalized to the entry's
 * representative form.
 *
 * Relation (Search tab only):
 * - `"any"` → OR: every occurrence of any selected atom.
 * - `"all"` → DOCUMENT-LEVEL: if every selected atom occurs at least once in
 *   the document, all of their occurrences are returned; if any selected atom
 *   is absent, no matches.
 * - `"nearby"` (Slice 7) → only the occurrences that sit within the configured
 *   character / paragraph distance of every other selected atom — see
 *   `activeGlossaryNearbySearch.ts`.
 */
import {
  buildGlossaryAtomSearchTerms,
  findGlossaryAtomMatches,
  type GlossaryAtomSearchTerm
} from "../glossaryAtomSearch";
import type { TextSearchMatch } from "../../shared/textSearch";
import type { FindGlossaryCandidate } from "./findGlossaryPicker";
import {
  DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS,
  runActiveGlossaryNearbyFind,
  type ActiveGlossaryNearbySettings
} from "./activeGlossaryNearbySearch";

export type { GlossaryAtomSearchTerm };

/** Search-tab-only relation for a multi-atom glossary query. */
export type ActiveGlossarySearchRelation = "any" | "all" | "nearby";

/**
 * Safety ceiling on collected glossary matches — mirrors
 * `ACTIVE_DOCUMENT_FIND_MATCH_LIMIT`. Well above any realistic navigate need.
 */
export const ACTIVE_GLOSSARY_FIND_MATCH_LIMIT = 5000;

/**
 * The OR terms for `selectedAtomIds`, resolved against `candidates` (project
 * order preserved, unknown / empty-value ids dropped, no id twice). Thin
 * wrapper over the shared `buildGlossaryAtomSearchTerms`.
 */
export function buildActiveGlossaryFindTerms(
  candidates: readonly FindGlossaryCandidate[],
  selectedAtomIds: Iterable<string>
): GlossaryAtomSearchTerm[] {
  return buildGlossaryAtomSearchTerms(candidates, selectedAtomIds);
}

/**
 * Every glossary match in `text` for `terms` under `relation`, ordered by
 * document offset, non-overlapping (longest surface wins at a position). An
 * empty `terms` / `text`, or an unmet `"all"` condition, yields `[]`.
 *
 * `"nearby"` delegates to `runActiveGlossaryNearbyFind` with `nearbySettings`
 * (defaulted when omitted).
 */
export function runActiveGlossaryFind(
  text: string,
  terms: readonly GlossaryAtomSearchTerm[],
  relation: ActiveGlossarySearchRelation,
  nearbySettings: ActiveGlossaryNearbySettings = DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS
): TextSearchMatch[] {
  const usableTerms = terms.filter((term) => term.value.trim().length > 0);
  if (text.length === 0 || usableTerms.length === 0) {
    return [];
  }

  if (relation === "nearby") {
    return runActiveGlossaryNearbyFind(text, usableTerms, nearbySettings);
  }

  if (relation === "all") {
    const everyTermPresent = usableTerms.every(
      (term) => findGlossaryAtomMatches(text, [term], { limit: 1 }).length > 0
    );
    if (!everyTermPresent) {
      return [];
    }
  }

  return findGlossaryAtomMatches(text, usableTerms, {
    limit: ACTIVE_GLOSSARY_FIND_MATCH_LIMIT
  });
}
