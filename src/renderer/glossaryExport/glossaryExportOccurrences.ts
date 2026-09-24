import type { ProjectDocument } from "../../shared/api";
import type { GlossaryAtomId, GlossaryEntry } from "../../shared/glossary";
import { representativeGlossaryAtom } from "../../shared/glossary";
import {
  isGlossarySearchMatch,
  type GlossaryAtomSearchTerm
} from "../glossaryAtomSearch";
import {
  runProjectGlossaryAtomSearch,
  type ProjectDocumentReader
} from "../projectTextSearch";

/**
 * #574 Slice 6: how often each of an entry's Atoms (表記) appears in the
 * project — computed with the Search pane's glossary search (`語彙検索`, OR
 * mode): the same project documents, the same dirty-buffer-first reader and
 * the same glossary surface matcher (each Atom's matchFlags / boundary rules,
 * longest Atom of the entry wins at a position). The glossary Descriptions
 * themselves are not project documents, so they are never counted.
 */

export interface GlossaryAtomOccurrenceCount {
  readonly atomId: GlossaryAtomId;
  readonly value: string;
  readonly count: number;
}

export interface GlossaryEntryOccurrenceCounts {
  readonly atoms: readonly GlossaryAtomOccurrenceCount[];
  readonly total: number;
  /** Project documents considered. */
  readonly documentCount: number;
  /** Documents that could not be read (not counted). */
  readonly skippedFileCount: number;
}

export interface CountGlossaryEntryOccurrencesInput {
  readonly entry: GlossaryEntry;
  readonly documents: readonly ProjectDocument[];
  readonly readText: ProjectDocumentReader;
}

export async function countGlossaryEntryOccurrences(
  input: CountGlossaryEntryOccurrencesInput
): Promise<GlossaryEntryOccurrenceCounts> {
  const entryLabel =
    representativeGlossaryAtom(input.entry)?.value ?? input.entry.id;
  const atoms = [...input.entry.atoms]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((atom) => atom.value.trim().length > 0);
  const terms: GlossaryAtomSearchTerm[] = atoms.map((atom) => ({
    value: atom.value,
    matchFlags: atom.matchFlags,
    atomId: atom.id,
    entryId: input.entry.id,
    entryLabel
  }));

  const result = await runProjectGlossaryAtomSearch({
    documents: input.documents,
    readText: input.readText,
    terms,
    relationMode: "any",
    // Count everything — the Search pane's display caps do not apply.
    maxTotalMatches: Number.POSITIVE_INFINITY,
    maxMatchesPerFile: Number.POSITIVE_INFINITY
  });

  const countByAtomId = new Map<string, number>();

  for (const file of result.files) {
    for (const match of file.matches) {
      if (isGlossarySearchMatch(match)) {
        const atomId = match.glossaryAtomId;

        countByAtomId.set(atomId, (countByAtomId.get(atomId) ?? 0) + 1);
      }
    }
  }

  const atomCounts = atoms.map((atom) => ({
    atomId: atom.id,
    value: atom.value,
    count: countByAtomId.get(atom.id) ?? 0
  }));

  return {
    atoms: atomCounts,
    total: atomCounts.reduce((sum, atom) => sum + atom.count, 0),
    documentCount: terms.length === 0 ? input.documents.length : result.documentCount,
    skippedFileCount: result.skippedFileCount
  };
}
