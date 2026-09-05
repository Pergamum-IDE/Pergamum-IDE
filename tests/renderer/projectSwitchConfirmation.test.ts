import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildProjectSwitchUnsavedChoiceDialogOptions,
  confirmProjectSwitchWithUnsavedDocuments,
  projectSwitchChoiceIds
} from "../../src/renderer/projectSwitchConfirmation";
import {
  choiceDialogDismissesOnBackdropClick,
  resolveChoiceDialogActionOrder
} from "../../src/renderer/dialog/appDialogTypes";
import {
  createInitialOpenDocumentsState,
  openOrActivateDocument,
  updateActiveOpenDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import { t, type Translate } from "../../src/shared/i18n";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

// #262: the zero-tab initial state genuinely has no unsaved documents.
function cleanState(): OpenDocumentsState {
  return createInitialOpenDocumentsState();
}

function dirtyState(): OpenDocumentsState {
  return updateActiveOpenDocument(
    openOrActivateDocument(
      createInitialOpenDocumentsState(),
      createUntitledDocument(() => "0198d95f-97d8-7000-8000-000000000001"),
      null
    ),
    (document) =>
      updateCurrentDocumentContent(
        document,
        "changed",
        buildLineEndingBreakSet(analyzeLineEndings("changed"))
      )
  );
}

describe("buildProjectSwitchUnsavedChoiceDialogOptions", () => {
  it("uses project-switch-specific translated plain text", () => {
    const jaOptions = buildProjectSwitchUnsavedChoiceDialogOptions(translateJa);
    const enOptions = buildProjectSwitchUnsavedChoiceDialogOptions(translateEn);

    expect(jaOptions).toMatchObject({
      title: "未保存の変更があります",
      message: {
        kind: "plainText",
        text: "未保存の文書があります。\nプロジェクトを切り替えると、未保存の変更は破棄されます。"
      }
    });
    expect(enOptions).toMatchObject({
      title: "Unsaved Changes",
      message: {
        kind: "plainText",
        text: "There are unsaved documents.\nSwitching projects will discard unsaved changes."
      }
    });
  });

  it("uses concrete destructive and cancel labels, not generic confirmation labels", () => {
    const jaOptions = buildProjectSwitchUnsavedChoiceDialogOptions(translateJa);
    const enOptions = buildProjectSwitchUnsavedChoiceDialogOptions(translateEn);

    expect(jaOptions.choices.map((choice) => choice.label)).toEqual([
      "変更を破棄して続行",
      "キャンセル"
    ]);
    expect(enOptions.choices.map((choice) => choice.label)).toEqual([
      "Discard Changes and Continue",
      "Cancel"
    ]);
    expect(jaOptions.choices.map((choice) => choice.label)).not.toContain("OK");
    expect(jaOptions.choices.map((choice) => choice.label)).not.toContain("はい");
    expect(enOptions.choices.map((choice) => choice.label)).not.toContain("OK");
    expect(enOptions.choices.map((choice) => choice.label)).not.toContain("Yes");
  });

  it("marks discard as destructive and cancel as cancel with safe initial focus", () => {
    const options = buildProjectSwitchUnsavedChoiceDialogOptions(translateEn);

    expect(options.choices).toEqual([
      {
        id: projectSwitchChoiceIds.discardAndContinue,
        label: "Discard Changes and Continue",
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: projectSwitchChoiceIds.cancel,
        label: "Cancel",
        role: "cancel"
      }
    ]);
    expect(options.primaryChoiceId).toBe(
      projectSwitchChoiceIds.discardAndContinue
    );
    expect(options.cancelChoiceId).toBe(projectSwitchChoiceIds.cancel);
    expect(options.initialFocusChoiceId).toBe(projectSwitchChoiceIds.cancel);
    expect(choiceDialogDismissesOnBackdropClick(options)).toBe(false);
  });

  it("keeps destructive action before cancel through the ChoiceDialog ordering helper", () => {
    const options = buildProjectSwitchUnsavedChoiceDialogOptions(translateEn);

    for (const platform of ["windows", "linux", "macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).toEqual(["discardAndContinue", "cancel"]);
    }
  });
});

describe("confirmProjectSwitchWithUnsavedDocuments", () => {
  it("continues without showing a dialog when there are no unsaved documents", async () => {
    const choiceDialog = vi.fn();

    await expect(
      confirmProjectSwitchWithUnsavedDocuments({
        state: cleanState(),
        translate: translateEn,
        choiceDialog
      })
    ).resolves.toBe(true);

    expect(choiceDialog).not.toHaveBeenCalled();
  });

  it("shows the Pergamum choice dialog and continues when discard is chosen", async () => {
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: projectSwitchChoiceIds.discardAndContinue
    });

    await expect(
      confirmProjectSwitchWithUnsavedDocuments({
        state: dirtyState(),
        translate: translateJa,
        choiceDialog
      })
    ).resolves.toBe(true);

    expect(choiceDialog).toHaveBeenCalledWith(
      buildProjectSwitchUnsavedChoiceDialogOptions(translateJa)
    );
  });

  it("cancels when the cancel action is chosen", async () => {
    const state = dirtyState();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: projectSwitchChoiceIds.cancel
    });

    await expect(
      confirmProjectSwitchWithUnsavedDocuments({
        state,
        translate: translateEn,
        choiceDialog
      })
    ).resolves.toBe(false);

    expect(state).toEqual(dirtyState());
  });

  it("cancels when the dialog is dismissed", async () => {
    const choiceDialog = vi.fn().mockResolvedValue({ kind: "dismissed" });

    await expect(
      confirmProjectSwitchWithUnsavedDocuments({
        state: dirtyState(),
        translate: translateEn,
        choiceDialog
      })
    ).resolves.toBe(false);
  });

  it("wires Create, Open, and Recent Project through the shared async confirmation helper", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const helperIndex = source.indexOf(
      "async function confirmProjectSwitch(): Promise<boolean>"
    );
    const createIndex = source.indexOf("async function createProject");
    const openIndex = source.indexOf("async function openProject");
    const recentIndex = source.indexOf("async function openRecentProject(");
    const refsIndex = source.indexOf(
      "createProjectCommandRef.current = createProject;",
      recentIndex
    );

    expect(source).toContain("confirmProjectSwitchWithUnsavedDocuments({");
    expect(source).not.toContain("window.confirm");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(helperIndex);
    expect(openIndex).toBeGreaterThan(createIndex);
    expect(recentIndex).toBeGreaterThan(openIndex);
    expect(source.slice(createIndex, openIndex)).toContain(
      "if (!(await confirmProjectSwitch()))"
    );
    expect(source.slice(openIndex, recentIndex)).toContain(
      "if (!(await confirmProjectSwitch()))"
    );
    expect(source.slice(recentIndex, refsIndex)).toContain(
      "if (!(await confirmProjectSwitch()))"
    );
  });
});
