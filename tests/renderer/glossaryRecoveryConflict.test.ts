import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  sanitizeGlossaryRecoveryDraftTags,
  type GlossaryRecoveryDraft
} from "../../src/shared/glossaryRecoveryDraft";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import {
  applyGlossaryDescriptionEditorSaveResult,
  createGlossaryDescriptionCurrentEditor,
  createNewGlossaryDescriptionCurrentEditor,
  isCurrentEditorDirty,
  updateGlossaryDescriptionEditorText,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  glossaryEntryDraftIsNew,
  glossaryEntryDraftUpdateInput
} from "../../src/renderer/glossaryEntryDraft";
import { rebaseGlossaryDescriptionEditorBaseline } from "../../src/renderer/glossaryImageReferenceMoveUpdate";
import {
  glossaryEditorFromRecoveryDraft,
  glossaryRecoveryConflict,
  glossaryRecoveryDraftFromEditor
} from "../../src/renderer/recovery/glossaryRecovery";

// #574 Slice 4: Recovery conflict detection for glossary Description tabs.

const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00a1";
const localId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f00c3";
const tagId = "0190b6a1-1c2d-7e3f-8a4b-00000000b001";
const snapshotUpdatedAt = "2026-09-24T01:00:00.000Z";
const newerUpdatedAt = "2026-09-24T02:00:00.000Z";

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
        id: tagId,
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
    updatedAt: snapshotUpdatedAt,
    ...overrides
  };
}

/** A Recovery draft captured from an edited tab at `snapshotUpdatedAt`. */
function snapshotDraft(): GlossaryRecoveryDraft {
  const editor = updateGlossaryDescriptionEditorText(
    createGlossaryDescriptionCurrentEditor(entry()),
    "復旧したい説明",
    createGlossaryDescriptionCurrentEditor(entry()).descriptionLineEndingBreaks
  ) as GlossaryDescriptionCurrentEditor;

  return glossaryRecoveryDraftFromEditor(editor);
}

const newerEntry = entry({
  description: "別の場所で更新された説明",
  updatedAt: newerUpdatedAt
});

describe("detecting a Recovery conflict (#574 Slice 4)", () => {
  it("records the base the snapshot was taken on", () => {
    expect(snapshotDraft().baseUpdatedAt).toBe(snapshotUpdatedAt);
  });

  it("matching baseUpdatedAt → no conflict", () => {
    expect(glossaryRecoveryConflict(snapshotDraft(), entry())).toBeNull();

    const editor = glossaryEditorFromRecoveryDraft(snapshotDraft(), entry(), entryId);

    expect(editor.recoveryConflict).toBeNull();
    expect(isCurrentEditorDirty(editor)).toBe(true);
  });

  it("entry updated since the snapshot → conflict (base vs. current)", () => {
    expect(glossaryRecoveryConflict(snapshotDraft(), newerEntry)).toEqual({
      baseUpdatedAt: snapshotUpdatedAt,
      currentUpdatedAt: newerUpdatedAt
    });

    const editor = glossaryEditorFromRecoveryDraft(
      snapshotDraft(),
      newerEntry,
      entryId
    );

    expect(editor.recoveryConflict).toEqual({
      baseUpdatedAt: snapshotUpdatedAt,
      currentUpdatedAt: newerUpdatedAt
    });
    // Still opens as a dirty tab holding the recovered draft.
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(editor.draft.description).toBe("復旧したい説明");
    expect(editor.draft.entry.updatedAt).toBe(newerUpdatedAt);
  });

  it("missing baseUpdatedAt (older rows) → compatible, no conflict", () => {
    const draft = { ...snapshotDraft(), baseUpdatedAt: null };

    expect(glossaryRecoveryConflict(draft, newerEntry)).toBeNull();
    expect(
      glossaryEditorFromRecoveryDraft(draft, newerEntry, entryId).recoveryConflict
    ).toBeNull();
  });

  it("unsaved new entry Recovery → no conflict", () => {
    const draft = glossaryRecoveryDraftFromEditor(
      createNewGlossaryDescriptionCurrentEditor("新語", localId)
    );
    const editor = glossaryEditorFromRecoveryDraft(draft, null, localId);

    expect(draft.baseUpdatedAt).toBeNull();
    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(editor.recoveryConflict).toBeNull();
  });

  it("deleted entry restored as new → no conflict", () => {
    const editor = glossaryEditorFromRecoveryDraft(snapshotDraft(), null, localId);

    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(editor.recoveryConflict).toBeNull();
  });

  it("a normally opened tab never carries a conflict", () => {
    expect(
      createGlossaryDescriptionCurrentEditor(newerEntry).recoveryConflict
    ).toBeUndefined();
  });

  it("Slice 3 tag validation still applies on a conflicted restore", () => {
    const { draft, removedTagIds } = sanitizeGlossaryRecoveryDraftTags(
      { ...snapshotDraft(), tagIds: [tagId, "0190b6a1-1c2d-7e3f-8a4b-00000000b0de"] },
      [tagId]
    );
    const editor = glossaryEditorFromRecoveryDraft(draft, newerEntry, entryId);

    expect(removedTagIds).toHaveLength(1);
    expect(editor.draft.tagIds).toEqual([tagId]);
    expect(editor.recoveryConflict).not.toBeNull();
  });
});

