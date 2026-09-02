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
  return (
    left.length === right.length &&
    [...left].sort().every((tagId, index) => tagId === [...right].sort()[index])
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

/** Move an atom one slot toward index 0 (up) or the end (down). */
export function moveGlossaryEntryDraftAtom(
  draft: GlossaryEntryDraft,
  atomId: string,
  direction: "up" | "down"
): GlossaryEntryDraft {
  const index = draft.atoms.findIndex((atom) => atom.id === atomId);

  if (index === -1) {
    return draft;
  }

  const target = direction === "up" ? index - 1 : index + 1;

  if (target < 0 || target >= draft.atoms.length) {
    return draft;
  }

  const atoms = [...draft.atoms];
  [atoms[index], atoms[target]] = [atoms[target], atoms[index]];

  return withRecomputedSaveState({ ...draft, atoms });
}

/** Attach the tag if absent, detach it if present. */
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
