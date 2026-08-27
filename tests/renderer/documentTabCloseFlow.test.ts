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
  openOrActivateDocument,
  updateActiveOpenDocument
} from "../../src/renderer/openDocuments";
import {
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { t, type Translate } from "../../src/shared/i18n";
import { createProjectDocumentEditorId } from "../../src/shared/editorId";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

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
    updateCurrentDocumentContent(document, "changed")
  );
}

describe("buildDirtyCloseChoiceDialogOptions (#192 dogfood)", () => {
  it("uses icon.kind 'warning', not an SVG file name", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

    expect(options.icon).toEqual({ kind: "warning", tooltip: "Warning" });
  });

  it("passes clipboardText: null", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

    expect(options.clipboardText).toBeNull();
  });

  it("is a three-choice dialog with stable IDs and roles", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

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
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);
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
    const options = buildDirtyCloseChoiceDialogOptions(translateJa);

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

  it("uses translated strings for the title and message", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

    expect(options.title).toBe("Unsaved Changes");
    expect(options.message).toEqual({
      kind: "plainText",
      text: "This tab has unsaved changes.\nClosing it will discard the unsaved changes."
    });
  });

  it("disables backdrop-click dismissal — an accidental backdrop click must not discard unsaved changes (#184 follow-up)", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

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
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

    for (const platform of ["windows", "linux", "macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).toEqual(["saveAndClose", "discardAndClose", "cancel"]);
    }
  });

  it("does not use the old macOS/other horizontal order for dirty-close choices", () => {
    const options = buildDirtyCloseChoiceDialogOptions(translateEn);

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
    ).resolves.toBeUndefined();
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
});