describe("conflict state lifetime (#574 Slice 4)", () => {
  function conflictedEditor(): GlossaryDescriptionCurrentEditor {
    return glossaryEditorFromRecoveryDraft(snapshotDraft(), newerEntry, entryId);
  }

  it("survives further edits and a baseline rebase (image Move/Rename)", () => {
    const edited = updateGlossaryDescriptionEditorText(
      conflictedEditor(),
      "さらに編集",
      conflictedEditor().descriptionLineEndingBreaks
    ) as GlossaryDescriptionCurrentEditor;

    expect(edited.recoveryConflict).not.toBeNull();

    const rebased = rebaseGlossaryDescriptionEditorBaseline(
      edited,
      entry({ updatedAt: "2026-09-24T03:00:00.000Z" })
    ) as GlossaryDescriptionCurrentEditor;

    expect(rebased.recoveryConflict).not.toBeNull();
  });

  it("is cleared by a successful save", () => {
    const editor = conflictedEditor();
    const saved = applyGlossaryDescriptionEditorSaveResult(
      editor,
      entry({
        description: "復旧したい説明",
        updatedAt: "2026-09-24T04:00:00.000Z"
      })
    ) as GlossaryDescriptionCurrentEditor;

    expect(saved.recoveryConflict).toBeNull();
    expect(isCurrentEditorDirty(saved)).toBe(false);
  });

  it("re-captured Recovery keeps the ORIGINAL base while still conflicted", () => {
    const editor = conflictedEditor();

    expect(glossaryRecoveryDraftFromEditor(editor).baseUpdatedAt).toBe(
      snapshotUpdatedAt
    );
    // …so restoring that row again still detects the conflict.
    expect(
      glossaryRecoveryConflict(glossaryRecoveryDraftFromEditor(editor), newerEntry)
    ).not.toBeNull();

    const saved = applyGlossaryDescriptionEditorSaveResult(
      editor,
      entry({ updatedAt: "2026-09-24T04:00:00.000Z" })
    ) as GlossaryDescriptionCurrentEditor;

    expect(glossaryRecoveryDraftFromEditor(saved).baseUpdatedAt).toBe(
      "2026-09-24T04:00:00.000Z"
    );
  });

  it("the confirmed save updates with the recovered draft", () => {
    expect(glossaryEntryDraftUpdateInput(conflictedEditor().draft)).toMatchObject({
      id: entryId,
      description: "復旧したい説明"
    });
  });
});

