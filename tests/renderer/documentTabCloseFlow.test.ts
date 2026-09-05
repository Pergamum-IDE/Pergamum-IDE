import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildDirtyCloseChoiceDialogOptions,
  dirtyCloseChoiceIds,
  runEditorCloseFlow
} from "../../src/renderer/documentTabCloseFlow";
import {
  AppDialogError,
  choiceDialogDismissesOnBackdropClick,
  resolveChoiceDialogActionOrder
} from "../../src/renderer/dialog/appDialogTypes";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor,
  openOrActivateDocument,
  updateActiveOpenDocument,
  updateActiveOpenEditor
} from "../../src/renderer/openDocuments";
import {
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import { createGlossaryEntryCurrentEditor } from "../../src/renderer/currentEditor";
import { t, type Translate } from "../../src/shared/i18n";
import { createProjectDocumentEditorId } from "../../src/shared/editorId";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { updateGlossaryEntryDraftDescription } from "../../src/renderer/glossaryEntryDraft";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);
const tabTargetName = "Chapter 1.md";
const projectContext = { rootPath: "C:\\Novel" };

const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "王国の首都",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tags: [],
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "王都",
      matchFlags: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ]
};

// #262: the zero-tab initial state has no active editor to close, so these
// helpers seed a real single Untitled Markdown tab.
function cleanState() {
  return openOrActivateDocument(
    createInitialOpenDocumentsState(),
    createUntitledDocument(),
    null
  );
}

function dirtyState() {
  return updateActiveOpenDocument(cleanState(), (document) =>
    updateCurrentDocumentContent(
      document,
      "changed",
      buildLineEndingBreakSet(analyzeLineEndings("changed"))
    )
  );
}

function dirtyGlossaryState() {
  return updateActiveOpenEditor(
    openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    ),
    (editor) =>
      editor.kind === "glossaryEntry"
        ? {
            ...editor,
            draft: updateGlossaryEntryDraftDescription(
              editor.draft,
              "変更後の説明"
            )
          }
        : editor
  );
}

