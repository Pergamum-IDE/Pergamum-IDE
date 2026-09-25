import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type { PergamumProject } from "../../src/shared/api";
import {
  glossaryRecoveryPayloadText,
  isNewGlossaryRecoveryPayload,
  parseGlossaryRecoveryDraft,
  sanitizeGlossaryRecoveryDraftTags,
  serializeGlossaryRecoveryDraft,
  type GlossaryRecoveryDraft
} from "../../src/shared/glossaryRecoveryDraft";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import { recoveryGlossaryDocumentKey } from "../../src/shared/recoveryDocument";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  updateGlossaryDescriptionEditorDraft,
  updateGlossaryDescriptionEditorText,
  type CurrentEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  addGlossaryEntryDraftAtom,
  glossaryEntryDraftCreateInput,
  glossaryEntryDraftIsNew,
  glossaryEntryDraftUpdateInput,
  unassignGlossaryEntryDraftTag
} from "../../src/renderer/glossaryEntryDraft";
import {
  buildGlossaryRecoveryPayload,
  glossaryEditorFromRecoveryDraft,
  glossaryRecoveryDraftFromEditor,
  recoveryDocumentKeyForGlossaryEditor
} from "../../src/renderer/recovery/glossaryRecovery";
import { buildRecoveryDirtyDocuments } from "../../src/renderer/recovery/recoveryDocumentPayload";
import {
  RecoveryPayloadCoordinator,
  type RecoveryPayloadTransport
} from "../../src/renderer/recovery/recoveryPayloadCoordinator";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import { createProjectDocument } from "../../src/renderer/currentDocument";

// #573 Slice 9: Recovery for glossary Description tabs (renderer side).

const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1";
const localId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00c3";
const project: PergamumProject = {
  rootPath: "/novel",
  activeProjectFilePath: "/novel/Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: []
};

function entry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  return {
    id: entryId,
    description: "保存済みの説明",
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-00000000a001",
        entryId,
        sortOrder: 0,
        value: "王都",
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-00000000b001",
        label: "地名",
        description: null,
        backgroundRgb: "#ffffff",
        foregroundRgb: "#000000",
        sortOrder: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T01:00:00.000Z",
    ...overrides
  };
}

function editedEditor(): GlossaryDescriptionCurrentEditor {
  // Description AND metadata edits (a new atom, an unassigned tag).
  let editor: CurrentEditor = createGlossaryDescriptionCurrentEditor(entry());
  editor = updateGlossaryDescriptionEditorText(
    editor,
    "復旧したい説明",
    (editor as GlossaryDescriptionCurrentEditor).descriptionLineEndingBreaks
  );
  editor = updateGlossaryDescriptionEditorDraft(editor, addGlossaryEntryDraftAtom);
  editor = updateGlossaryDescriptionEditorDraft(editor, (draft) =>
    unassignGlossaryEntryDraftTag(draft, "0190b6a1-1c2d-7e3f-8a4b-00000000b001")
  );
  const withValue = editor as GlossaryDescriptionCurrentEditor;
  return {
    ...withValue,
    draft: {
      ...withValue.draft,
      atoms: withValue.draft.atoms.map((atom, index) =>
        index === 1 ? { ...atom, value: "みやこ" } : atom
      )
    }
  };
}

describe("glossary Recovery draft (#573 Slice 9)", () => {
  it("captures the whole draft — Description and metadata — and round-trips", () => {
    const recoveryDraft = glossaryRecoveryDraftFromEditor(editedEditor());

    expect(recoveryDraft).toEqual({
      version: 1,
      entryId,
      localId: null,
      baseUpdatedAt: "2026-09-24T01:00:00.000Z",
      description: "復旧したい説明",
      atoms: [
        { id: "0190b6a1-1c2d-7e3f-8a4b-00000000a001", value: "王都", matchFlags: 0 },
        { id: null, value: "みやこ", matchFlags: 0 }
      ],
      tagIds: []
    });
    expect(
      parseGlossaryRecoveryDraft(serializeGlossaryRecoveryDraft(recoveryDraft))
    ).toEqual(recoveryDraft);
  });

  it("captures a never-saved new entry by its temporary id", () => {
    const recoveryDraft = glossaryRecoveryDraftFromEditor(
      createNewGlossaryDescriptionCurrentEditor("新語", localId)
    );

    expect(recoveryDraft).toMatchObject({ entryId: null, localId });
    expect(
      isNewGlossaryRecoveryPayload(serializeGlossaryRecoveryDraft(recoveryDraft))
    ).toBe(true);
  });

  it("ignores invalid / unknown payloads safely", () => {
    for (const bad of [
      "not json",
      "{}",
      JSON.stringify({ version: 2, entryId, localId: null, baseUpdatedAt: null, description: "", atoms: [], tagIds: [] }),
      JSON.stringify({ version: 1, entryId: null, localId: null, baseUpdatedAt: null, description: "", atoms: [], tagIds: [] }),
      JSON.stringify({ version: 1, entryId, localId: null, baseUpdatedAt: null, description: "", atoms: [{ id: 1 }], tagIds: [] })
    ]) {
      expect(parseGlossaryRecoveryDraft(bad)).toBeNull();
    }
    // The human-text helper never drops an unparsable body.
    expect(glossaryRecoveryPayloadText("raw text")).toBe("raw text");
  });
});

