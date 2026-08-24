import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildReadOnlyProjectOpenChoiceDialogOptions,
  confirmReadOnlyProjectOpenIfNeeded,
  readOnlyProjectOpenChoiceIds
} from "../../src/renderer/readOnlyProjectOpenConfirmation";
import {
  choiceDialogDismissesOnBackdropClick,
  resolveChoiceDialogActionOrder
} from "../../src/renderer/dialog/appDialogTypes";
import type {
  PendingReadOnlyProjectOpen,
  PergamumProject
} from "../../src/shared/api";
import { t, type Translate } from "../../src/shared/i18n";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

describe("buildReadOnlyProjectOpenChoiceDialogOptions", () => {
  it("uses localized read-only project open plain text", () => {
    const jaOptions = buildReadOnlyProjectOpenChoiceDialogOptions(translateJa);
    const enOptions = buildReadOnlyProjectOpenChoiceDialogOptions(translateEn);

    expect(jaOptions).toMatchObject({
      title: "読み取り専用で開きますか？",
      message: {
        kind: "plainText",
        text:
          "このプロジェクトは既に別のPergamumで開かれています。\n\n" +
          "読み取り専用で開くことができます。\n" +
          "編集や通常保存はできませんが、内容を確認したり、別ファイルとして保存したりできます。\n\n" +
          "プロジェクトを開きますか？"
      }
    });
    expect(enOptions).toMatchObject({
      title: "Open in read-only mode?",
      message: {
        kind: "plainText",
        text:
          "This project is already open in another Pergamum instance.\n\n" +
          "You can open it in read-only mode.\n" +
          "Editing and normal Save are unavailable, but you can view the contents or save a copy with Save As.\n\n" +
          "Do you want to open the project?"
      }
    });
  });

  it("uses concrete open and cancel labels without generic confirmation labels", () => {
    const jaOptions = buildReadOnlyProjectOpenChoiceDialogOptions(translateJa);
    const enOptions = buildReadOnlyProjectOpenChoiceDialogOptions(translateEn);

    expect(jaOptions.choices.map((choice) => choice.label)).toEqual([
      "開く",
      "キャンセル"
    ]);
    expect(enOptions.choices.map((choice) => choice.label)).toEqual([
      "Open",
      "Cancel"
    ]);
    expect(jaOptions.choices.map((choice) => choice.label)).not.toContain("OK");
    expect(jaOptions.choices.map((choice) => choice.label)).not.toContain(
      "はい"
    );
    expect(jaOptions.choices.map((choice) => choice.label)).not.toContain(
      "いいえ"
    );
    expect(enOptions.choices.map((choice) => choice.label)).not.toContain("OK");
    expect(enOptions.choices.map((choice) => choice.label)).not.toContain(
      "Yes"
    );
    expect(enOptions.choices.map((choice) => choice.label)).not.toContain("No");
  });

  it("marks open as primary and cancel as cancel with safe initial focus", () => {
    const options = buildReadOnlyProjectOpenChoiceDialogOptions(translateEn);

    expect(options.choices).toEqual([
      {
        id: readOnlyProjectOpenChoiceIds.open,
        label: "Open",
        role: "primary"
      },
      {
        id: readOnlyProjectOpenChoiceIds.cancel,
        label: "Cancel",
        role: "cancel"
      }
    ]);
    expect(options.primaryChoiceId).toBe(readOnlyProjectOpenChoiceIds.open);
    expect(options.cancelChoiceId).toBe(readOnlyProjectOpenChoiceIds.cancel);
    expect(options.initialFocusChoiceId).toBe(
      readOnlyProjectOpenChoiceIds.cancel
    );
    expect(choiceDialogDismissesOnBackdropClick(options)).toBe(false);
  });

  it("keeps open before cancel through the ChoiceDialog ordering helper", () => {
    const options = buildReadOnlyProjectOpenChoiceDialogOptions(translateEn);

    for (const platform of ["windows", "linux", "macos", "other"] as const) {
      expect(
        resolveChoiceDialogActionOrder(options, platform).map(
          (choice) => choice.id
        )
      ).toEqual(["open", "cancel"]);
    }
  });
});

