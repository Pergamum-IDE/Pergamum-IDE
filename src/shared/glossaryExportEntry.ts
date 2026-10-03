import type { ExportOrigin } from "./exportOrigin";
import type { GlossaryTag } from "./glossary";

/**
 * #695: what the glossary export needs to know about ONE entry.
 *
 * A saved `GlossaryEntry` already has this shape, so the "export all" path
 * passes entries as they are. A single export from a glossary Description tab
 * passes a detached snapshot of that tab's current draft instead: it may have
 * no persisted id at all (a never-saved entry), so `id` is only an
 * export-session key (it names the section / TOC anchor), never a database id.
 */
export interface GlossaryExportAtom {
  readonly id: string;
  readonly value: string;
  readonly matchFlags: number;
  /** Position among the entry's Atoms; 0 is the representative. */
  readonly sortOrder: number;
}

export interface GlossaryExportEntry {
  /** Export-session key: the entry id when saved, a snapshot key otherwise. */
  readonly id: string;
  readonly description: string;
  readonly atoms: readonly GlossaryExportAtom[];
  /** In assignment order; the first is the primary tag. */
  readonly tags: readonly GlossaryTag[];
  /** `null`: the entry was never saved, so there is no stored date. */
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  /** Title to show when the representative Atom is empty. */
  readonly fallbackTitle?: string;
}

/** The entry's title: its representative Atom, trimmed, else a fallback. */
export function glossaryExportEntryTitle(entry: GlossaryExportEntry): string {
  const representative =
    entry.atoms.find((atom) => atom.sortOrder === 0) ?? entry.atoms[0];
  const value = representative?.value.trim() ?? "";

  return value.length > 0 ? value : (entry.fallbackTitle ?? entry.id);
}

/**
 * #695: the target of the Export command when it is given one explicitly (a
 * document tab's context menu). Exactly one of: a project origin (a file, as
 * before #695) or one glossary Description's current draft snapshot.
 */
export type AssistExportTarget =
  | {
      readonly kind: "project";
      readonly origin: ExportOrigin;
    }
  | {
      readonly kind: "glossaryDescription";
      readonly snapshot: GlossaryExportEntry;
    };
