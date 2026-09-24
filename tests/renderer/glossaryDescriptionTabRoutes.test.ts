import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { t, type Translate } from "../../src/shared/i18n";
import {
  createGlossaryDescriptionEditorId,
  editorIdEquals
} from "../../src/shared/editorId";
import {
  applyGlossaryDescriptionEditorSaveResult,
  createNewGlossaryDescriptionCurrentEditor,
  currentEditorTitle,
  editorIdForCurrentEditor,
  isCurrentEditorDirty,
  markdownDocumentForEditor,
  type GlossaryDescriptionCurrentEditor
} from "../../src/renderer/currentEditor";
import {
  glossaryEntryDraftCreateInput,
  glossaryEntryDraftIsNew
} from "../../src/renderer/glossaryEntryDraft";
import {
  createInitialOpenDocumentsState,
  findOpenDocument,
  getDirtyWorkingCopies,
  openOrActivateEditor,
  replaceOpenEditor,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  lifecycleDirtyChoiceIds,
  resolveDirtyWorkingCopies
} from "../../src/renderer/dirtyWorkingCopyResolution";
import {
  DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE,
  presetRepresentativeOrDefault
} from "../../src/renderer/glossaryEntryEditorPaneCommands";

const translate: Translate = (key, values) => t("ja", key, values);
const projectContext = { rootPath: "C:/novel" };
const localId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f0001";
const savedId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f0002";

function savedEntry(value: string, description = ""): GlossaryEntry {
  return {
    id: savedId,
    description,
    atoms: [
      {
        id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
        entryId: savedId,
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: "2026-09-24T00:00:00.000Z",
        updatedAt: "2026-09-24T00:00:00.000Z"
      }
    ],
    tags: [],
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z"
  };
}

function openNewEntryTab(preset = "新語"): OpenDocumentsState {
  return openOrActivateEditor(
    createInitialOpenDocumentsState(),
    createNewGlossaryDescriptionCurrentEditor(preset, localId),
    projectContext
  );
}

/** Mirrors App's `saveGlossaryDescriptionEditor` rebase + re-key step. */
function applySave(state: OpenDocumentsState, entry: GlossaryEntry) {
  const localTabId = createGlossaryDescriptionEditorId(localId);
  const open = findOpenDocument(state, localTabId)!;

  return replaceOpenEditor(
    state,
    localTabId,
    applyGlossaryDescriptionEditorSaveResult(open.editor, entry),
    projectContext
  );
}

describe("new-entry glossary Description tab (#573 Slice 7)", () => {
  it("opens unsaved and dirty, with nothing to persist until Ctrl+S", () => {
    const editor = createNewGlossaryDescriptionCurrentEditor("新語", localId);

    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(true);
    expect(isCurrentEditorDirty(editor)).toBe(true);
    expect(currentEditorTitle(editor)).toBe("語彙: 新語");
    expect(markdownDocumentForEditor(editor)).toBeNull();
    expect(glossaryEntryDraftCreateInput(editor.draft)).toEqual({
      description: "",
      atoms: [{ value: "新語", matchFlags: 0 }],
      tagIds: []
    });
    expect(getDirtyWorkingCopies(openNewEntryTab())).toMatchObject([
      { kind: "glossaryDescription", scope: "glossary", title: "語彙: 新語" }
    ]);
  });

  it("falls back to the default preset like the former create pane", () => {
    expect(presetRepresentativeOrDefault(undefined)).toBe(
      DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
    );
    expect(presetRepresentativeOrDefault("")).toBe("新しい語彙");
    expect(presetRepresentativeOrDefault("アリス")).toBe("アリス");
  });

  it("each new-entry tab gets its own identity", () => {
    const first = createNewGlossaryDescriptionCurrentEditor("新語", localId);
    const second = createNewGlossaryDescriptionCurrentEditor(
      "新語",
      "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f0003"
    );

    expect(
      editorIdEquals(
        editorIdForCurrentEditor(first, projectContext)!,
        editorIdForCurrentEditor(second, projectContext)!
      )
    ).toBe(false);
  });

  it("its first save re-keys the tab to the created entry and clears dirty", () => {
    const state = openNewEntryTab();
    const { state: saved, didCollide } = applySave(
      state,
      savedEntry("新語")
    );

    expect(didCollide).toBe(false);
    expect(saved.documents).toHaveLength(1);
    const savedTabId = createGlossaryDescriptionEditorId(savedId);
    expect(editorIdEquals(saved.activeDocumentId!, savedTabId)).toBe(true);

    const editor = findOpenDocument(saved, savedTabId)!
      .editor as GlossaryDescriptionCurrentEditor;
    expect(editor.entryId).toBe(savedId);
    expect(glossaryEntryDraftIsNew(editor.draft)).toBe(false);
    expect(isCurrentEditorDirty(editor)).toBe(false);
    expect(
      findOpenDocument(saved, createGlossaryDescriptionEditorId(localId))
    ).toBeNull();
  });

  it("is resolved by a lifecycle Save All even though its id changes", async () => {
    let state = openNewEntryTab();

    const result = await resolveDirtyWorkingCopies("explicitProjectClose", {
      getState: () => state,
      translate,
      targetName: "Novel",
      choiceDialog: async () => ({
        kind: "chosen",
        id: lifecycleDirtyChoiceIds.saveAll
      }),
      saveDirtyWorkingCopy: async () => {
        state = applySave(state, savedEntry("新語")).state;
        return "saved";
      },
      enterCommitBarrier: () => ({}) as never
    });

    expect(result.status).toBe("resolved");
  });
});