describe("glossary Recovery payload / snapshot write (#573 Slice 9)", () => {
  it("keys an existing entry by project + entry id, a new one by its temporary id", () => {
    expect(
      recoveryDocumentKeyForGlossaryEditor(editedEditor(), project)
    ).toBe(
      recoveryGlossaryDocumentKey(project.activeProjectFilePath, {
        kind: "entry",
        id: entryId
      })
    );
    expect(
      recoveryDocumentKeyForGlossaryEditor(
        createNewGlossaryDescriptionCurrentEditor("新語", localId),
        project
      )
    ).toBe(
      recoveryGlossaryDocumentKey(project.activeProjectFilePath, {
        kind: "new",
        id: localId
      })
    );
    expect(recoveryDocumentKeyForGlossaryEditor(editedEditor(), null)).toBeNull();
  });

  it("builds a glossary payload that is not a file", () => {
    const payload = buildGlossaryRecoveryPayload(editedEditor(), project)!;

    expect(payload).toMatchObject({
      documentType: "glossary.description",
      displayName: "王都",
      projectFilePath: project.activeProjectFilePath,
      filePath: null,
      documentEncoding: null,
      baseSha256: null
    });
    expect(parseGlossaryRecoveryDraft(payload.payloadText)?.description).toBe(
      "復旧したい説明"
    );
  });

  it("includes dirty glossary tabs (existing and new) and skips clean ones", () => {
    let state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createGlossaryDescriptionCurrentEditor(entry()),
      { rootPath: project.rootPath }
    );
    const context = {
      project,
      activeProjectContext: { rootPath: project.rootPath },
      normalizeUnicodeToNfc: false
    };

    expect(buildRecoveryDirtyDocuments(state, context)).toEqual([]);

    state = {
      ...state,
      documents: [{ ...state.documents[0], editor: editedEditor() }]
    };
    state = openOrActivateEditor(
      state,
      createNewGlossaryDescriptionCurrentEditor("新語", localId),
      { rootPath: project.rootPath }
    );

    expect(
      buildRecoveryDirtyDocuments(state, context).map(
        (dirty) => dirty.payload.documentType
      )
    ).toEqual(["glossary.description", "glossary.description"]);
  });

  it("the coordinator deletes a new entry's temporary-id row on its first save", async () => {
    const calls: string[] = [];
    const transport: RecoveryPayloadTransport = {
      upsert: (payload) => {
        calls.push(`upsert ${payload.documentKey}`);
        return { ok: true, mode: "inserted" };
      },
      delete: (documentKey) => {
        calls.push(`delete ${documentKey}`);
        return { ok: true, mode: "deleted" };
      }
    };
    const coordinator = new RecoveryPayloadCoordinator({
      transport,
      enabled: true,
      scheduler: { schedule: () => 0, cancel: () => undefined },
      now: () => 0
    });
    const oldKey = recoveryGlossaryDocumentKey(project.activeProjectFilePath, {
      kind: "new",
      id: localId
    });
    const newKey = recoveryGlossaryDocumentKey(project.activeProjectFilePath, {
      kind: "entry",
      id: entryId
    });

    coordinator.onSaveSucceeded({ oldKey, newKey, postSavePayload: null });
    await coordinator.flushNow();

    // Clean after the save: nothing re-captured, the temporary row retired.
    expect(calls).toEqual([`delete ${oldKey}`]);
  });
});

