import { describe, expect, it } from "vitest";
import { GlossaryAtomFlags } from "../../src/shared/glossaryAtomFlags";
import type {
  GlossaryAtom,
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import {
  addGlossaryEntryDraftAtom,
  applyGlossaryEntryDraftSaveResult,
  assignGlossaryEntryDraftTag,
  createGlossaryEntryDraft,
  createLocalGlossaryAtomId,
  deleteGlossaryEntryDraftAtom,
  glossaryEntryDraftUpdateInput,
  glossaryEntryDraftValidity,
  isGlossaryEntryDraftDirty,
  isLocalGlossaryAtomId,
  markGlossaryEntryDraftSaving,
  partitionGlossaryTagsForEntry,
  reorderAssignedGlossaryEntryDraftTags,
  reorderGlossaryEntryDraftAtom,
  representativeGlossaryAtomDraft,
  toggleGlossaryEntryDraftTag,
  unassignGlossaryEntryDraftTag,
  updateGlossaryEntryDraftAtomMatchFlags,
  updateGlossaryEntryDraftAtomValue,
  updateGlossaryEntryDraftDescription
} from "../../src/renderer/glossaryEntryDraft";

const ts = "2026-09-02T00:00:00.000Z";
const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const tagId1 = "018f4b8c-7a2b-7c3d-8e4f-300000000001";
const tagId2 = "018f4b8c-7a2b-7c3d-8e4f-300000000002";

function atom(overrides: Partial<GlossaryAtom> & { id: string }): GlossaryAtom {
  return {
    entryId,
    sortOrder: 0,
    value: "織田信長",
    matchFlags: 0,
    createdAt: ts,
    updatedAt: ts,
    ...overrides
  };
}

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#123456",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: entryId,
    description: "戦国大名",
    atoms: [
      atom({ id: "a1", sortOrder: 0, value: "織田信長" }),
      atom({ id: "a2", sortOrder: 1, value: "第六天魔王" })
    ],
    tags: [tag(tagId1, "武将")],
    createdAt: ts,
    updatedAt: ts,
    ...overrides
  };
}

