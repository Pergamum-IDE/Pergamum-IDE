/**
 * #375 PoC: editable draft state for a Glossary entry — atoms + tags +
 * description. No `kind`, no canonical/alias/variant forms.
 *
 *   - `atoms`: `1..n` ordered `GlossaryAtomDraft`. Index 0 is the
 *     REPRESENTATIVE atom (`sortOrder = 0`); array order is `sortOrder`.
 *   - `tagIds`: `0..n` attached tag ids.
 */

import type {
  GlossaryAtomInput,
  GlossaryEntry,
  GlossaryTag,
  GlossaryTagId,
  UpdateGlossaryEntryInput
} from "../shared/glossary";
import type { EditorSaveState } from "./editorState";

export interface GlossaryAtomDraft {
  /** `local:<uuid>` for a not-yet-persisted atom, else the real atom id. */
  id: string;
  value: string;
  matchFlags: number;
}

export interface GlossaryEntryDraft {
  entry: GlossaryEntry;
  description: string;
  atoms: GlossaryAtomDraft[];
  tagIds: GlossaryTagId[];
  saveState: EditorSaveState;
}

function fallbackRandomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createLocalGlossaryAtomId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.() ?? fallbackRandomId();

  return `local:${randomUUID}`;
}

export function isLocalGlossaryAtomId(id: string): boolean {
  return id.startsWith("local:");
}

function atomDraftsFromEntry(entry: GlossaryEntry): GlossaryAtomDraft[] {
  return [...entry.atoms]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((atom) => ({
      id: atom.id,
      value: atom.value,
      matchFlags: atom.matchFlags
    }));
}

function tagIdsFromEntry(entry: GlossaryEntry): GlossaryTagId[] {
  return entry.tags.map((tag) => tag.id);
}

export function createGlossaryEntryDraft(
  entry: GlossaryEntry
): GlossaryEntryDraft {
  return {
    entry,
    description: entry.description,
    atoms: atomDraftsFromEntry(entry),
    tagIds: tagIdsFromEntry(entry),
    saveState: "clean"
  };
}

/** The representative atom draft — index 0, mirroring `sortOrder = 0`. */
export function representativeGlossaryAtomDraft(
  draft: GlossaryEntryDraft
): GlossaryAtomDraft | null {
  return draft.atoms[0] ?? null;
}

// ---------------------------------------------------------------------------
// Dirty detection
// ---------------------------------------------------------------------------

function normalizedAtomsForComparison(
  atoms: readonly GlossaryAtomDraft[]
): { value: string; matchFlags: number }[] {
  return atoms.map((atom) => ({
    value: atom.value.trim(),
    matchFlags: atom.matchFlags
  }));
}

function atomsEqual(
  left: readonly GlossaryAtomDraft[],
  right: readonly GlossaryAtomDraft[]
): boolean {
  const a = normalizedAtomsForComparison(left);
  const b = normalizedAtomsForComparison(right);

  return (
    a.length === b.length &&
    a.every(
      (atom, index) =>
        atom.value === b[index].value &&
        atom.matchFlags === b[index].matchFlags
    )
  );
}

function tagIdsEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  // #375: ORDER-sensitive — reordering assigned tags (which changes the
  // primary tag) must mark the draft dirty.
  return (
    left.length === right.length &&
    left.every((tagId, index) => tagId === right[index])
  );
}

export function isGlossaryEntryDraftDirty(draft: GlossaryEntryDraft): boolean {
  return (
    draft.description !== draft.entry.description ||
    !atomsEqual(draft.atoms, atomDraftsFromEntry(draft.entry)) ||
    !tagIdsEqual(draft.tagIds, tagIdsFromEntry(draft.entry))
  );
}

// ---------------------------------------------------------------------------
// Validity (the editor blocks save when this is not "ok")
// ---------------------------------------------------------------------------

export type GlossaryEntryDraftValidity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "noAtoms" | "duplicateAtomValue" };

