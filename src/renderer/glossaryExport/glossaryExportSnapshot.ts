import type { GlossaryTag } from "../../shared/glossary";
import type { GlossaryExportEntry } from "../../shared/glossaryExportEntry";
import {
  glossaryEntryDraftIsNew,
  type GlossaryEntryDraft
} from "../glossaryEntryDraft";
import { presetRepresentativeOrDefault } from "../glossaryEntryTabCommands";

/**
 * #695: a detached snapshot of one glossary Description tab's CURRENT DRAFT,
 * for a single export. Nothing is read from the database and nothing is
 * saved: the Description, Atoms (value, flags, order), and assigned tags
 * (order) are copied from the draft as it is on screen, so unsaved edits are
 * exported and a never-saved entry works too.
 *
 * The snapshot is a plain copy: changing the draft afterwards never changes
 * it, and it carries no `saveState` / save baseline.
 */

export interface GlossaryDescriptionExportSnapshotInput {
  /**
   * The tab's own identity (its entry id, or the local id of a never-saved
   * entry). It only names the export session's section - it is not stored and
   * not a database id.
   */
  readonly tabEntryId: string;
  readonly draft: GlossaryEntryDraft;
  /** The project's tags as they are now, to resolve `draft.tagIds`. */
  readonly projectTags: readonly GlossaryTag[];
}

export function createGlossaryDescriptionExportSnapshot(
  input: GlossaryDescriptionExportSnapshotInput
): GlossaryExportEntry {
  const { draft } = input;
  const isNew = glossaryEntryDraftIsNew(draft);
  const tagsById = new Map(input.projectTags.map((tag) => [tag.id, tag]));
  // The draft's assignment order; a tag that no longer exists is ignored.
  const tags = draft.tagIds.flatMap((tagId) => {
    const tag = tagsById.get(tagId);

    return tag === undefined ? [] : [{ ...tag }];
  });
  const representative = draft.atoms[0]?.value.trim();

  return {
    id: `description-draft-${input.tabEntryId}`,
    description: draft.description,
    // Array order is the draft's order; index 0 is the representative.
    atoms: draft.atoms.map((atom, index) => ({
      id: atom.id,
      value: atom.value,
      matchFlags: atom.matchFlags,
      sortOrder: index
    })),
    tags,
    // A saved entry's stored dates are shown as they are; a never-saved one
    // has none, and none is invented.
    createdAt: isNew ? null : draft.entry.createdAt,
    updatedAt: isNew ? null : draft.entry.updatedAt,
    fallbackTitle: presetRepresentativeOrDefault(representative)
  };
}
