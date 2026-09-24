import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { t, type Translate } from "../../src/shared/i18n";
import type { AppChoiceDialogOptions } from "../../src/renderer/dialog/appDialogTypes";
import {
  createGlossaryDescriptionEditorId,
  editorIdEquals
} from "../../src/shared/editorId";
import { evaluateCommandEnablement } from "../../src/shared/commandEnablement";
import { buildCommandContextSnapshot } from "../../src/renderer/commandContextSnapshot";
import {
  applyGlossaryDescriptionEditorSaveResult,
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  currentEditorTitle,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  updateGlossaryDescriptionEditorText,
  type CurrentEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { createGlossaryDescriptionMarkdownSurfaceSource } from "../../src/renderer/markdownSurfaceSource";
import {
  createInitialOpenDocumentsState,
  documentTabs,
  findOpenDocument,
  getDirtyWorkingCopies,
  hasDirtyOpenDocuments,
  openOrActivateEditor,
  updateActiveOpenEditor,
  updateOpenEditor,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  dirtyCloseChoiceIds,
  runEditorCloseFlow
} from "../../src/renderer/documentTabCloseFlow";
import {
  getDirtyWorkingCopiesForLifecycle,
  lifecycleDirtyChoiceIds,
  resolveDirtyWorkingCopies
} from "../../src/renderer/dirtyWorkingCopyResolution";
import { confirmProjectSwitchWithUnsavedDocuments } from "../../src/renderer/projectSwitchConfirmation";
import { buildSessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import { buildRecoveryDirtyDocuments } from "../../src/renderer/recovery/recoveryDocumentPayload";
import {
  saveAsCommandWhen,
  saveDocumentCommandWhen
} from "../../src/renderer/editorCommands";
import { paragraphIndentCommandWhen } from "../../src/renderer/assistCommands";

const translate: Translate = (key, values) => t("ja", key, values);
const projectContext = { rootPath: "C:/novel" };
const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b";
const glossaryTabId = createGlossaryDescriptionEditorId(entryId);

function entry(
  description: string,
  updatedAt = "2026-09-24T00:00:00.000Z"
): GlossaryEntry {
  return {
    id: entryId,
    description,
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
        entryId,
        sortOrder: 0,
        value: "コードフェンス",
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt
      }
    ],
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt
  };
}

function edit(editor: CurrentEditor, description: string): CurrentEditor {
  const breaks = (editor as GlossaryDescriptionCurrentEditor)
    .descriptionLineEndingBreaks;

  return updateGlossaryDescriptionEditorText(editor, description, breaks);
}

function glossaryState(dirty: boolean): OpenDocumentsState {
  const opened = openOrActivateEditor(
    createInitialOpenDocumentsState(),
    createGlossaryDescriptionCurrentEditor(entry("保存済み")),
    projectContext
  );

  return dirty
    ? updateActiveOpenEditor(opened, (editor) => edit(editor, "編集中"))
    : opened;
}

describe("glossaryDescription dirty state (#573 Slice 4)", () => {
  it("is clean when opened, dirty after a Description edit, clean when edited back", () => {
    const opened = createGlossaryDescriptionCurrentEditor(entry("保存済み"));
    const edited = edit(opened, "編集中");

    expect(isCurrentEditorDirty(opened)).toBe(false);
    expect(isCurrentEditorDirty(edited)).toBe(true);
    expect(isCurrentEditorDirty(edit(edited, "保存済み"))).toBe(false);
  });

  it("reports dirtiness through its MarkdownSurfaceSource", () => {
    const opened = createGlossaryDescriptionCurrentEditor(entry("保存済み"));
    const edited = edit(opened, "編集中") as GlossaryDescriptionCurrentEditor;

    expect(createGlossaryDescriptionMarkdownSurfaceSource(opened).isDirty).toBe(
      false
    );
    expect(createGlossaryDescriptionMarkdownSurfaceSource(edited).isDirty).toBe(
      true
    );
  });

  it("shows the shared dirty tab marker state", () => {
    expect(documentTabs(glossaryState(true))[0]).toMatchObject({
      title: "語彙: コードフェンス",
      isDirty: true,
      isExternalMarkdownFile: false
    });
  });
});