describe("restoring a glossary Recovery draft (#573 Slice 9)", () => {
  it("existing entry: a DIRTY tab for that entry, baseline = entry as stored now", () => {
    const recoveryDraft = glossaryRecoveryDraftFromEditor(editedEditor());
    const editor = glossaryEditorFromRecoveryDraft(recoveryDraft, entry(), entryId);

    expect(editor.entryId).toBe(entryId);
    expect(editor.draft.entry.id).toBe(entryId);
    expect(editor.draft.description).toBe("復旧したい説明");
    expect(editor.draft.atoms.map((atom) => atom.value)).toEqual(["王都", "みやこ"]);
    expect(editor.draft.atoms[0].id).toBe("0190b6a1-1c2d-7e3f-8a4b-00000000a001");
    expect(editor.draft.atoms[1].id.startsWith("local:")).toBe(true);
    expect(editor.draft.tagIds).toEqual([]);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(markdownDocumentForEditor(editor)).toBeNull();
    // Ctrl+S updates the existing entry with the WHOLE recovered draft.
    expect(glossaryEntryDraftUpdateInput(editor.draft)).toMatchObject({
      id: entryId,
      description: "復旧したい説明",
      tagIds: []
    });
  });

  it("deleted entry: an unsaved NEW-entry tab (first Ctrl+S creates)", () => {
    const recoveryDraft = glossaryRecoveryDraftFromEditor(editedEditor());
    const editor = glossaryEditorFromRecoveryDraft(recoveryDraft, null, localId);

    expect(editor.entryId).toBe(localId);
    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(editor.draft.atoms.every((atom) => atom.id.startsWith("local:"))).toBe(
      true
    );
    expect(glossaryEntryDraftCreateInput(editor.draft)).toEqual({
      description: "復旧したい説明",
      atoms: [
        { value: "王都", matchFlags: 0 },
        { value: "みやこ", matchFlags: 0 }
      ],
      tagIds: []
    });
  });

  it("never-saved entry: back to an unsaved new-entry tab", () => {
    const recoveryDraft = glossaryRecoveryDraftFromEditor(
      createNewGlossaryDescriptionCurrentEditor("新語", localId)
    );
    const editor = glossaryEditorFromRecoveryDraft(recoveryDraft, null, localId);

    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(editor.representativeSurface).toBe("新語");
    expect(isCurrentEditorDirty(editor)).toBe(true);
  });
});

