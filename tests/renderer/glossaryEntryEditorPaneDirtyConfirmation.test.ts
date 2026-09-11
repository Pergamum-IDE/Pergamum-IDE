import { describe, expect, it, vi } from "vitest";
import { t, type Translate } from "../../src/shared/i18n";
import {
  AppDialogError,
  type AppChoiceDialogOptions,
  type AppChoiceDialogResult
} from "../../src/renderer/dialog/appDialogTypes";
import {
  buildGlossaryEntryEditorPaneDirtyChoiceDialogOptions,
  confirmGlossaryEntryEditorPaneDiscardOrSave,
  glossaryEntryEditorPaneDirtyChoiceIds
} from "../../src/renderer/glossaryEntryEditorPaneDirtyConfirmation";

const translate: Translate = (key, values) => t("ja", key, values);

describe("buildGlossaryEntryEditorPaneDirtyChoiceDialogOptions (#436 Slice 11)", () => {
  it("offers save/discard/cancel, defaults to Save, and focuses Cancel", () => {
    const options = buildGlossaryEntryEditorPaneDirtyChoiceDialogOptions(translate);

    expect(options.choices.map((choice) => choice.id)).toEqual([
      glossaryEntryEditorPaneDirtyChoiceIds.save,
      glossaryEntryEditorPaneDirtyChoiceIds.discard,
      glossaryEntryEditorPaneDirtyChoiceIds.cancel
    ]);
    expect(options.primaryChoiceId).toBe(glossaryEntryEditorPaneDirtyChoiceIds.save);
    expect(options.cancelChoiceId).toBe(glossaryEntryEditorPaneDirtyChoiceIds.cancel);
    expect(options.initialFocusChoiceId).toBe(
      glossaryEntryEditorPaneDirtyChoiceIds.cancel
    );
    expect(options.dismissOnBackdropClick).toBe(false);
    expect(options.title).toBe("未保存の語彙があります");
  });
});

describe("confirmGlossaryEntryEditorPaneDiscardOrSave (#436 Slice 11)", () => {
  function deps(overrides: {
    isDirty?: () => boolean;
    save?: () => Promise<boolean>;
    choiceDialog?: (
      options: AppChoiceDialogOptions
    ) => Promise<AppChoiceDialogResult>;
  }) {
    return {
      isDirty: overrides.isDirty ?? (() => true),
      save: overrides.save ?? vi.fn(() => Promise.resolve(true)),
      translate,
      choiceDialog:
        overrides.choiceDialog ??
        vi.fn(() =>
          Promise.resolve({
            kind: "chosen" as const,
            id: glossaryEntryEditorPaneDirtyChoiceIds.save
          })
        )
    };
  }

  it("proceeds without ever opening a dialog when there is nothing dirty", async () => {
    const choiceDialog = vi.fn();
    const save = vi.fn();

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ isDirty: () => false, save, choiceDialog })
    );

    expect(outcome).toBe("proceed");
    expect(choiceDialog).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves and proceeds when the user chooses 保存して続行 and the save succeeds", async () => {
    const save = vi.fn(() => Promise.resolve(true));
    const choiceDialog = vi.fn(() =>
      Promise.resolve({
        kind: "chosen" as const,
        id: glossaryEntryEditorPaneDirtyChoiceIds.save
      })
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ save, choiceDialog })
    );

    expect(outcome).toBe("proceed");
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels when the user chooses 保存して続行 but the save FAILS — never silently discards", async () => {
    const save = vi.fn(() => Promise.resolve(false));
    const choiceDialog = vi.fn(() =>
      Promise.resolve({
        kind: "chosen" as const,
        id: glossaryEntryEditorPaneDirtyChoiceIds.save
      })
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ save, choiceDialog })
    );

    expect(outcome).toBe("cancel");
  });

  it("proceeds WITHOUT saving when the user chooses 破棄して続行", async () => {
    const save = vi.fn(() => Promise.resolve(true));
    const choiceDialog = vi.fn(() =>
      Promise.resolve({
        kind: "chosen" as const,
        id: glossaryEntryEditorPaneDirtyChoiceIds.discard
      })
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ save, choiceDialog })
    );

    expect(outcome).toBe("proceed");
    expect(save).not.toHaveBeenCalled();
  });

  it("cancels when the user chooses キャンセル", async () => {
    const choiceDialog = vi.fn(() =>
      Promise.resolve({
        kind: "chosen" as const,
        id: glossaryEntryEditorPaneDirtyChoiceIds.cancel
      })
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ choiceDialog })
    );

    expect(outcome).toBe("cancel");
  });

  it("cancels when the dialog is dismissed (e.g. Escape)", async () => {
    const choiceDialog = vi.fn(() =>
      Promise.resolve({ kind: "dismissed" as const })
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ choiceDialog })
    );

    expect(outcome).toBe("cancel");
  });

  it("cancels (rather than throwing) when another dialog is already open", async () => {
    const choiceDialog = vi.fn(() =>
      Promise.reject(new AppDialogError("dialogAlreadyOpen"))
    );

    const outcome = await confirmGlossaryEntryEditorPaneDiscardOrSave(
      deps({ choiceDialog })
    );

    expect(outcome).toBe("cancel");
  });

  it("rethrows any other dialog error", async () => {
    const choiceDialog = vi.fn(() => Promise.reject(new Error("boom")));

    await expect(
      confirmGlossaryEntryEditorPaneDiscardOrSave(deps({ choiceDialog }))
    ).rejects.toThrow("boom");
  });
});