describe("glossaryDescription saved baseline (#573 Slice 4)", () => {
  it("rebases the draft onto the saved entry and clears dirty", () => {
    const edited = edit(
      createGlossaryDescriptionCurrentEditor(entry("保存済み")),
      "編集中"
    );
    const saved = applyGlossaryDescriptionEditorSaveResult(
      edited,
      entry("編集中", "2026-09-24T01:00:00.000Z")
    ) as GlossaryDescriptionCurrentEditor;

    expect(saved.draft.entry.description).toBe("編集中");
    expect(saved.draft.entry.updatedAt).toBe("2026-09-24T01:00:00.000Z");
    expect(saved.draft.description).toBe("編集中");
    expect(isCurrentEditorDirty(saved)).toBe(false);
  });

  it("keeps edits typed while the save was in flight dirty", () => {
    const typedDuringSave = edit(
      createGlossaryDescriptionCurrentEditor(entry("保存済み")),
      "さらに編集"
    );
    const saved = applyGlossaryDescriptionEditorSaveResult(
      typedDuringSave,
      entry("編集中")
    ) as GlossaryDescriptionCurrentEditor;

    expect(saved.draft.description).toBe("さらに編集");
    expect(isCurrentEditorDirty(saved)).toBe(true);
  });

  it("refreshes the tab title from the saved representative surface", () => {
    const renamed = entry("保存済み");
    renamed.atoms = [{ ...renamed.atoms[0], value: "フェンス" }];

    expect(
      currentEditorTitle(
        applyGlossaryDescriptionEditorSaveResult(
          createGlossaryDescriptionCurrentEditor(entry("保存済み")),
          renamed
        )
      )
    ).toBe("語彙: フェンス");
  });

  it("ignores a save result for another entry or a Markdown editor", () => {
    const opened = createGlossaryDescriptionCurrentEditor(entry("保存済み"));
    const other = {
      ...entry("x"),
      id: "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0c"
    };

    expect(applyGlossaryDescriptionEditorSaveResult(opened, other)).toBe(opened);

    const markdown = createMarkdownCurrentEditor(
      createProjectDocument({ relativePath: "a.md", name: "a.md" }, "本文")
    );
    expect(applyGlossaryDescriptionEditorSaveResult(markdown, entry("x"))).toBe(
      markdown
    );
  });

  it("updates only the saved tab inside OpenDocuments", () => {
    const state = updateOpenEditor(glossaryState(true), glossaryTabId, (editor) =>
      applyGlossaryDescriptionEditorSaveResult(editor, entry("編集中"))
    );

    expect(hasDirtyOpenDocuments(state)).toBe(false);
  });
});