describe("App Recovery conflict wiring (#574 Slice 4)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("save asks before overwriting a conflicted entry; cancel → no update", () => {
    const saveBlock = block(
      "async function saveGlossaryDescriptionEditor(",
      "async function confirmRecoveredGlossaryOverwrite("
    );
    const validityIndex = saveBlock.indexOf("if (!validity.ok) {");
    const gateIndex = saveBlock.indexOf(
      "openDocument.editor.recoveryConflict &&\n      !glossaryEntryDraftIsNew(draft)"
    );
    const confirmIndex = saveBlock.indexOf(
      "if (!(await confirmRecoveredGlossaryOverwrite())) {\n        return \"cancelled\";\n      }"
    );
    const guardIndex = saveBlock.indexOf("await saveInFlightGuard.run<SaveFileOutcome>(");
    const updateIndex = saveBlock.indexOf("await updateGlossaryEntryFromDraft(");

    expect(validityIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(validityIndex);
    expect(confirmIndex).toBeGreaterThan(gateIndex);
    expect(guardIndex).toBeGreaterThan(confirmIndex);
    expect(updateIndex).toBeGreaterThan(guardIndex);
    // The draft that was confirmed is the draft that is saved.
    expect(saveBlock).toContain(
      "findOpenDocument(openDocumentsStateRef.current, editorId)?.editor !==\n        openDocument.editor"
    );
  });

  it("the overwrite confirmation is destructive and fails closed", () => {
    const confirmBlock = block(
      "async function confirmRecoveredGlossaryOverwrite(",
      "async function readProjectDocument("
    );

    expect(confirmBlock).toContain('tone: "destructive"');
    expect(confirmBlock).toContain(
      'confirmLabel: translate("dialog.recoveryGlossaryConflict.confirm")'
    );
    expect(confirmBlock).toContain('=== "confirm"');
    expect(confirmBlock).toContain("} catch {\n      return false;\n    }");
  });

  it("every save route (Ctrl+S, Save All, close, lifecycle) goes through the gated save", () => {
    const calls = appSource.match(/saveGlossaryDescriptionEditor\(/g) ?? [];

    // The definition + the single call inside `saveFile`.
    expect(calls).toHaveLength(2);
    expect(appSource).toContain(
      'if (targetOpenDocument.editor.kind === "glossaryDescription") {\n      return await saveGlossaryDescriptionEditor(targetOpenDocument.id);'
    );
    expect(appSource).toContain("await saveFile({ editorId });");
    expect(appSource).toContain(
      "saveDirtyEditorBeforeClose: (targetId) => saveFile({ editorId: targetId })"
    );
    expect(appSource).toContain("saveFile({ editorId: workingCopy.editorId })");
  });

  it("restore warns once and still finalizes conflicted candidates", () => {
    const selectedBlock = block(
      "async function handleRecoveryRestoreSelected(",
      "async function getRecoveryReportTextForDialog"
    );
    const pushIndex = selectedBlock.indexOf("glossaryOpenedIds.push(recoveryId);");
    const countIndex = selectedBlock.indexOf(
      "glossaryRecoveryConflictCount += hasRecoveryConflict ? 1 : 0;"
    );

    expect(pushIndex).toBeGreaterThan(-1);
    expect(countIndex).toBeGreaterThan(pushIndex);
    expect(selectedBlock).toContain(
      'message: translate("notification.recoveryGlossaryConflict")'
    );
    expect(selectedBlock).toContain("recoveryIds: glossaryOpenedIds");
  });

  it("only an existing-entry restore can report a conflict", () => {
    const openBlock = block(
      "async function openRecoveredGlossaryDraft(",
      "async function handleRecoveryRestoreSelected("
    );

    expect(openBlock).toContain(
      "hasRecoveryConflict: Boolean(recoveredEditor.recoveryConflict)"
    );
    expect(openBlock).toContain('? { outcome: "opened", hasRecoveryConflict: false }');
  });
});

describe("Recovery conflict texts (#574 Slice 4)", () => {
  const keys = [
    "notification.recoveryGlossaryConflict",
    "dialog.recoveryGlossaryConflict.title",
    "dialog.recoveryGlossaryConflict.message",
    "dialog.recoveryGlossaryConflict.confirm"
  ] as const;

  it("has ja / en texts without any placeholder (no Description / surface)", () => {
    for (const key of keys) {
      expect(jaTranslations[key]).not.toMatch(/\{/);
      expect(enTranslations[key]).not.toMatch(/\{/);
    }
    expect(jaTranslations["notification.recoveryGlossaryConflict"]).toBe(
      "復旧した語彙は、復旧データ作成後に更新されています。保存すると現在の語彙を上書きします。"
    );
    expect(jaTranslations["dialog.recoveryGlossaryConflict.title"]).toBe(
      "復旧した語彙を保存しますか？"
    );
    expect(jaTranslations["dialog.recoveryGlossaryConflict.confirm"]).toBe(
      "上書きして保存"
    );
    expect(enTranslations["notification.recoveryGlossaryConflict"]).toBe(
      "The recovered glossary entry was updated after this recovery data was captured. Saving will overwrite the current entry."
    );
  });
});