describe("validating recovered tag ids (#574 Slice 3)", () => {
  const tagA = "0190b6a1-1c2d-7e3f-8a4b-00000000b001";
  const tagDeleted = "0190b6a1-1c2d-7e3f-8a4b-00000000b0de";
  const tagB = "0190b6a1-1c2d-7e3f-8a4b-00000000b002";

  function recoveryDraftWithTags(
    base: GlossaryRecoveryDraft,
    tagIds: readonly string[]
  ): GlossaryRecoveryDraft {
    return { ...base, tagIds: [...tagIds] };
  }

  it("drops only the missing ids, keeping valid ones in their order", () => {
    const base = glossaryRecoveryDraftFromEditor(editedEditor());
    const draft = recoveryDraftWithTags(base, [tagB, tagDeleted, tagA]);
    const result = sanitizeGlossaryRecoveryDraftTags(draft, [tagA, tagB]);

    expect(result.draft.tagIds).toEqual([tagB, tagA]);
    expect(result.removedTagIds).toEqual([tagDeleted]);
    // Nothing else of the draft changes; the input is not mutated.
    expect(result.draft).toEqual({ ...draft, tagIds: [tagB, tagA] });
    expect(draft.tagIds).toEqual([tagB, tagDeleted, tagA]);
  });

  it("returns the draft untouched when every tag still exists", () => {
    const draft = recoveryDraftWithTags(
      glossaryRecoveryDraftFromEditor(editedEditor()),
      [tagA, tagB]
    );
    const result = sanitizeGlossaryRecoveryDraftTags(draft, new Set([tagA, tagB]));

    expect(result.draft).toBe(draft);
    expect(result.removedTagIds).toEqual([]);
  });

  it("all tags deleted → an empty tag list", () => {
    const draft = recoveryDraftWithTags(
      glossaryRecoveryDraftFromEditor(editedEditor()),
      [tagA, tagDeleted]
    );
    const result = sanitizeGlossaryRecoveryDraftTags(draft, []);

    expect(result.draft.tagIds).toEqual([]);
    expect(result.removedTagIds).toEqual([tagA, tagDeleted]);
  });

  it("existing entry: restored tab keeps Description / atoms / identity, saves only valid tags", () => {
    const base = glossaryRecoveryDraftFromEditor(editedEditor());
    const { draft } = sanitizeGlossaryRecoveryDraftTags(
      recoveryDraftWithTags(base, [tagDeleted, tagA]),
      [tagA]
    );
    const editor = glossaryEditorFromRecoveryDraft(draft, entry(), entryId);

    expect(editor.entryId).toBe(entryId);
    expect(editor.draft.description).toBe("復旧したい説明");
    expect(editor.draft.atoms.map((atom) => atom.value)).toEqual(["王都", "みやこ"]);
    expect(editor.draft.tagIds).toEqual([tagA]);
    expect(draft.entryId).toBe(base.entryId);
    expect(draft.baseUpdatedAt).toBe(base.baseUpdatedAt);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(glossaryEntryDraftUpdateInput(editor.draft)).toMatchObject({
      id: entryId,
      description: "復旧したい説明",
      tagIds: [tagA]
    });
  });

  it("never-saved new entry: restored tab saves only valid tags", () => {
    const base = glossaryRecoveryDraftFromEditor(
      createNewGlossaryDescriptionCurrentEditor("新語", localId)
    );
    const { draft } = sanitizeGlossaryRecoveryDraftTags(
      recoveryDraftWithTags(base, [tagA, tagDeleted, tagB]),
      [tagA, tagB]
    );
    const editor = glossaryEditorFromRecoveryDraft(draft, null, localId);

    expect(draft.localId).toBe(base.localId);
    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(editor.representativeSurface).toBe("新語");
    expect(glossaryEntryDraftCreateInput(editor.draft).tagIds).toEqual([tagA, tagB]);
  });

  it("deleted entry restored as new: saves only valid tags", () => {
    const base = glossaryRecoveryDraftFromEditor(editedEditor());
    const { draft, removedTagIds } = sanitizeGlossaryRecoveryDraftTags(
      recoveryDraftWithTags(base, [tagDeleted]),
      [tagA]
    );
    const editor = glossaryEditorFromRecoveryDraft(draft, null, localId);

    expect(removedTagIds).toEqual([tagDeleted]);
    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(glossaryEntryDraftCreateInput(editor.draft)).toEqual({
      description: "復旧したい説明",
      atoms: [
        { value: "王都", matchFlags: 0 },
        { value: "みやこ", matchFlags: 0 }
      ],
      tagIds: []
    });
  });
});

describe("App glossary Recovery tag validation wiring (#574 Slice 3)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("validates against fresh tags before opening any tab; the sanitized draft is what opens", () => {
    const restoreBlock = block(
      "async function restoreGlossaryRecoveryCandidate(",
      "async function openRecoveredGlossaryDraft("
    );
    const draftCaseIndex = restoreBlock.indexOf('case "draft":');
    const listTagsIndex = restoreBlock.indexOf("window.pergamum.glossary.listTags()");
    const sanitizeIndex = restoreBlock.indexOf("sanitizeGlossaryRecoveryDraftTags(");
    const openIndex = restoreBlock.indexOf(
      "await openRecoveredGlossaryDraft(\n      sanitized.draft\n    );"
    );

    expect(draftCaseIndex).toBeGreaterThan(-1);
    expect(listTagsIndex).toBeGreaterThan(draftCaseIndex);
    expect(sanitizeIndex).toBeGreaterThan(listTagsIndex);
    expect(openIndex).toBeGreaterThan(sanitizeIndex);
    // A failed tag read keeps the row (no tab, no finalize).
    expect(restoreBlock).toContain(
      'setStatus({ key: "status.recoveryRestoreFailed" });\n      return notRestored("kept");\n    }\n\n    const sanitized'
    );
    expect(restoreBlock).toContain('outcome === "opened" ? sanitized.removedTagIds.length : 0');
    expect(restoreBlock).not.toContain("glossaryEditorFromRecoveryDraft(");
  });

  it("every open path uses the validated draft only", () => {
    const openBlock = block(
      "async function openRecoveredGlossaryDraft(",
      "async function handleRecoveryRestoreSelected("
    );

    expect(openBlock).toContain("draft: GlossaryRecoveryDraft");
    expect(openBlock).not.toContain("read.result");
    expect(openBlock).not.toContain("readGlossaryCandidateDraft");
    expect(openBlock).toContain("glossaryEditorFromRecoveryDraft(draft, null, localId)");
  });

  it("notifies the count once; restored candidates are still finalized", () => {
    const selectedBlock = block(
      "async function handleRecoveryRestoreSelected(",
      "async function getRecoveryReportTextForDialog"
    );

    expect(selectedBlock).toContain("removedGlossaryTagCount += removedTagCount;");
    expect(selectedBlock).toContain('key: "status.recoveryGlossaryTagsRemoved"');
    expect(selectedBlock).toContain("values: { count: removedGlossaryTagCount }");
    expect(selectedBlock).toContain("recoveryIds: glossaryOpenedIds");
  });

  it("has ja / en notice text with the count only", () => {
    expect(jaTranslations["status.recoveryGlossaryTagsRemoved"]).toBe(
      "復旧した語彙から、削除済みのタグ {count} 件を除外しました。"
    );
    expect(enTranslations["status.recoveryGlossaryTagsRemoved"]).toBe(
      "Removed {count} deleted tag(s) from the recovered glossary entry."
    );
  });
});