describe("glossaryDescription working copy (#573 Slice 4)", () => {
  it("is a project-scoped glossary working copy", () => {
    expect(getDirtyWorkingCopies(glossaryState(true))).toEqual([
      {
        editorId: glossaryTabId,
        kind: "glossaryDescription",
        scope: "glossary",
        title: "語彙: コードフェンス"
      }
    ]);
    expect(getDirtyWorkingCopies(glossaryState(false))).toEqual([]);
  });

  it("is resolved by explicit project close, window close and app quit", () => {
    const state = glossaryState(true);

    for (const intent of [
      "explicitProjectClose",
      "ordinaryWindowClose",
      "explicitApplicationQuit"
    ] as const) {
      expect(getDirtyWorkingCopiesForLifecycle(intent, state)).toHaveLength(1);
    }
  });

  it("is saved through the lifecycle Save All choice", async () => {
    let state = glossaryState(true);
    const saveDirtyWorkingCopy = vi.fn(async () => {
      state = updateOpenEditor(state, glossaryTabId, (editor) =>
        applyGlossaryDescriptionEditorSaveResult(editor, entry("編集中"))
      );
      return "saved" as const;
    });

    const result = await resolveDirtyWorkingCopies("explicitProjectClose", {
      getState: () => state,
      translate,
      targetName: "Novel",
      choiceDialog: async () => ({
        kind: "chosen",
        id: lifecycleDirtyChoiceIds.saveAll
      }),
      saveDirtyWorkingCopy,
      enterCommitBarrier: () => ({}) as never
    });

    expect(saveDirtyWorkingCopy).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "glossaryDescription", scope: "glossary" })
    );
    expect(result.status).toBe("resolved");
  });

  it("aborts the lifecycle when the glossary save fails", async () => {
    const result = await resolveDirtyWorkingCopies("explicitApplicationQuit", {
      getState: () => glossaryState(true),
      translate,
      targetName: "Pergamum",
      choiceDialog: async () => ({
        kind: "chosen",
        id: lifecycleDirtyChoiceIds.saveAll
      }),
      saveDirtyWorkingCopy: async () => "failed",
      enterCommitBarrier: () => ({}) as never
    });

    expect(result).toMatchObject({ status: "aborted", outcome: "failed" });
  });

  it("asks for confirmation before a project switch", async () => {
    const choiceDialog = vi.fn(async () => ({ kind: "dismissed" as const }));

    await expect(
      confirmProjectSwitchWithUnsavedDocuments({
        state: glossaryState(true),
        translate,
        choiceDialog
      })
    ).resolves.toBe(false);
    expect(choiceDialog).toHaveBeenCalledTimes(1);
  });

  it("records only its entry id in the Session (#573 Slice 8) and needs a project for Recovery (#573 Slice 9)", () => {
    const state = glossaryState(true);

    expect(
      buildSessionSnapshotInputs("session", null, state, true).editors.map(
        ({ editor }) => editor
      )
    ).toEqual([
      { kind: "glossaryDescription", order: 0, entryId, viewState: null }
    ]);
    // #573 Slice 9: dirty glossary tabs are captured for Recovery — but
    // only with an open project (their rows are project-scoped).
    expect(
      buildRecoveryDirtyDocuments(state, {
        project: null,
        activeProjectContext: projectContext
      } as never)
    ).toEqual([]);
    expect(
      markdownDocumentForEditor(findOpenDocument(state, glossaryTabId)!.editor)
    ).toBeNull();
  });
});

describe("glossaryDescription close confirm (#573 Slice 4)", () => {
  function runClose(
    state: OpenDocumentsState,
    choice: string | null,
    saveResult: "saved" | "failed" = "saved"
  ) {
    const onClose = vi.fn();
    const saveDirtyEditorBeforeClose = vi.fn(async () => saveResult);
    const choiceDialog = vi.fn(async (_options: AppChoiceDialogOptions) =>
      choice === null
        ? ({ kind: "dismissed" } as const)
        : ({ kind: "chosen", id: choice } as const)
    );

    return {
      onClose,
      saveDirtyEditorBeforeClose,
      choiceDialog,
      outcome: runEditorCloseFlow(glossaryTabId, {
        state,
        translate,
        choiceDialog,
        saveDirtyEditorBeforeClose,
        onClose
      })
    };
  }

  it("closes a clean glossary tab without asking", async () => {
    const run = runClose(glossaryState(false), null);

    await expect(run.outcome).resolves.toBe("closed");
    expect(run.choiceDialog).not.toHaveBeenCalled();
  });

  it("save-and-close saves first and closes only on success", async () => {
    const ok = runClose(glossaryState(true), dirtyCloseChoiceIds.saveAndClose);
    await expect(ok.outcome).resolves.toBe("closed");
    expect(ok.saveDirtyEditorBeforeClose).toHaveBeenCalledWith(glossaryTabId);
    expect(ok.onClose).toHaveBeenCalledWith(glossaryTabId);

    const failed = runClose(
      glossaryState(true),
      dirtyCloseChoiceIds.saveAndClose,
      "failed"
    );
    await expect(failed.outcome).resolves.toBe("cancelled");
    expect(failed.onClose).not.toHaveBeenCalled();
  });

  it("discard-and-close closes without saving; cancel keeps the tab", async () => {
    const discard = runClose(
      glossaryState(true),
      dirtyCloseChoiceIds.discardAndClose
    );
    await expect(discard.outcome).resolves.toBe("closed");
    expect(discard.saveDirtyEditorBeforeClose).not.toHaveBeenCalled();

    const cancel = runClose(glossaryState(true), dirtyCloseChoiceIds.cancel);
    await expect(cancel.outcome).resolves.toBe("cancelled");
    expect(cancel.onClose).not.toHaveBeenCalled();
  });

  it("names the glossary tab in the confirmation", async () => {
    const run = runClose(glossaryState(true), dirtyCloseChoiceIds.cancel);
    await run.outcome;

    expect(run.choiceDialog.mock.calls[0][0].message).toEqual({
      kind: "plainText",
      text: translate("dialog.unsavedChanges.prompt", {
        targetName: "語彙: コードフェンス"
      })
    });
  });
});