export function glossaryEntryDraftValidity(
  draft: GlossaryEntryDraft
): GlossaryEntryDraftValidity {
  const values = draft.atoms
    .map((atom) => atom.value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    return { ok: false, reason: "noAtoms" };
  }

  if (new Set(values).size !== values.length) {
    return { ok: false, reason: "duplicateAtomValue" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mutations (all return a new draft with a recomputed save state)
// ---------------------------------------------------------------------------

function withRecomputedSaveState(
  draft: GlossaryEntryDraft
): GlossaryEntryDraft {
  if (draft.saveState === "saving") {
    return draft;
  }

  return {
    ...draft,
    saveState: isGlossaryEntryDraftDirty(draft) ? "dirty" : "clean"
  };
}

export function updateGlossaryEntryDraftDescription(
  draft: GlossaryEntryDraft,
  description: string
): GlossaryEntryDraft {
  return withRecomputedSaveState({ ...draft, description });
}

export function addGlossaryEntryDraftAtom(
  draft: GlossaryEntryDraft
): GlossaryEntryDraft {
  return withRecomputedSaveState({
    ...draft,
    atoms: [
      ...draft.atoms,
      { id: createLocalGlossaryAtomId(), value: "", matchFlags: 0 }
    ]
  });
}

export function updateGlossaryEntryDraftAtomValue(
  draft: GlossaryEntryDraft,
  atomId: string,
  value: string
): GlossaryEntryDraft {
  return withRecomputedSaveState({
    ...draft,
    atoms: draft.atoms.map((atom) =>
      atom.id === atomId ? { ...atom, value } : atom
    )
  });
}

export function updateGlossaryEntryDraftAtomMatchFlags(
  draft: GlossaryEntryDraft,
  atomId: string,
  matchFlags: number
): GlossaryEntryDraft {
  return withRecomputedSaveState({
    ...draft,
    atoms: draft.atoms.map((atom) =>
      atom.id === atomId ? { ...atom, matchFlags } : atom
    )
  });
}

export function deleteGlossaryEntryDraftAtom(
  draft: GlossaryEntryDraft,
  atomId: string
): GlossaryEntryDraft {
  return withRecomputedSaveState({
    ...draft,
    atoms: draft.atoms.filter((atom) => atom.id !== atomId)
  });
}

/**
 * #375: move the atom `atomId` so it lands at array index `toIndex` (clamped
 * to `[0, atoms.length - 1]`). Array order IS `sortOrder`, so whatever atom
 * ends up at index 0 becomes the representative atom. Dropping an atom on its
 * own position is a no-op. Used by the drag handle (D&D) and its keyboard
 * fallback (Arrow Up / Down).
 */
export function reorderGlossaryEntryDraftAtom(
  draft: GlossaryEntryDraft,
  atomId: string,
  toIndex: number
): GlossaryEntryDraft {
  const fromIndex = draft.atoms.findIndex((atom) => atom.id === atomId);

  if (fromIndex === -1) {
    return draft;
  }

  const clampedToIndex = Math.max(
    0,
    Math.min(Math.trunc(toIndex), draft.atoms.length - 1)
  );

  if (clampedToIndex === fromIndex) {
    return draft;
  }

  const atoms = [...draft.atoms];
  const [moved] = atoms.splice(fromIndex, 1);
  atoms.splice(clampedToIndex, 0, moved);

  return withRecomputedSaveState({ ...draft, atoms });
}

/** Attach the tag (at the end) if absent, detach it if present. */
export function toggleGlossaryEntryDraftTag(
  draft: GlossaryEntryDraft,
  tagId: GlossaryTagId
): GlossaryEntryDraft {
  return withRecomputedSaveState({
    ...draft,
    tagIds: draft.tagIds.includes(tagId)
      ? draft.tagIds.filter((id) => id !== tagId)
      : [...draft.tagIds, tagId]
  });
}

/**
 * #375: assign `tagId` to the entry at array index `toIndex` (clamped to
 * `[0, tagIds.length]`; defaults to the end). Already-assigned → no-op (a tag
 * is never assigned twice). Index 0 makes it the entry's PRIMARY tag.
 */
export function assignGlossaryEntryDraftTag(
  draft: GlossaryEntryDraft,
  tagId: GlossaryTagId,
  toIndex: number = draft.tagIds.length
): GlossaryEntryDraft {
  if (draft.tagIds.includes(tagId)) {
    return draft;
  }

  const target = Math.max(
    0,
    Math.min(Math.trunc(toIndex), draft.tagIds.length)
  );
  const tagIds = [...draft.tagIds];
  tagIds.splice(target, 0, tagId);

  return withRecomputedSaveState({ ...draft, tagIds });
}

/** #375: unassign `tagId` from the entry. The Tag itself, the Entry and its
 *  Atoms are untouched. No-op when `tagId` is not assigned. */
export function unassignGlossaryEntryDraftTag(
  draft: GlossaryEntryDraft,
  tagId: GlossaryTagId
): GlossaryEntryDraft {
  if (!draft.tagIds.includes(tagId)) {
    return draft;
  }

  return withRecomputedSaveState({
    ...draft,
    tagIds: draft.tagIds.filter((id) => id !== tagId)
  });
}

/**
 * #375: move an already-assigned `tagId` to array index `toIndex` (clamped to
 * `[0, tagIds.length - 1]`). Whatever ends up at index 0 becomes the primary
 * tag. A no-op move / an unknown tag returns the draft unchanged. Saved as
 * `sort_order = 0..n-1`.
 */
export function reorderAssignedGlossaryEntryDraftTags(
  draft: GlossaryEntryDraft,
  tagId: GlossaryTagId,
  toIndex: number
): GlossaryEntryDraft {
  const fromIndex = draft.tagIds.indexOf(tagId);

  if (fromIndex === -1) {
    return draft;
  }

  const target = Math.max(
    0,
    Math.min(Math.trunc(toIndex), draft.tagIds.length - 1)
  );

  if (target === fromIndex) {
    return draft;
  }

  const tagIds = [...draft.tagIds];
  const [moved] = tagIds.splice(fromIndex, 1);
  tagIds.splice(target, 0, moved);

  return withRecomputedSaveState({ ...draft, tagIds });
}

/**
 * #375: split the project's tags into this entry's ASSIGNED tags (in
 * assignment order — `assignedTagIds` order, ids not in `projectTags` dropped)
 * and the AVAILABLE tags (every other project tag, kept in `projectTags`
 * order = the project-wide `sortOrder`). Feeds the Entry editor's two-list tag
 * assignment UI.
 */
export function partitionGlossaryTagsForEntry(
  assignedTagIds: readonly string[],
  projectTags: readonly GlossaryTag[]
): { assigned: GlossaryTag[]; available: GlossaryTag[] } {
  const byId = new Map(projectTags.map((tag) => [tag.id, tag]));
  const assignedSet = new Set(assignedTagIds);

  return {
    assigned: assignedTagIds
      .map((id) => byId.get(id))
      .filter((tag): tag is GlossaryTag => tag !== undefined),
    available: projectTags.filter((tag) => !assignedSet.has(tag.id))
  };
}

// ---------------------------------------------------------------------------
// Save lifecycle
// ---------------------------------------------------------------------------

export function markGlossaryEntryDraftSaving(
  draft: GlossaryEntryDraft
): GlossaryEntryDraft {
  return { ...draft, saveState: "saving" };
}

export function markGlossaryEntryDraftSaveFailed(
  draft: GlossaryEntryDraft
): GlossaryEntryDraft {
  return { ...draft, saveState: "saveFailed" };
}

/**
 * Re-key `local:` atom drafts to the ids the store assigned, matching by
 * trimmed value in order. Tags are re-derived from the saved entry.
 */
export function applyGlossaryEntryDraftSaveResult(
  draft: GlossaryEntryDraft,
  savedEntry: GlossaryEntry
): GlossaryEntryDraft {
  const savedByValue = new Map<string, string>();
  const usedSavedIds = new Set<string>();

  for (const atom of savedEntry.atoms) {
    savedByValue.set(atom.value.trim(), atom.id);
  }

  const nextDraft: GlossaryEntryDraft = {
    ...draft,
    entry: savedEntry,
    tagIds: tagIdsFromEntry(savedEntry),
    atoms: draft.atoms.map((atom) => {
      if (!isLocalGlossaryAtomId(atom.id)) {
        return atom;
      }

      const savedId = savedByValue.get(atom.value.trim());

      if (!savedId || usedSavedIds.has(savedId)) {
        return atom;
      }

      usedSavedIds.add(savedId);

      return { ...atom, id: savedId };
    })
  };

  return {
    ...nextDraft,
    saveState: isGlossaryEntryDraftDirty(nextDraft) ? "dirty" : "clean"
  };
}

function atomInputsFromDraft(
  draft: GlossaryEntryDraft
): GlossaryAtomInput[] {
  return draft.atoms
    .map((atom) => ({ ...atom, value: atom.value.trim() }))
    .filter((atom) => atom.value.length > 0)
    .map((atom) => ({
      ...(isLocalGlossaryAtomId(atom.id) ? {} : { id: atom.id }),
      value: atom.value,
      matchFlags: atom.matchFlags
    }));
}

export function glossaryEntryDraftUpdateInput(
  draft: GlossaryEntryDraft
): UpdateGlossaryEntryInput {
  return {
    id: draft.entry.id,
    description: draft.description,
    atoms: atomInputsFromDraft(draft),
    tagIds: [...draft.tagIds]
  };
}
