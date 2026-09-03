import {
  representativeGlossaryAtom,
  type GlossaryEntry
} from "../shared/glossary";

/** #375: the entry's primary label — its representative (`sortOrder = 0`) atom. */
export function representativeGlossarySurface(entry: GlossaryEntry): string {
  return representativeGlossaryAtom(entry)?.value ?? entry.id;
}