describe("confirmReadOnlyProjectOpenIfNeeded", () => {
  it("returns a readWrite project without showing a dialog", async () => {
    const project = createProject({ accessMode: { kind: "readWrite" } });
    const choiceDialog = vi.fn();
    const confirmReadOnlyProjectOpen = vi.fn();
    const cancelReadOnlyProjectOpen = vi.fn();

    await expect(
      confirmReadOnlyProjectOpenIfNeeded({
        result: project,
        translate: translateEn,
        choiceDialog,
        confirmReadOnlyProjectOpen,
        cancelReadOnlyProjectOpen
      })
    ).resolves.toBe(project);

    expect(choiceDialog).not.toHaveBeenCalled();
    expect(confirmReadOnlyProjectOpen).not.toHaveBeenCalled();
    expect(cancelReadOnlyProjectOpen).not.toHaveBeenCalled();
  });

  it("shows the Pergamum choice dialog and confirms when open is chosen", async () => {
    const pending = createPendingReadOnlyProjectOpen();
    const confirmedProject = pending.project;
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: readOnlyProjectOpenChoiceIds.open
    });
    const confirmReadOnlyProjectOpen = vi
      .fn()
      .mockResolvedValue(confirmedProject);
    const cancelReadOnlyProjectOpen = vi.fn();

    await expect(
      confirmReadOnlyProjectOpenIfNeeded({
        result: pending,
        translate: translateJa,
        choiceDialog,
        confirmReadOnlyProjectOpen,
        cancelReadOnlyProjectOpen
      })
    ).resolves.toBe(confirmedProject);

    expect(choiceDialog).toHaveBeenCalledWith(
      buildReadOnlyProjectOpenChoiceDialogOptions(translateJa)
    );
    expect(confirmReadOnlyProjectOpen).toHaveBeenCalledWith(pending.token);
    expect(cancelReadOnlyProjectOpen).not.toHaveBeenCalled();
  });

  it("cancels the pending open when cancel is chosen", async () => {
    const pending = createPendingReadOnlyProjectOpen();
    const choiceDialog = vi.fn().mockResolvedValue({
      kind: "chosen",
      id: readOnlyProjectOpenChoiceIds.cancel
    });
    const confirmReadOnlyProjectOpen = vi.fn();
    const cancelReadOnlyProjectOpen = vi.fn().mockResolvedValue(undefined);

    await expect(
      confirmReadOnlyProjectOpenIfNeeded({
        result: pending,
        translate: translateEn,
        choiceDialog,
        confirmReadOnlyProjectOpen,
        cancelReadOnlyProjectOpen
      })
    ).resolves.toBeNull();

    expect(confirmReadOnlyProjectOpen).not.toHaveBeenCalled();
    expect(cancelReadOnlyProjectOpen).toHaveBeenCalledWith(pending.token);
  });

  it("cancels the pending open when the dialog is dismissed", async () => {
    const pending = createPendingReadOnlyProjectOpen();
    const choiceDialog = vi.fn().mockResolvedValue({ kind: "dismissed" });
    const confirmReadOnlyProjectOpen = vi.fn();
    const cancelReadOnlyProjectOpen = vi.fn().mockResolvedValue(undefined);

    await expect(
      confirmReadOnlyProjectOpenIfNeeded({
        result: pending,
        translate: translateEn,
        choiceDialog,
        confirmReadOnlyProjectOpen,
        cancelReadOnlyProjectOpen
      })
    ).resolves.toBeNull();

    expect(confirmReadOnlyProjectOpen).not.toHaveBeenCalled();
    expect(cancelReadOnlyProjectOpen).toHaveBeenCalledWith(pending.token);
  });

  it("wires Create, Open, and Recent Project through the read-only confirmation helper", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const helperIndex = source.indexOf(
      "async function resolveProjectOpenResult"
    );
    const createIndex = source.indexOf("async function createProject");
    const openIndex = source.indexOf("async function openProject");
    const recentIndex = source.indexOf("async function openRecentProject(");

    expect(source).toContain("confirmReadOnlyProjectOpenIfNeeded({");
    expect(source).toContain(
      "window.pergamum.projects.confirmReadOnlyProjectOpen"
    );
    expect(source).toContain(
      "window.pergamum.projects.cancelReadOnlyProjectOpen"
    );
    expect(source).not.toContain("window.confirm");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(helperIndex);
    expect(openIndex).toBeGreaterThan(createIndex);
    expect(recentIndex).toBeGreaterThan(openIndex);
    expect(source.slice(createIndex, openIndex)).toContain(
      "resolveProjectOpenResult("
    );
    expect(source.slice(openIndex, recentIndex)).toContain(
      "resolveProjectOpenResult("
    );
    expect(source.slice(recentIndex)).toContain("resolveProjectOpenResult(");
  });
});

function createProject(
  overrides: Partial<PergamumProject> = {}
): PergamumProject {
  return {
    rootPath: "C:\\Novel",
    activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
    accessMode: {
      kind: "readOnly",
      reason: "writeLockUnavailable"
    },
    name: "Novel",
    config: null,
    documents: [],
    ...overrides
  };
}

function createPendingReadOnlyProjectOpen(): PendingReadOnlyProjectOpen {
  return {
    kind: "pendingReadOnlyProjectOpen",
    token: "pending-read-only-project-open:test",
    project: createProject()
  };
}