describe("App routes after removing the lower glossary pane (#573 Slice 7)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  function block(start: string, end: string): string {
    const startIndex = appSource.indexOf(start);
    const endIndex = appSource.indexOf(end, startIndex + start.length);

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);
    return appSource.slice(startIndex, endIndex);
  }

  it("no longer renders, imports or tracks the lower pane", () => {
    for (const removed of [
      "src/renderer/GlossaryEntryEditorPane.tsx",
      "src/renderer/GlossaryEntryEditorSession.tsx",
      "src/renderer/GlossaryEditor.tsx",
      "src/renderer/glossaryEntryEditorPaneState.ts",
      "src/renderer/glossaryEntryEditorPaneDirtyConfirmation.ts"
    ]) {
      expect(existsSync(removed), removed).toBe(false);
    }

    for (const gone of [
      "<GlossaryEntryEditorPane",
      "glossaryEntryEditorPaneHeight",
      "glossaryEntryEditorPaneResizeDrag",
      "transitionGlossaryEntryEditorPane",
      "confirmGlossaryEntryEditorPaneDirtyIfNeeded",
      "setGlossaryEntryEditorPane",
      "closeGlossaryEntryEditorPaneWithConfirm"
    ]) {
      expect(appSource, gone).not.toContain(gone);
    }
  });

  it("routes every existing-entry open to the entry's tab", () => {
    expect(appSource).toContain(
      "openGlossaryEntry: (entryId) => openGlossaryDescriptionTab(entryId),"
    );
    expect(appSource).toContain(
      "openGlossaryEntryEditPane: async (options) => {\n          await openGlossaryDescriptionTab(options.entryId);"
    );

    const openBlock = block(
      "async function openGlossaryDescriptionTab(",
      "function openNewGlossaryDescriptionTab("
    );
    // Duplicate open focuses the existing tab before any IPC.
    expect(openBlock.indexOf("openEditorFromUi(editorId);")).toBeLessThan(
      openBlock.indexOf("window.pergamum.glossary.getById(entryId)")
    );
  });

  it("routes create entry points to a new, unsaved tab (no DB write on open)", () => {
    expect(appSource).toContain(
      "openGlossaryEntryCreatePane: (options) => {\n          openNewGlossaryDescriptionTab(options.presetRepresentative);"
    );

    const newBlock = block(
      "function openNewGlossaryDescriptionTab(",
      "const savedGlossaryDescriptionEditorIdsRef"
    );
    expect(newBlock).toContain("createNewGlossaryDescriptionCurrentEditor(");
    expect(newBlock).toContain("createUuidv7()");
    expect(newBlock).not.toContain("window.pergamum.glossary");
  });

  it("creates a new entry on its first save and re-keys the tab", () => {
    const saveBlock = block(
      "async function saveGlossaryDescriptionEditor(",
      "async function readProjectDocument"
    );

    expect(saveBlock).toContain("const isNewEntry = glossaryEntryDraftIsNew(draft);");
    expect(saveBlock).toContain(
      "? await createGlossaryEntryFromDraft(\n                glossaryEntryDraftCreateInput(draft)\n              )"
    );
    expect(saveBlock).toContain("replaceOpenEditor(");
    expect(saveBlock).toContain("openDocumentsStateRef.current = replacement.state;");
    expect(saveBlock).toContain(
      "savedGlossaryDescriptionEditorIdsRef.current.set("
    );
  });

  it("closes a saved-then-closed new-entry tab under its new id", () => {
    const matches = appSource.match(
      /const closingId = currentIdForSavedGlossaryDescriptionEditor\(targetId\);\n {8}editorNavigation\.invalidateEditor\(closingId\);\n {8}setOpenDocumentsState\(\(state\) => closeOpenEditor\(state, closingId\)\);/g
    );

    expect(matches).toHaveLength(2);
  });

  it("relies on the ordinary unsaved-documents check for project switch", () => {
    const switchBlock = block(
      "async function confirmProjectSwitch(",
      "async function resolveProjectOpenResult("
    );

    expect(switchBlock).toContain(
      "return confirmProjectSwitchWithUnsavedDocuments({"
    );
  });
});