describe("App glossary Recovery wiring (#573 Slice 9)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("retires the pre-save glossary Recovery row on Save success (like Markdown)", () => {
    const saveBlock = block(
      "async function saveGlossaryDescriptionEditor(",
      "async function readProjectDocument"
    );

    expect(saveBlock).toContain(
      "const preSaveRecoveryKey = recoveryDocumentKeyForGlossaryEditor("
    );
    expect(saveBlock).toContain("recoveryPayloadCoordinator.onSaveSucceeded({");
    expect(saveBlock.indexOf("recoveryPayloadCoordinator.onSaveSucceeded({")).toBeGreaterThan(
      saveBlock.indexOf("openDocumentsStateRef.current = replacement.state;")
    );
  });

  it("restores glossary candidates into tabs, refusing to overwrite a dirty tab", () => {
    const restoreBlock = block(
      "async function restoreGlossaryRecoveryCandidate(",
      "async function handleRecoveryRestoreSelected("
    );

    expect(restoreBlock).toContain(
      "window.pergamum.recovery.readGlossaryCandidateDraft({"
    );
    expect(restoreBlock).toContain(
      'setStatus({ key: "status.recoveryGlossaryOtherProject" });'
    );
    expect(restoreBlock).toContain(
      'case "invalid":\n        return notRestored("fallback");'
    );
    expect(restoreBlock).toContain(
      "if (openTab && isCurrentEditorDirty(openTab.editor)) {"
    );
    expect(restoreBlock).toContain("glossaryEditorFromRecoveryDraft(draft, null, localId)");
    // Never a DB write while restoring.
    expect(restoreBlock).not.toContain("window.pergamum.glossary.create");
    expect(restoreBlock).not.toContain("window.pergamum.glossary.update");
  });

  it("finalizes only glossary candidates that opened; invalid ones fall back to .recovered.md", () => {
    const selectedBlock = block(
      "async function handleRecoveryRestoreSelected(",
      "async function getRecoveryReportTextForDialog"
    );

    expect(selectedBlock).toContain("recoveryIds: glossaryOpenedIds");
    expect(selectedBlock).toContain(
      "if (isGlossaryFallback && !glossaryFallbackIds.has(recoveryId)) {"
    );
  });

  it("keeps Recovery rows on tab close / discard (no delete wired there)", () => {
    const closeFlows = appSource.match(
      /onClose: \(targetId\) => \{[\s\S]*?\n {6}\}/g
    );

    expect(closeFlows?.length).toBe(2);
    for (const flow of closeFlows ?? []) {
      expect(flow).not.toContain("recoveryPayloadCoordinator");
      expect(flow).not.toContain("recovery.deleteDocument");
    }
  });
});

describe("Markdown Recovery is unchanged (#573 Slice 9)", () => {
  it("a dirty Markdown document still builds a markdown.file payload", () => {
    const document = createProjectDocument(
      { relativePath: "ch1.md", name: "ch1.md" },
      "本文"
    );
    const state = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createMarkdownCurrentEditor({ ...document, content: "編集" }),
      { rootPath: project.rootPath }
    );

    expect(
      buildRecoveryDirtyDocuments(state, {
        project,
        activeProjectContext: { rootPath: project.rootPath },
        normalizeUnicodeToNfc: false
      }).map((dirty) => dirty.payload.documentType)
    ).toEqual(["markdown.file"]);
  });
});