describe("buildDirtyCloseChoiceDialogOptions (#192 dogfood)", () => {
  it("uses icon.kind 'warning', not an SVG file name", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    expect(options.icon).toEqual({ kind: "warning", tooltip: "Warning" });
  });

  it("passes clipboardText: null", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    expect(options.clipboardText).toBeNull();
  });

  it("is a three-choice dialog with stable IDs and roles", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    expect(options.choices).toEqual([
      {
        id: dirtyCloseChoiceIds.saveAndClose,
        label: "Save and Close",
        role: "primary"
      },
      {
        id: dirtyCloseChoiceIds.discardAndClose,
        label: "Discard Changes and Close",
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: dirtyCloseChoiceIds.cancel,
        label: "Cancel",
        role: "cancel"
      }
    ]);
    expect(options.primaryChoiceId).toBe(dirtyCloseChoiceIds.saveAndClose);
    expect(options.cancelChoiceId).toBe(dirtyCloseChoiceIds.cancel);
    expect(options.initialFocusChoiceId).toBe(dirtyCloseChoiceIds.cancel);
  });

  it("adds a supplemental alert-triangle icon only to the dirty-close discard choice", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );
    const saveChoice = options.choices.find(
      (choice) => choice.id === dirtyCloseChoiceIds.saveAndClose
    );
    const discardChoice = options.choices.find(
      (choice) => choice.id === dirtyCloseChoiceIds.discardAndClose
    );
    const cancelChoice = options.choices.find(
      (choice) => choice.id === dirtyCloseChoiceIds.cancel
    );
    const source = readFileSync("src/renderer/documentTabCloseFlow.ts", "utf8");

    expect(saveChoice?.icon).toBeUndefined();
    expect(discardChoice?.icon).toEqual({ kind: "alertTriangle" });
    expect(cancelChoice?.icon).toBeUndefined();
    expect(source).not.toContain(".svg?raw");
    expect(source).not.toContain("alertTriangleIcon");
    expect(source).not.toContain("feather-alert-triangle");
  });

  it("uses stable choice IDs, not labels", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateJa,
      tabTargetName
    );

    expect(options.choices.map((choice) => choice.id)).toEqual([
      "saveAndClose",
      "discardAndClose",
      "cancel"
    ]);
    expect(options.choices.map((choice) => choice.label)).toEqual([
      "保存して閉じる",
      "変更を破棄して閉じる",
      "キャンセル"
    ]);
    expect(options.choices.map((choice) => choice.id)).not.toEqual(
      options.choices.map((choice) => choice.label)
    );
  });

  it("uses translated strings for the title and target-name prompt", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    expect(options.title).toBe("Unsaved Changes");
    expect(options.message).toEqual({
      kind: "plainText",
      text:
        "Chapter 1.md has unsaved changes.\n" +
        "Choose whether to save the changes before closing."
    });
  });

  it("disables backdrop-click dismissal — an accidental backdrop click must not discard unsaved changes (#184 follow-up)", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    expect(options.dismissOnBackdropClick).toBe(false);
    expect(choiceDialogDismissesOnBackdropClick(options)).toBe(false);
  });

  it("uses choice dialog options, not binary confirm options", () => {
    const source = readFileSync("src/renderer/documentTabCloseFlow.ts", "utf8");

    expect(source).toContain("AppChoiceDialogOptions");
    expect(source).toContain("AppChoiceDialogResult");
    expect(source).not.toContain("AppConfirmDialogOptions");
    expect(source).not.toContain("AppConfirmDialogResult");
  });

  it("wires saveAndClose through the save-before-close callback, not the old placeholder", () => {
    const source = readFileSync("src/renderer/documentTabCloseFlow.ts", "utf8");
    const saveBranchStart = source.indexOf(
      "case dirtyCloseChoiceIds.saveAndClose:"
    );
    const discardBranchStart = source.indexOf(
      "case dirtyCloseChoiceIds.discardAndClose:"
    );

    expect(saveBranchStart).toBeGreaterThan(-1);
    expect(discardBranchStart).toBeGreaterThan(saveBranchStart);

    const saveBranchSource = source.slice(saveBranchStart, discardBranchStart);

    expect(saveBranchSource).toContain(
      "deps.saveDirtyEditorBeforeClose(targetId)"
    );
    expect(saveBranchSource).not.toContain(
      "TODO(save-before-close): Temporary dogfood placeholder."
    );
    expect(saveBranchSource).not.toContain("saveFile");
    expect(saveBranchSource).not.toContain("saveCurrentDocument");
  });

  it("orders choices save / discard / cancel on every platform through the choice foundation", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    for (const platform of ["windows", "linux", "macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).toEqual(["saveAndClose", "discardAndClose", "cancel"]);
    }
  });

  it("does not use the old macOS/other horizontal order for dirty-close choices", () => {
    const options = buildDirtyCloseChoiceDialogOptions(
      translateEn,
      tabTargetName
    );

    for (const platform of ["macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).not.toEqual(["discardAndClose", "cancel", "saveAndClose"]);
    }
  });
});

