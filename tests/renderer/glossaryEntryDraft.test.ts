import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
  type GlossaryEntry
} from "../../src/shared/glossary";
import {
  addGlossaryEntryDraftForm,
  applyGlossaryEntryDraftSaveResult,
  createGlossaryEntryDraft,
  deleteGlossaryEntryDraftForm,
  glossaryEntryDraftUpdateInput,
  isGlossaryEntryDraftDirty,
  isLocalGlossaryFormId,
  markGlossaryEntryDraftSaveFailed,
  markGlossaryEntryDraftSaving,
  updateGlossaryEntryDraftCanonicalAllowSingleCharacterMatch,
  updateGlossaryEntryDraftCanonicalMatchBoundaryEnd,
  updateGlossaryEntryDraftCanonicalMatchBoundaryStart,
  updateGlossaryEntryDraftCanonicalSurface,
  updateGlossaryEntryDraftDescription,
  updateGlossaryEntryDraftFormAllowSingleCharacterMatch,
  updateGlossaryEntryDraftFormMatchBoundaryEnd,
  updateGlossaryEntryDraftFormMatchBoundaryStart,
  updateGlossaryEntryDraftFormSurface,
  updateGlossaryEntryDraftFormWarningPolicy,
  updateGlossaryEntryDraftKind
} from "../../src/renderer/glossaryEntryDraft";

const savedEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  kind: "place",
  description: "王国の首都",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  forms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "王都",
      relation: null,
      warningPolicy: null,
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      allowSingleCharacterMatch: false,
      isCanonical: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "首都",
      relation: "alias",
      warningPolicy: "default",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      allowSingleCharacterMatch: false,
      isCanonical: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      surface: "王都",
      relation: "variant",
      warningPolicy: "warn",
      matchBoundaryStart: "none",
      matchBoundaryEnd: "strict",
      allowSingleCharacterMatch: false,
      isCanonical: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ]
};