describe("glossaryEntryDraft (#375)", () => {
  it("builds a draft: atoms in sortOrder, tagIds, description, clean", () => {
    const draft = createGlossaryEntryDraft(entry());

    expect(draft.atoms.map((a) => [a.id, a.value])).toEqual([
      ["a1", "織田信長"],
      ["a2", "第六天魔王"]
    ]);
    expect(draft.tagIds).toEqual([tagId1]);
    expect(draft.description).toBe("戦国大名");
    expect(draft.saveState).toBe("clean");
    expect(representativeGlossaryAtomDraft(draft)?.id).toBe("a1");
  });

  it("marks the draft dirty on description / atom / tag change and clean when reverted", () => {
    let draft = createGlossaryEntryDraft(entry());
    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);

    draft = updateGlossaryEntryDraftDescription(draft, "改稿");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");

    draft = updateGlossaryEntryDraftDescription(draft, "戦国大名");
    expect(draft.saveState).toBe("clean");

    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", "だいろくてん");
    expect(draft.saveState).toBe("dirty");

    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", "第六天魔王");
    draft = toggleGlossaryEntryDraftTag(draft, tagId2);
    expect(draft.saveState).toBe("dirty");
    draft = toggleGlossaryEntryDraftTag(draft, tagId2);
    expect(draft.saveState).toBe("clean");
  });

  it("adds a local atom, edits its flags, and reorders atoms", () => {
    let draft = createGlossaryEntryDraft(entry());

    draft = addGlossaryEntryDraftAtom(draft);
    const added = draft.atoms.at(-1)!;
    expect(isLocalGlossaryAtomId(added.id)).toBe(true);
    expect(added).toMatchObject({ value: "", matchFlags: 0 });

    draft = updateGlossaryEntryDraftAtomMatchFlags(
      draft,
      added.id,
      GlossaryAtomFlags.AllowSingleCharacterMatch
    );
    expect(draft.atoms.at(-1)!.matchFlags).toBe(
      GlossaryAtomFlags.AllowSingleCharacterMatch
    );

    // Move "第六天魔王" (index 1) to index 0 → it becomes the representative.
    draft = reorderGlossaryEntryDraftAtom(draft, "a2", 0);
    expect(draft.atoms.map((a) => a.id)).toEqual(["a2", "a1", added.id]);
    expect(representativeGlossaryAtomDraft(draft)?.id).toBe("a2");

    // Move it to the end.
    draft = reorderGlossaryEntryDraftAtom(draft, "a2", 2);
    expect(draft.atoms.map((a) => a.id)).toEqual(["a1", added.id, "a2"]);
    expect(representativeGlossaryAtomDraft(draft)?.id).toBe("a1");

    // Unknown id / dropping on its own index / out-of-range target are no-ops
    // (the target is clamped to 0..n-1).
    const before = draft.atoms.map((a) => a.id);
    draft = reorderGlossaryEntryDraftAtom(draft, "nope", 0);
    draft = reorderGlossaryEntryDraftAtom(draft, "a2", 2);
    draft = reorderGlossaryEntryDraftAtom(draft, "a1", -5);
    expect(draft.atoms.map((a) => a.id)).toEqual(["a1", added.id, "a2"]);
    expect(before).toEqual(["a1", added.id, "a2"]);
  });

  it("deletes atoms", () => {
    let draft = createGlossaryEntryDraft(entry());
    draft = deleteGlossaryEntryDraftAtom(draft, "a2");
    expect(draft.atoms.map((a) => a.id)).toEqual(["a1"]);
  });

  it("validity: rejects zero non-blank atoms and duplicate values", () => {
    let draft = createGlossaryEntryDraft(entry());
    expect(glossaryEntryDraftValidity(draft)).toEqual({ ok: true });

    draft = updateGlossaryEntryDraftAtomValue(draft, "a1", "  ");
    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", "");
    expect(glossaryEntryDraftValidity(draft)).toEqual({
      ok: false,
      reason: "noAtoms"
    });

    draft = updateGlossaryEntryDraftAtomValue(draft, "a1", "同じ");
    draft = updateGlossaryEntryDraftAtomValue(draft, "a2", " 同じ ");
    expect(glossaryEntryDraftValidity(draft)).toEqual({
      ok: false,
      reason: "duplicateAtomValue"
    });
  });

  it("builds an UpdateGlossaryEntryInput: trimmed values, blank atoms dropped, local ids stripped", () => {
    let draft = createGlossaryEntryDraft(entry());
    draft = updateGlossaryEntryDraftAtomValue(draft, "a1", "  織田上総介  ");
    draft = addGlossaryEntryDraftAtom(draft);
    const localId = draft.atoms.at(-1)!.id;
    draft = updateGlossaryEntryDraftAtomValue(draft, localId, "  ");
    draft = toggleGlossaryEntryDraftTag(draft, tagId2);

    const input = glossaryEntryDraftUpdateInput(draft);

    expect(input).toEqual({
      id: entryId,
      description: "戦国大名",
      atoms: [
        { id: "a1", value: "織田上総介", matchFlags: 0 },
        { id: "a2", value: "第六天魔王", matchFlags: 0 }
      ],
      tagIds: [tagId1, tagId2]
    });
  });

  it("save lifecycle: saving is sticky, save result re-keys local atom ids and settles clean", () => {
    let draft = createGlossaryEntryDraft(entry());
    draft = addGlossaryEntryDraftAtom(draft);
    const localId = draft.atoms.at(-1)!.id;
    draft = updateGlossaryEntryDraftAtomValue(draft, localId, "うつけ");
    draft = markGlossaryEntryDraftSaving(draft);

    // A mutation while "saving" does not flip the state back to dirty/clean.
    draft = updateGlossaryEntryDraftDescription(draft, "x");
    expect(draft.saveState).toBe("saving");

    draft = updateGlossaryEntryDraftDescription(draft, "戦国大名");
    const saved: GlossaryEntry = entry({
      atoms: [
        atom({ id: "a1", sortOrder: 0, value: "織田信長" }),
        atom({ id: "a2", sortOrder: 1, value: "第六天魔王" }),
        atom({ id: "a3-real", sortOrder: 2, value: "うつけ" })
      ]
    });

    draft = applyGlossaryEntryDraftSaveResult(draft, saved);

    expect(draft.atoms.map((a) => a.id)).toEqual(["a1", "a2", "a3-real"]);
    expect(isLocalGlossaryAtomId(draft.atoms[2].id)).toBe(false);
    expect(draft.saveState).toBe("clean");
  });

  it("createLocalGlossaryAtomId is a local id", () => {
    expect(isLocalGlossaryAtomId(createLocalGlossaryAtomId())).toBe(true);
  });
});