describe("runEditorCloseFlow (#184/#192)", () => {
  it("closes a clean editor without opening a choice dialog", async () => {
    const state = cleanState();
    const choiceDialog = vi.fn();
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateEn,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(state.activeDocumentId);
  });

  it("saves then closes a dirty editor on saveAndClose when saving succeeds", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: dirtyCloseChoiceIds.saveAndClose
    });
    const saveDirtyEditorBeforeClose = vi.fn().mockResolvedValue("saved");
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateJa,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(choiceDialog.mock.calls[0]?.[0].message).toEqual({
      kind: "plainText",
      text:
        "Untitled.mdには保存されていない変更があります。\n" +
        "閉じる前に変更を保存するか選択してください。"
    });
    expect(saveDirtyEditorBeforeClose).toHaveBeenCalledWith(
      state.activeDocumentId
    );
    expect(onClose).toHaveBeenCalledWith(state.activeDocumentId);
  });

  it.each(["cancelled", "failed", "ignored"] as const)(
    "keeps a dirty editor open when saveAndClose returns %s",
    async (saveResult) => {
      const state = dirtyState();
      const choiceDialog = vi.fn().mockResolvedValue({
        kind: "chosen",
        id: dirtyCloseChoiceIds.saveAndClose
      });
      const saveDirtyEditorBeforeClose = vi.fn().mockResolvedValue(saveResult);
      const onClose = vi.fn();

      await runEditorCloseFlow(undefined, {
        state,
        translate: translateJa,
        choiceDialog,
        saveDirtyEditorBeforeClose,
        onClose
      });

      expect(saveDirtyEditorBeforeClose).toHaveBeenCalledWith(
        state.activeDocumentId
      );
      expect(onClose).not.toHaveBeenCalled();
    }
  );

  it("closes a dirty editor on discardAndClose", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: dirtyCloseChoiceIds.discardAndClose
    });
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateEn,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(state.activeDocumentId);
  });

  it("keeps a dirty editor open on cancel", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: dirtyCloseChoiceIds.cancel
    });
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateEn,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a dirty editor open on dismissed", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockResolvedValue({ kind: "dismissed" });
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateEn,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("absorbs a concurrent AppDialogError('dialogAlreadyOpen') without throwing or closing", async () => {
    const state = dirtyState();
    const choiceDialog = vi
      .fn()
      .mockRejectedValue(new AppDialogError("dialogAlreadyOpen"));
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await expect(
      runEditorCloseFlow(undefined, {
        state,
        translate: translateEn,
        choiceDialog,
        saveDirtyEditorBeforeClose,
        onClose
      })
    ).resolves.toBe("cancelled");
    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rethrows an unrelated error from choiceDialog", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockRejectedValue(new Error("boom"));
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await expect(
      runEditorCloseFlow(undefined, {
        state,
        translate: translateEn,
        choiceDialog,
        saveDirtyEditorBeforeClose,
        onClose
      })
    ).rejects.toThrow("boom");
    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing for an explicit editorId that is not open — never closes an unrelated editor", async () => {
    const state = cleanState();
    const choiceDialog = vi.fn();
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();
    const unrelatedEditorId = createProjectDocumentEditorId("not-open.md", {
      rootPath: "C:\\Novel"
    });

    await runEditorCloseFlow(unrelatedEditorId, {
      state,
      translate: translateEn,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns an outcome so a batch close can stop on cancel (#354)", async () => {
    const cancel = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: dirtyCloseChoiceIds.cancel
    });
    const noop = vi.fn();

    // clean editor -> "closed"
    expect(
      await runEditorCloseFlow(undefined, {
        state: cleanState(),
        translate: translateEn,
        choiceDialog: vi.fn(),
        saveDirtyEditorBeforeClose: vi.fn(),
        onClose: noop
      })
    ).toBe("closed");

    // dirty editor, user cancels -> "cancelled"
    expect(
      await runEditorCloseFlow(undefined, {
        state: dirtyState(),
        translate: translateEn,
        choiceDialog: cancel,
        saveDirtyEditorBeforeClose: vi.fn(),
        onClose: noop
      })
    ).toBe("cancelled");

    // dirty editor, save fails -> "cancelled"
    expect(
      await runEditorCloseFlow(undefined, {
        state: dirtyState(),
        translate: translateEn,
        choiceDialog: vi.fn().mockResolvedValue({
          kind: "chosen",
          id: dirtyCloseChoiceIds.saveAndClose
        }),
        saveDirtyEditorBeforeClose: vi.fn().mockResolvedValue("failed"),
        onClose: noop
      })
    ).toBe("cancelled");

    // nothing to close -> "noTarget"
    expect(
      await runEditorCloseFlow(
        createProjectDocumentEditorId("not-open.md", { rootPath: "C:\\Novel" }),
        {
          state: cleanState(),
          translate: translateEn,
          choiceDialog: vi.fn(),
          saveDirtyEditorBeforeClose: vi.fn(),
          onClose: noop
        }
      )
    ).toBe("noTarget");
  });

  it("uses the glossary tab title in the shared unsaved-changes prompt", async () => {
    const state = dirtyGlossaryState();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: dirtyCloseChoiceIds.cancel
    });
    const saveDirtyEditorBeforeClose = vi.fn();
    const onClose = vi.fn();

    await runEditorCloseFlow(undefined, {
      state,
      translate: translateJa,
      choiceDialog,
      saveDirtyEditorBeforeClose,
      onClose
    });

    expect(choiceDialog).toHaveBeenCalledTimes(1);
    expect(choiceDialog.mock.calls[0]?.[0].message).toEqual({
      kind: "plainText",
      text:
        "王都には保存されていない変更があります。\n" +
        "閉じる前に変更を保存するか選択してください。"
    });
    expect(saveDirtyEditorBeforeClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