describe("glossaryDescription command enablement (#573 Slice 4)", () => {
  function glossaryContext(overrides: {
    isDirty: boolean;
    readWrite: boolean;
  }) {
    // Mirrors App.tsx: a glossary tab has a saveable working copy and is
    // project-owned, but is never `editor.kind.markdown`.
    return buildCommandContextSnapshot({
      projectIsOpen: true,
      projectAccessReadWrite: overrides.readWrite,
      projectAccessReadOnly: !overrides.readWrite,
      editorHasDocument: true,
      editorIsDirty: overrides.isDirty,
      editorKindMarkdown: false,
      editorDocumentProjectOwned: true,
      editorDocumentProjectFile: false,
      activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
      occurrenceTrackingActive: false,
      recoveryOwner: false,
      recoveryHasRecoverableCandidates: false
    });
  }

  it("enables Save only while dirty in a read-write project", () => {
    expect(
      evaluateCommandEnablement(
        saveDocumentCommandWhen,
        glossaryContext({ isDirty: true, readWrite: true })
      )
    ).toBe(true);
    expect(
      evaluateCommandEnablement(
        saveDocumentCommandWhen,
        glossaryContext({ isDirty: false, readWrite: true })
      )
    ).toBe(false);
    expect(
      evaluateCommandEnablement(
        saveDocumentCommandWhen,
        glossaryContext({ isDirty: true, readWrite: false })
      )
    ).toBe(false);
  });

  it("keeps Save As and paragraph indent unavailable", () => {
    const context = glossaryContext({ isDirty: true, readWrite: true });

    expect(evaluateCommandEnablement(saveAsCommandWhen, context)).toBe(false);
    expect(evaluateCommandEnablement(paragraphIndentCommandWhen, context)).toBe(
      false
    );
  });
});

describe("App glossary Description save wiring (#573 Slice 4)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("routes Ctrl+S / close / lifecycle saves of a glossary tab to the glossary save", () => {
    const saveFileBlock = block(
      "async function saveFile(",
      "async function saveGlossaryDescriptionEditor("
    );

    expect(saveFileBlock).toContain(
      'if (targetOpenDocument.editor.kind === "glossaryDescription") {\n      return await saveGlossaryDescriptionEditor(targetOpenDocument.id);\n    }'
    );
  });

  it("validates, then saves the WHOLE draft through the existing glossary update route", () => {
    const saveBlock = block(
      "async function saveGlossaryDescriptionEditor(",
      "async function readProjectDocument"
    );

    expect(saveBlock).toContain('projectRef.current?.accessMode.kind !== "readWrite"');
    expect(saveBlock).toContain("glossaryEntryDraftValidity(draft)");
    expect(saveBlock).toContain(
      ": await updateGlossaryEntryFromDraft(\n                glossaryEntryDraftUpdateInput(draft)\n              );"
    );
    expect(saveBlock).toContain(
      "applyGlossaryDescriptionEditorSaveResult(\n              latestOpenDocument.editor,\n              savedEntry\n            )"
    );
    expect(saveBlock).not.toContain("window.pergamum.files");
    expect(saveBlock).not.toContain("window.pergamum.projects");
    expect(
      saveBlock.indexOf("glossaryEntryDraftValidity(draft)")
    ).toBeLessThan(saveBlock.indexOf("updateGlossaryEntryFromDraft("));
  });

  it("keeps the glossary tab identity keyed by entry id", () => {
    expect(
      editorIdEquals(glossaryTabId, createGlossaryDescriptionEditorId(entryId))
    ).toBe(true);
  });
});
