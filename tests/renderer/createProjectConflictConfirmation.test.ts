import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildCreateProjectConflictChoiceDialogOptions,
  confirmCreateProjectConflictIfNeeded,
  createProjectConflictChoiceIds
} from "../../src/renderer/createProjectConflictConfirmation";
import {
  choiceDialogDismissesOnBackdropClick,
  resolveChoiceDialogActionOrder
} from "../../src/renderer/dialog/appDialogTypes";
import { handleChoiceDialogKeyDown } from "../../src/renderer/dialog/choiceDialogHandlers";
import type {
  PendingCreateProjectInExistingRoot,
  PergamumProject
} from "../../src/shared/api";
import { t, type Translate } from "../../src/shared/i18n";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

describe("buildCreateProjectConflictChoiceDialogOptions", () => {
  it("uses localized AppDialog copy for ja and en", () => {
    const jaOptions = buildCreateProjectConflictChoiceDialogOptions(translateJa);
    const enOptions = buildCreateProjectConflictChoiceDialogOptions(translateEn);

    expect(jaOptions).toMatchObject({
      title: "既存のPergamum情報を上書きしますか？",
      message: {
        kind: "plainText",
        text:
          "このフォルダには、既にPergamumのプロジェクト設定または復旧領域があります。\n\n" +
          "新しいプロジェクトを作成すると、既存の設定や復旧情報が上書きされる可能性があります。\n" +
          "文書ファイル自体は削除されません。"
      }
    });
    expect(enOptions).toMatchObject({
      title: "Overwrite existing Pergamum data?",
      message: {
        kind: "plainText",
        text:
          "This folder already contains Pergamum project settings or recovery-related data.\n\n" +
          "Creating a new project here may overwrite existing settings or recovery information.\n" +
          "Your document files will not be deleted."
      }
    });
  });

  it("marks overwrite as destructive and cancel as the safe initial action", () => {
    const options = buildCreateProjectConflictChoiceDialogOptions(translateEn);

    expect(options.icon).toEqual({
      kind: "warning",
      tooltip: "Warning"
    });
    expect(options.choices).toEqual([
      {
        id: createProjectConflictChoiceIds.overwriteAndCreate,
        label: "Overwrite and create",
        role: "destructive",
        icon: { kind: "alertTriangle" }
      },
      {
        id: createProjectConflictChoiceIds.cancel,
        label: "Cancel",
        role: "cancel"
      }
    ]);
    expect(options.primaryChoiceId).toBe(
      createProjectConflictChoiceIds.overwriteAndCreate
    );
    expect(options.cancelChoiceId).toBe(createProjectConflictChoiceIds.cancel);
    expect(options.initialFocusChoiceId).toBe(
      createProjectConflictChoiceIds.cancel
    );
    expect(choiceDialogDismissesOnBackdropClick(options)).toBe(false);
  });

  it("keeps overwrite before cancel through the ChoiceDialog ordering helper", () => {
    const options = buildCreateProjectConflictChoiceDialogOptions(translateEn);

    for (const platform of ["windows", "linux", "macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).toEqual(["overwriteAndCreate", "cancel"]);
    }
  });

  it("does not map Enter to the overwrite action, while Esc dismisses", () => {
    const onResult = vi.fn();

    expect(handleChoiceDialogKeyDown({ key: "Enter" }, onResult)).toBe(false);
    expect(onResult).not.toHaveBeenCalled();

    expect(handleChoiceDialogKeyDown({ key: "Escape" }, onResult)).toBe(true);
    expect(onResult).toHaveBeenCalledWith({ kind: "dismissed" });
  });
});

describe("confirmCreateProjectConflictIfNeeded", () => {
  it("returns a normal project without showing a dialog", async () => {
    const project = createProject();
    const choiceDialog = vi.fn();
    const confirmCreateProjectInExistingRoot = vi.fn();
    const cancelCreateProjectInExistingRoot = vi.fn();

    await expect(
      confirmCreateProjectConflictIfNeeded({
        result: project,
        translate: translateEn,
        choiceDialog,
        confirmCreateProjectInExistingRoot,
        cancelCreateProjectInExistingRoot
      })
    ).resolves.toBe(project);

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(confirmCreateProjectInExistingRoot).not.toHaveBeenCalled();
    expect(cancelCreateProjectInExistingRoot).not.toHaveBeenCalled();
  });

  it("shows the Pergamum choice dialog and confirms when overwrite is chosen", async () => {
    const pending = createPendingCreateProjectInExistingRoot();
    const confirmedProject = createProject();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: createProjectConflictChoiceIds.overwriteAndCreate
    });
    const confirmCreateProjectInExistingRoot = vi
      .fn()
      .mockResolvedValue(confirmedProject);
    const cancelCreateProjectInExistingRoot = vi.fn();

    await expect(
      confirmCreateProjectConflictIfNeeded({
        result: pending,
        translate: translateJa,
        choiceDialog,
        confirmCreateProjectInExistingRoot,
        cancelCreateProjectInExistingRoot
      })
    ).resolves.toBe(confirmedProject);

    expect(choiceDialog).toHaveBeenCalledWith(
      buildCreateProjectConflictChoiceDialogOptions(translateJa)
    );
    expect(confirmCreateProjectInExistingRoot).toHaveBeenCalledWith(
      pending.token
    );
    expect(cancelCreateProjectInExistingRoot).not.toHaveBeenCalled();
  });

  it("cancels the pending create when cancel is chosen", async () => {
    const pending = createPendingCreateProjectInExistingRoot();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: createProjectConflictChoiceIds.cancel
    });
    const confirmCreateProjectInExistingRoot = vi.fn();
    const cancelCreateProjectInExistingRoot = vi.fn().mockResolvedValue(undefined);

    await expect(
      confirmCreateProjectConflictIfNeeded({
        result: pending,
        translate: translateEn,
        choiceDialog,
        confirmCreateProjectInExistingRoot,
        cancelCreateProjectInExistingRoot
      })
    ).resolves.toBeNull();

    expect(confirmCreateProjectInExistingRoot).not.toHaveBeenCalled();
    expect(cancelCreateProjectInExistingRoot).toHaveBeenCalledWith(
      pending.token
    );
  });

  it("cancels the pending create when Esc dismisses the dialog", async () => {
    const pending = createPendingCreateProjectInExistingRoot();
    const choiceDialog = vi.fn().mockResolvedValue({ kind: "dismissed" });
    const confirmCreateProjectInExistingRoot = vi.fn();
    const cancelCreateProjectInExistingRoot = vi.fn().mockResolvedValue(undefined);

    await expect(
      confirmCreateProjectConflictIfNeeded({
        result: pending,
        translate: translateEn,
        choiceDialog,
        confirmCreateProjectInExistingRoot,
        cancelCreateProjectInExistingRoot
      })
    ).resolves.toBeNull();

    expect(confirmCreateProjectInExistingRoot).not.toHaveBeenCalled();
    expect(cancelCreateProjectInExistingRoot).toHaveBeenCalledWith(
      pending.token
    );
  });

  it("wires ProjectOpenResult through the create-conflict helper before read-only confirmation", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const helperIndex = source.indexOf(
      "async function resolveProjectOpenResult"
    );
    const conflictIndex = source.indexOf(
      "confirmCreateProjectConflictIfNeeded({",
      helperIndex
    );
    const readOnlyIndex = source.indexOf(
      "confirmReadOnlyProjectOpenIfNeeded({",
      helperIndex
    );

    expect(source).toContain("window.pergamum.projects.createProject()");
    expect(source).toContain(
      "window.pergamum.projects.confirmCreateProjectInExistingRoot"
    );
    expect(source).toContain(
      "window.pergamum.projects.cancelCreateProjectInExistingRoot"
    );
    expect(source).not.toContain("window.confirm");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(conflictIndex).toBeGreaterThan(helperIndex);
    expect(readOnlyIndex).toBeGreaterThan(conflictIndex);
  });
});

function createProject(
  overrides: Partial<PergamumProject> = {}
): PergamumProject {
  return {
    rootPath: "C:\\Novel",
    activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
    accessMode: { kind: "readWrite" },
    name: "Novel",
    config: null,
    documents: [],
    ...overrides
  };
}

function createPendingCreateProjectInExistingRoot(): PendingCreateProjectInExistingRoot {
  return {
    kind: "pendingCreateProjectInExistingRoot",
    token: "pending-create-project-in-existing-root:test"
  };
}