describe("glossaryEntryDraft — ordered tag assignment (#375)", () => {
  const tagId3 = "018f4b8c-7a2b-7c3d-8e4f-300000000003";
  const tagId4 = "018f4b8c-7a2b-7c3d-8e4f-300000000004";
  const person = tag(tagId1, "登場人物");
  const place = tag(tagId2, "地名");
  const org = tag(tagId3, "組織");
  const foreshadow = tag(tagId4, "伏線");
  const projectTags = [person, place, org, foreshadow];

  function draftWithTags(tagIds: string[]) {
    return createGlossaryEntryDraft(
      entry({ tags: tagIds.map((id) => projectTags.find((t) => t.id === id)!) })
    );
  }

  it("assign inserts at the given index (default: end), never duplicates", () => {
    let draft = draftWithTags([person.id]);
    draft = assignGlossaryEntryDraftTag(draft, place.id);
    expect(draft.tagIds).toEqual([person.id, place.id]);

    draft = assignGlossaryEntryDraftTag(draft, org.id, 0);
    expect(draft.tagIds).toEqual([org.id, person.id, place.id]);

    // Already assigned → no-op, same reference.
    const before = draft;
    draft = assignGlossaryEntryDraftTag(draft, org.id, 2);
    expect(draft).toBe(before);
  });

  it("unassign removes the tag; unknown tag is a no-op", () => {
    let draft = draftWithTags([person.id, place.id]);
    draft = unassignGlossaryEntryDraftTag(draft, person.id);
    expect(draft.tagIds).toEqual([place.id]);

    const before = draft;
    expect(unassignGlossaryEntryDraftTag(before, org.id)).toBe(before);
  });

  it("reorder moves an assigned tag; the head becomes the primary tag", () => {
    let draft = draftWithTags([person.id, place.id, org.id]);
    draft = reorderAssignedGlossaryEntryDraftTags(draft, org.id, 0);
    expect(draft.tagIds).toEqual([org.id, person.id, place.id]);
    // A no-op move returns the same draft.
    expect(
      reorderAssignedGlossaryEntryDraftTags(draft, org.id, 0)
    ).toBe(draft);
  });

  it("reordering assigned tags marks the draft dirty (order-sensitive)", () => {
    let draft = draftWithTags([person.id, place.id]);
    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);
    draft = reorderAssignedGlossaryEntryDraftTags(draft, place.id, 0);
    expect(draft.tagIds).toEqual([place.id, person.id]);
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
  });

  it("glossaryEntryDraftUpdateInput carries the assignment order", () => {
    const draft = draftWithTags([org.id, person.id]);
    expect(glossaryEntryDraftUpdateInput(draft).tagIds).toEqual([
      org.id,
      person.id
    ]);
  });

  it("partitionGlossaryTagsForEntry: assigned in assignment order, available in project order", () => {
    const { assigned, available } = partitionGlossaryTagsForEntry(
      [foreshadow.id, person.id],
      projectTags
    );
    expect(assigned.map((t) => t.label)).toEqual(["伏線", "登場人物"]);
    expect(available.map((t) => t.label)).toEqual(["地名", "組織"]);
  });

  it("partitionGlossaryTagsForEntry: drops unknown assigned ids, tolerates no project tags", () => {
    expect(
      partitionGlossaryTagsForEntry(["missing", person.id], projectTags).assigned
        .map((t) => t.label)
    ).toEqual(["登場人物"]);
    expect(partitionGlossaryTagsForEntry([person.id], [])).toEqual({
      assigned: [],
      available: []
    });
  });
});