describe("GlossaryEntryDraft", () => {
  it("starts clean with the saved entry's kind and description", () => {
    const draft = createGlossaryEntryDraft(savedEntry);

    expect(draft.saveState).toBe("clean");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);
    expect(draft.canonicalSurface).toBe("王都");
    expect(draft.canonicalMatchBoundaryStart).toBe("strict");
    expect(draft.canonicalMatchBoundaryEnd).toBe("none");
    expect(draft.kind).toBe("place");
    expect(draft.description).toBe("王国の首都");
    expect(draft.forms).toEqual([
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        surface: "首都",
        relation: "alias",
        warningPolicy: "default",
        matchBoundaryStart: "strict",
        matchBoundaryEnd: "none",
        allowSingleCharacterMatch: false
      },
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
        surface: "王都",
        relation: "variant",
        warningPolicy: "warn",
        matchBoundaryStart: "none",
        matchBoundaryEnd: "strict",
        allowSingleCharacterMatch: false
      }
    ]);
  });

  it("becomes dirty when kind changes from the saved snapshot", () => {
    const draft = updateGlossaryEntryDraftKind(
      createGlossaryEntryDraft(savedEntry),
      "person"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("becomes dirty when description changes from the saved snapshot", () => {
    const draft = updateGlossaryEntryDraftDescription(
      createGlossaryEntryDraft(savedEntry),
      "新しい説明"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("becomes dirty when canonical surface changes from the saved snapshot", () => {
    const draft = updateGlossaryEntryDraftCanonicalSurface(
      createGlossaryEntryDraft(savedEntry),
      "新王都"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("updates only the canonical start boundary and leaves the end boundary untouched", () => {
    const draft = updateGlossaryEntryDraftCanonicalMatchBoundaryStart(
      createGlossaryEntryDraft(savedEntry),
      "none"
    );

    expect(draft.canonicalMatchBoundaryStart).toBe("none");
    expect(draft.canonicalMatchBoundaryEnd).toBe("none");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("updates only the canonical end boundary and leaves the start boundary untouched", () => {
    const draft = updateGlossaryEntryDraftCanonicalMatchBoundaryEnd(
      createGlossaryEntryDraft(savedEntry),
      "auto"
    );

    expect(draft.canonicalMatchBoundaryStart).toBe("strict");
    expect(draft.canonicalMatchBoundaryEnd).toBe("auto");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("returns to clean when a canonical boundary edit is reverted back to the saved value", () => {
    const draft = updateGlossaryEntryDraftCanonicalMatchBoundaryStart(
      updateGlossaryEntryDraftCanonicalMatchBoundaryStart(
        createGlossaryEntryDraft(savedEntry),
        "none"
      ),
      "strict"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);
    expect(draft.saveState).toBe("clean");
  });

  it("becomes dirty when an alias is added, edited, or deleted", () => {
    const addedDraft = addGlossaryEntryDraftForm(
      createGlossaryEntryDraft(savedEntry),
      "alias"
    );

    expect(isLocalGlossaryFormId(addedDraft.forms.at(-1)?.id ?? "")).toBe(true);
    expect(addedDraft.forms.at(-1)).toMatchObject({
      matchBoundaryStart: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
      matchBoundaryEnd: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY
    });
    expect(isGlossaryEntryDraftDirty(addedDraft)).toBe(true);
    expect(addedDraft.saveState).toBe("dirty");

    const editedDraft = updateGlossaryEntryDraftFormSurface(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "王都アルセリア"
    );

    expect(isGlossaryEntryDraftDirty(editedDraft)).toBe(true);
    expect(editedDraft.saveState).toBe("dirty");

    const deletedDraft = deleteGlossaryEntryDraftForm(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc"
    );

    expect(isGlossaryEntryDraftDirty(deletedDraft)).toBe(true);
    expect(deletedDraft.saveState).toBe("dirty");
  });

  it("becomes dirty when a variant is added, edited, or deleted", () => {
    const addedDraft = addGlossaryEntryDraftForm(
      createGlossaryEntryDraft(savedEntry),
      "variant"
    );

    expect(isGlossaryEntryDraftDirty(addedDraft)).toBe(true);

    const editedDraft = updateGlossaryEntryDraftFormSurface(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
      "王都アルセリア"
    );

    expect(isGlossaryEntryDraftDirty(editedDraft)).toBe(true);

    const deletedDraft = deleteGlossaryEntryDraftForm(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-423456789abc"
    );

    expect(isGlossaryEntryDraftDirty(deletedDraft)).toBe(true);
  });

  it("becomes dirty when a form warning policy changes", () => {
    const draft = updateGlossaryEntryDraftFormWarningPolicy(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "warn"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("updates only the start boundary of the edited form", () => {
    const draft = updateGlossaryEntryDraftFormMatchBoundaryStart(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "auto"
    );
    const editedForm = draft.forms.find(
      (form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc"
    );
    const untouchedForm = draft.forms.find(
      (form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-423456789abc"
    );

    expect(editedForm?.matchBoundaryStart).toBe("auto");
    expect(editedForm?.matchBoundaryEnd).toBe("none");
    expect(untouchedForm?.matchBoundaryStart).toBe("none");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("updates only the end boundary of the edited form", () => {
    const draft = updateGlossaryEntryDraftFormMatchBoundaryEnd(
      createGlossaryEntryDraft(savedEntry),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "auto"
    );
    const editedForm = draft.forms.find(
      (form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc"
    );

    expect(editedForm?.matchBoundaryStart).toBe("strict");
    expect(editedForm?.matchBoundaryEnd).toBe("auto");
    expect(isGlossaryEntryDraftDirty(draft)).toBe(true);
    expect(draft.saveState).toBe("dirty");
  });

  it("returns to clean when a boundary edit is reverted back to the saved value", () => {
    const draft = updateGlossaryEntryDraftFormMatchBoundaryStart(
      updateGlossaryEntryDraftFormMatchBoundaryStart(
        createGlossaryEntryDraft(savedEntry),
        "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        "auto"
      ),
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "strict"
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);
    expect(draft.saveState).toBe("clean");
  });

  it("returns to clean when edits are reverted back to the saved snapshot", () => {
    const draft = updateGlossaryEntryDraftDescription(
      updateGlossaryEntryDraftDescription(
        createGlossaryEntryDraft(savedEntry),
        "変更"
      ),
      savedEntry.description
    );

    expect(isGlossaryEntryDraftDirty(draft)).toBe(false);
    expect(draft.saveState).toBe("clean");
  });

  it("adopts the saved API result as the new clean snapshot on save success", () => {
    const dirtyDraft = updateGlossaryEntryDraftKind(
      createGlossaryEntryDraft(savedEntry),
      "person"
    );
    const savingDraft = markGlossaryEntryDraftSaving(dirtyDraft);
    const updatedEntry: GlossaryEntry = {
      ...savedEntry,
      kind: "person",
      updatedAt: "2026-01-02T00:00:00.000Z"
    };

    const savedDraft = applyGlossaryEntryDraftSaveResult(
      savingDraft,
      updatedEntry
    );

    expect(savingDraft.saveState).toBe("saving");
    expect(savedDraft.saveState).toBe("clean");
    expect(savedDraft.entry).toEqual(updatedEntry);
    expect(savedDraft.kind).toBe("person");
    expect(isGlossaryEntryDraftDirty(savedDraft)).toBe(false);
  });

  it("keeps saveState as saving while editing an entry that is mid-save", () => {
    const dirtyDraft = updateGlossaryEntryDraftKind(
      createGlossaryEntryDraft(savedEntry),
      "person"
    );
    const savingDraft = markGlossaryEntryDraftSaving(dirtyDraft);
    const editedWhileSaving = updateGlossaryEntryDraftDescription(
      savingDraft,
      "保存中に加えた編集"
    );

    expect(editedWhileSaving.saveState).toBe("saving");
    expect(editedWhileSaving.description).toBe("保存中に加えた編集");
  });

  it("keeps saveState as saving while editing forms mid-save", () => {
    const savingDraft = markGlossaryEntryDraftSaving(
      createGlossaryEntryDraft(savedEntry)
    );

    expect(
      addGlossaryEntryDraftForm(savingDraft, "alias").saveState
    ).toBe("saving");
    expect(
      updateGlossaryEntryDraftFormSurface(
        savingDraft,
        "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        "保存中の別名"
      ).saveState
    ).toBe("saving");
    expect(
      updateGlossaryEntryDraftFormWarningPolicy(
        savingDraft,
        "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        "warn"
      ).saveState
    ).toBe("saving");
    expect(
      deleteGlossaryEntryDraftForm(
        savingDraft,
        "018f4b8c-7a2b-7c3d-8e4f-423456789abc"
      ).saveState
    ).toBe("saving");
    expect(
      updateGlossaryEntryDraftCanonicalSurface(
        savingDraft,
        "保存中の代表表記"
      ).saveState
    ).toBe("saving");
  });

  it("preserves edits made during a save and marks the draft dirty when they differ from the new snapshot", () => {
    const savingDraft = markGlossaryEntryDraftSaving(
      createGlossaryEntryDraft(savedEntry)
    );
    const editedWhileSaving = updateGlossaryEntryDraftDescription(
      savingDraft,
      "保存中に加えた編集"
    );

    const savedDraft = applyGlossaryEntryDraftSaveResult(
      editedWhileSaving,
      savedEntry
    );

    expect(savedDraft.description).toBe("保存中に加えた編集");
    expect(savedDraft.entry).toEqual(savedEntry);
    expect(savedDraft.saveState).toBe("dirty");
    expect(isGlossaryEntryDraftDirty(savedDraft)).toBe(true);
  });

  it("marks the draft clean when edits made during a save match the new snapshot", () => {
    const savingDraft = markGlossaryEntryDraftSaving(
      createGlossaryEntryDraft(savedEntry)
    );
    const updatedEntry: GlossaryEntry = {
      ...savedEntry,
      description: "保存された説明",
      updatedAt: "2026-01-02T00:00:00.000Z"
    };
    const editedToMatchSnapshot = updateGlossaryEntryDraftDescription(
      savingDraft,
      "保存された説明"
    );

    const savedDraft = applyGlossaryEntryDraftSaveResult(
      editedToMatchSnapshot,
      updatedEntry
    );

    expect(savedDraft.saveState).toBe("clean");
    expect(isGlossaryEntryDraftDirty(savedDraft)).toBe(false);
  });

  it("marks the draft dirty when forms edited during save differ from the new snapshot", () => {
    const savingDraft = markGlossaryEntryDraftSaving(
      createGlossaryEntryDraft(savedEntry)
    );
    const editedWhileSaving = updateGlossaryEntryDraftFormWarningPolicy(
      savingDraft,
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      "warn"
    );

    const savedDraft = applyGlossaryEntryDraftSaveResult(
      editedWhileSaving,
      savedEntry
    );

    expect(savedDraft.saveState).toBe("dirty");
    expect(isGlossaryEntryDraftDirty(savedDraft)).toBe(true);
    expect(savedDraft.forms).toContainEqual({
      id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      surface: "首都",
      relation: "alias",
      warningPolicy: "warn",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
        allowSingleCharacterMatch: false
    });
  });

  it("ignores local and database ID differences in dirty comparison", () => {
    const draft = createGlossaryEntryDraft(savedEntry);
    const draftWithLocalId = {
      ...draft,
      forms: [
        {
          ...draft.forms[0],
          id: "local:018f4b8c-7a2b-7c3d-8e4f-523456789abc"
        },
        draft.forms[1]
      ]
    };

    expect(isGlossaryEntryDraftDirty(draftWithLocalId)).toBe(false);
  });

  it("reconciles local form IDs by trimmed surface and relation after save", () => {
    const localAliasId = "local:alias-b";
    const savingDraft = markGlossaryEntryDraftSaving({
      ...createGlossaryEntryDraft(savedEntry),
      forms: [
        ...createGlossaryEntryDraft(savedEntry).forms,
        {
          id: localAliasId,
          surface: " alias B ",
          relation: "alias",
          warningPolicy: "warn",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "strict",
          allowSingleCharacterMatch: false
        }
      ]
    });
    const savedEntryWithAlias: GlossaryEntry = {
      ...savedEntry,
      updatedAt: "2026-01-02T00:00:00.000Z",
      forms: [
        ...savedEntry.forms,
        {
          id: "018f4b8c-7a2b-7c3d-8e4f-523456789abc",
          entryId: savedEntry.id,
          surface: "alias B",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "strict",
      allowSingleCharacterMatch: false,
          isCanonical: false,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z"
        }
      ]
    };

    const savedDraft = applyGlossaryEntryDraftSaveResult(
      savingDraft,
      savedEntryWithAlias
    );

    expect(savedDraft.forms).toContainEqual({
      id: "018f4b8c-7a2b-7c3d-8e4f-523456789abc",
      surface: " alias B ",
      relation: "alias",
      warningPolicy: "warn",
      matchBoundaryStart: "none",
      matchBoundaryEnd: "strict",
        allowSingleCharacterMatch: false
    });
    expect(savedDraft.saveState).toBe("dirty");
  });

  it("keeps the draft's edits and marks saveFailed when save fails", () => {
    const dirtyDraft = updateGlossaryEntryDraftDescription(
      createGlossaryEntryDraft(savedEntry),
      "保存に失敗する編集"
    );
    const savingDraft = markGlossaryEntryDraftSaving(dirtyDraft);
    const failedDraft = markGlossaryEntryDraftSaveFailed(savingDraft);

    expect(failedDraft.saveState).toBe("saveFailed");
    expect(failedDraft.description).toBe("保存に失敗する編集");
    expect(failedDraft.entry).toEqual(savedEntry);
    expect(isGlossaryEntryDraftDirty(failedDraft)).toBe(true);
  });

  it("tracks allowSingleCharacterMatch on the canonical form and a non-canonical form (#365)", () => {
    const base = createGlossaryEntryDraft(savedEntry);
    expect(base.canonicalAllowSingleCharacterMatch).toBe(false);
    expect(
      base.forms.every((form) => form.allowSingleCharacterMatch === false)
    ).toBe(true);

    const canonicalOn =
      updateGlossaryEntryDraftCanonicalAllowSingleCharacterMatch(base, true);
    expect(canonicalOn.canonicalAllowSingleCharacterMatch).toBe(true);
    expect(isGlossaryEntryDraftDirty(canonicalOn)).toBe(true);
    expect(canonicalOn.saveState).toBe("dirty");
    expect(
      isGlossaryEntryDraftDirty(
        updateGlossaryEntryDraftCanonicalAllowSingleCharacterMatch(
          canonicalOn,
          false
        )
      )
    ).toBe(false);

    const formOn = updateGlossaryEntryDraftFormAllowSingleCharacterMatch(
      base,
      "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
      true
    );
    expect(
      formOn.forms.find((form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc")?.allowSingleCharacterMatch
    ).toBe(true);
    expect(isGlossaryEntryDraftDirty(formOn)).toBe(true);

    const input = glossaryEntryDraftUpdateInput(
      updateGlossaryEntryDraftFormAllowSingleCharacterMatch(
        canonicalOn,
        "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        true
      )
    );
    expect(input.allowSingleCharacterMatch).toBe(true);
    expect(
      input.forms.find((form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc")?.allowSingleCharacterMatch
    ).toBe(true);

    const savedEntryWithFlags: GlossaryEntry = {
      ...savedEntry,
      forms: savedEntry.forms.map((form) =>
        form.isCanonical || form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc"
          ? { ...form, allowSingleCharacterMatch: true }
          : form
      )
    };
    const savedDraft = applyGlossaryEntryDraftSaveResult(
      updateGlossaryEntryDraftFormAllowSingleCharacterMatch(
        canonicalOn,
        "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        true
      ),
      savedEntryWithFlags
    );
    expect(savedDraft.saveState).toBe("clean");
    expect(savedDraft.canonicalAllowSingleCharacterMatch).toBe(true);
    expect(
      savedDraft.forms.find((form) => form.id === "018f4b8c-7a2b-7c3d-8e4f-323456789abc")
        ?.allowSingleCharacterMatch
    ).toBe(true);
  });

  it("builds the UpdateGlossaryEntryInput from the draft's editable fields", () => {
    const draft = updateGlossaryEntryDraftDescription(
      updateGlossaryEntryDraftKind(
        createGlossaryEntryDraft(savedEntry),
        "person"
      ),
      "更新後の説明"
    );

    expect(glossaryEntryDraftUpdateInput(draft)).toEqual({
      id: savedEntry.id,
      kind: "person",
      description: "更新後の説明",
      canonicalSurface: "王都",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      allowSingleCharacterMatch: false,
      forms: [
        {
          id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
          surface: "首都",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none",
          allowSingleCharacterMatch: false
        },
        {
          id: "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
          surface: "王都",
          relation: "variant",
          warningPolicy: "warn",
          matchBoundaryStart: "none",
          matchBoundaryEnd: "strict",
          allowSingleCharacterMatch: false
        }
      ]
    });
  });

  it("does not roll saved match boundaries back to auto while saving unrelated edits", () => {
    const draft = updateGlossaryEntryDraftDescription(
      createGlossaryEntryDraft(savedEntry),
      "境界とは無関係な説明変更"
    );

    expect(glossaryEntryDraftUpdateInput(draft).forms).toEqual([
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-323456789abc",
        surface: "首都",
        relation: "alias",
        warningPolicy: "default",
        matchBoundaryStart: "strict",
        matchBoundaryEnd: "none",
        allowSingleCharacterMatch: false
      },
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-423456789abc",
        surface: "王都",
        relation: "variant",
        warningPolicy: "warn",
        matchBoundaryStart: "none",
        matchBoundaryEnd: "strict",
        allowSingleCharacterMatch: false
      }
    ]);
  });

  it("omits blank and local form IDs from the update input", () => {
    const draft = {
      ...createGlossaryEntryDraft(savedEntry),
      forms: [
        {
          id: "local:new-alias",
          surface: "新しい別名",
          relation: "alias" as const,
          warningPolicy: "default" as const,
          matchBoundaryStart: "strict" as const,
          matchBoundaryEnd: "none" as const,
          allowSingleCharacterMatch: false
        },
        {
          id: "local:blank",
          surface: " ",
          relation: "variant" as const,
          warningPolicy: "default" as const,
          matchBoundaryStart: "none" as const,
          matchBoundaryEnd: "strict" as const,
          allowSingleCharacterMatch: false
        }
      ]
    };

    expect(glossaryEntryDraftUpdateInput(draft)).toEqual({
      id: savedEntry.id,
      kind: "place",
      description: "王国の首都",
      canonicalSurface: "王都",
      matchBoundaryStart: "strict",
      matchBoundaryEnd: "none",
      allowSingleCharacterMatch: false,
      forms: [
        {
          id: undefined,
          surface: "新しい別名",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none",
          allowSingleCharacterMatch: false
        }
      ]
    });
  });
});
