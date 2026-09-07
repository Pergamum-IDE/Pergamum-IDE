import { describe, expect, it, vi } from "vitest";
import type {
  ImageAttachmentPastePreparationFailure,
  ImageAttachmentPastePreparationResult,
  PendingImageAttachment
} from "../../src/renderer/clipboardImageAttachment";
import {
  runImageAttachmentPasteOrchestration,
  type ImageAttachmentPasteOrchestrationDeps,
  type ImageAttachmentPasteTarget
} from "../../src/renderer/imageAttachmentPasteOrchestration";
import { t, type Translate } from "../../src/shared/i18n";
import type { EffectiveImageAttachmentSettings } from "../../src/shared/settings";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
]);

const translate: Translate = (key, values) => t("ja", key, values);

function pending(
  overrides: Partial<PendingImageAttachment> = {}
): PendingImageAttachment {
  return {
    id: "pending-1",
    positionTrackingId: "pending-1",
    sourceDocumentId: "doc:A",
    sourceEditorId: "project:A",
    initialPosition: 3,
    bytes: PNG_BYTES,
    reportedMimeType: "image/png",
    detectedFormat: "png",
    originalFileName: "pasted.png",
    actualBytes: PNG_BYTES.byteLength,
    hadMultipleImages: false,
    ignoredAdditionalImageCount: 0,
    ...overrides
  };
}

function okResult(
  overrides: Partial<PendingImageAttachment> = {}
): Extract<ImageAttachmentPastePreparationResult, { readonly ok: true }> {
  return { ok: true, pending: pending(overrides) };
}

function sizeOverflowFailure(): ImageAttachmentPastePreparationFailure {
  return {
    ok: false,
    id: "pending-1",
    positionTrackingId: "pending-1",
    sourceDocumentId: "doc:A",
    sourceEditorId: "project:A",
    initialPosition: 3,
    reason: "sizeOverflow",
    reportedMimeType: "image/png",
    originalFileName: "huge.png",
    actualBytes: 134_217_729,
    hadMultipleImages: false,
    ignoredAdditionalImageCount: 0
  };
}

function settings(
  overrides: Partial<EffectiveImageAttachmentSettings> = {}
): EffectiveImageAttachmentSettings {
  return {
    saveDirectory: "assets/images",
    insertMarkdownLink: true,
    ...overrides
  };
}

function target(
  overrides: Partial<ImageAttachmentPasteTarget> = {}
): ImageAttachmentPasteTarget {
  return {
    documentId: "doc:A",
    markdownRelativePath: "novel/chapter01.md",
    documentName: "chapter01.md",
    isActive: true,
    position: 3,
    ...overrides
  };
}

function createDeps(
  overrides: Partial<ImageAttachmentPasteOrchestrationDeps> = {}
): ImageAttachmentPasteOrchestrationDeps {
  return {
    translate,
    getSettings: vi.fn(() => settings()),
    resolveTarget: vi.fn(() => ({ ok: true as const, target: target() })),
    clearPosition: vi.fn(),
    promptForSettings: vi.fn(async () => ({
      kind: "saved" as const,
      settings: settings()
    })),
    saveProjectSettingsFromPrompt: vi.fn(async () => "saved" as const),
    saveImageAttachment: vi.fn(async () => ({
      ok: true as const,
      relativePath: "assets/images/x.png",
      fileName: "x.png",
      format: "png" as const,
      byteLength: PNG_BYTES.byteLength
    })),
    insertMarkdownLink: vi.fn(() => true),
    showWarningDialog: vi.fn(async () => undefined),
    showSettingsSaveFailedDialog: vi.fn(async () => undefined),
    showSuccessToast: vi.fn(),
    showInfoToast: vi.fn(),
    logUnexpectedError: vi.fn(),
    ...overrides
  };
}

describe("image attachment paste orchestration (#407 B4)", () => {
  it("configured saveDirectory + insert on: saves, inserts a Markdown image link, clears marker, and shows success toast", async () => {
    const result = okResult();
    const deps = createDeps();

    await expect(
      runImageAttachmentPasteOrchestration(result, deps)
    ).resolves.toBe("linkInserted");

    expect(deps.saveImageAttachment).toHaveBeenCalledWith({
      saveDirectory: "assets/images",
      bytes: PNG_BYTES,
      reportedMimeType: "image/png"
    });
    expect(deps.insertMarkdownLink).toHaveBeenCalledWith({
      pending: result.pending,
      target: target(),
      markdownLink: "![](../assets/images/x.png)"
    });
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.clearPosition).toHaveBeenCalledWith(result);
    expect(deps.showSuccessToast).toHaveBeenCalledWith(
      "添付画像のリンクを挿入しました。"
    );
    expect(deps.showWarningDialog).not.toHaveBeenCalled();
  });

  it("configured saveDirectory + insert off: saves only, leaves Markdown unchanged, clears marker, and shows saved-path toast", async () => {
    const deps = createDeps({
      getSettings: vi.fn(() =>
        settings({
          insertMarkdownLink: false
        })
      )
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("savedOnly");

    expect(deps.saveImageAttachment).toHaveBeenCalledTimes(1);
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showSuccessToast).toHaveBeenCalledWith(
      "添付画像を保存しました: assets/images/x.png"
    );
  });

  it("save failure: shows warning dialog, does not edit Markdown, does not use Toast, and clears marker", async () => {
    const deps = createDeps({
      saveImageAttachment: vi.fn(async () => ({
        ok: false as const,
        reason: "permissionDenied" as const
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("saveFailed");

    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.showWarningDialog).toHaveBeenCalledWith(
      "permissionDenied",
      PNG_BYTES.byteLength
    );
    expect(deps.showSuccessToast).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
  });

  it("sizeOverflow preparation failure: warns, does not save or edit, and clears marker", async () => {
    const result = sizeOverflowFailure();
    const deps = createDeps();

    await expect(
      runImageAttachmentPasteOrchestration(result, deps)
    ).resolves.toBe("preparationFailed");

    expect(deps.showWarningDialog).toHaveBeenCalledWith(
      "sizeOverflow",
      134_217_729
    );
    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledWith(result);
  });

  it("saveDirectory unset + dialog cancel: changes no settings, saves nothing, edits nothing, notifies nothing, and clears marker", async () => {
    const deps = createDeps({
      getSettings: vi.fn(() => settings({ saveDirectory: "" })),
      promptForSettings: vi.fn(async () => ({ kind: "cancelled" as const }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("promptCancelled");

    expect(deps.promptForSettings).toHaveBeenCalledTimes(1);
    expect(deps.saveProjectSettingsFromPrompt).not.toHaveBeenCalled();
    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.showSuccessToast).not.toHaveBeenCalled();
    expect(deps.showInfoToast).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
  });

  it("saveDirectory unset + dialog save: saves Project override, revalidates target, then saves and inserts", async () => {
    const promptSettings = settings({
      saveDirectory: "attachments",
      insertMarkdownLink: true
    });
    const deps = createDeps({
      getSettings: vi.fn(() => settings({ saveDirectory: "" })),
      promptForSettings: vi.fn(async () => ({
        kind: "saved" as const,
        settings: promptSettings
      })),
      saveImageAttachment: vi.fn(async () => ({
        ok: true as const,
        relativePath: "attachments/x.png",
        fileName: "x.png",
        format: "png" as const,
        byteLength: PNG_BYTES.byteLength
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("linkInserted");

    expect(deps.saveProjectSettingsFromPrompt).toHaveBeenCalledWith(
      promptSettings,
      pending()
    );
    expect(deps.resolveTarget).toHaveBeenCalledTimes(3);
    expect(deps.saveImageAttachment).toHaveBeenCalledWith({
      saveDirectory: "attachments",
      bytes: PNG_BYTES,
      reportedMimeType: "image/png"
    });
    expect(deps.insertMarkdownLink).toHaveBeenCalledWith(
      expect.objectContaining({ markdownLink: "![](../attachments/x.png)" })
    );
  });

  it("settings saved but target invalid: keeps settings, saves no image, edits no Markdown, clears marker, and shows the specified notification", async () => {
    const deps = createDeps({
      getSettings: vi.fn(() => settings({ saveDirectory: "" })),
      resolveTarget: vi
        .fn()
        .mockReturnValueOnce({ ok: true as const, target: target() })
        .mockReturnValueOnce({
          ok: false as const,
          reason: "positionDeleted" as const
        }),
      promptForSettings: vi.fn(async () => ({
        kind: "saved" as const,
        settings: settings({ saveDirectory: "attachments" })
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("targetInvalidAfterSettingsSaved");

    expect(deps.saveProjectSettingsFromPrompt).toHaveBeenCalledTimes(1);
    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "添付画像の設定は保存しましたが、貼り付け先の文書が変更されたため画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("prompt save skipped by App context validation: saves no image and uses the generic target-changed notification", async () => {
    const deps = createDeps({
      getSettings: vi.fn(() => settings({ saveDirectory: "" })),
      saveProjectSettingsFromPrompt: vi.fn(async () => "targetStale" as const)
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("targetInvalidBeforeSave");

    expect(deps.saveProjectSettingsFromPrompt).toHaveBeenCalledTimes(1);
    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "貼り付け先の文書が変更されたため画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("prompt save failed: shows warning dialog, does not save image, does not edit Markdown, and clears marker", async () => {
    const promptSettings = settings({
      saveDirectory: "attachments",
      insertMarkdownLink: true
    });
    const deps = createDeps({
      getSettings: vi.fn(() => settings({ saveDirectory: "" })),
      promptForSettings: vi.fn(async () => ({
        kind: "saved" as const,
        settings: promptSettings
      })),
      saveProjectSettingsFromPrompt: vi.fn(async () => "settingsSaveFailed" as const)
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("settingsSaveFailed");

    expect(deps.saveProjectSettingsFromPrompt).toHaveBeenCalledTimes(1);
    expect(deps.showSettingsSaveFailedDialog).toHaveBeenCalledTimes(1);
    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).not.toHaveBeenCalled();
    expect(deps.showWarningDialog).not.toHaveBeenCalled();
  });

  it("inactive document insertion: inserts into the source document, leaves the active document to App, and names the target in the success Toast", async () => {
    const inactiveTarget = target({ isActive: false });
    const deps = createDeps({
      resolveTarget: vi.fn(() => ({
        ok: true as const,
        target: inactiveTarget
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("linkInserted");

    expect(deps.insertMarkdownLink).toHaveBeenCalledWith({
      pending: pending(),
      target: inactiveTarget,
      markdownLink: "![](../assets/images/x.png)"
    });
    expect(deps.showSuccessToast).toHaveBeenCalledWith(
      "「chapter01.md」に添付画像のリンクを挿入しました。"
    );
  });

  it("marker deleted before save: saves no image, edits no Markdown, clears marker, and reports dedicated position deleted notification", async () => {
    const deps = createDeps({
      resolveTarget: vi.fn(() => ({
        ok: false as const,
        reason: "positionDeleted" as const
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("targetInvalidBeforeSave");

    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "貼り付け位置が削除されたため、画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("target document unavailable before save: saves no image, edits no Markdown, clears marker, and reports generic target change notification", async () => {
    const deps = createDeps({
      resolveTarget: vi.fn(() => ({
        ok: false as const,
        reason: "targetDocumentUnavailable" as const
      }))
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("targetInvalidBeforeSave");

    expect(deps.saveImageAttachment).not.toHaveBeenCalled();
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "貼り付け先の文書が変更されたため画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("target invalid after image saved: keeps saved file, does not insert link, clears marker, and shows position-deleted info toast", async () => {
    const deps = createDeps({
      resolveTarget: vi
        .fn()
        .mockReturnValueOnce({ ok: true as const, target: target() })
        .mockReturnValueOnce({
          ok: false as const,
          reason: "positionDeleted" as const
        })
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("targetInvalidAfterSave");

    expect(deps.saveImageAttachment).toHaveBeenCalledTimes(1);
    expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "貼り付け位置が削除されたため、画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("insertMarkdownLink returns false: saves image, clears marker, and notifies target change via info toast", async () => {
    const deps = createDeps({
      insertMarkdownLink: vi.fn(() => false)
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("insertFailed");

    expect(deps.saveImageAttachment).toHaveBeenCalledTimes(1);
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showInfoToast).toHaveBeenCalledWith(
      "貼り付け先の文書が変更されたため画像の添付を中止しました。もう一度貼り付けてください。"
    );
  });

  it("unexpected error in orchestration: logs unexpected error, clears marker, shows ioError warning dialog, and resolves safely", async () => {
    const failure = new Error("disk exploded");
    const deps = createDeps({
      saveImageAttachment: vi.fn(async () => {
        throw failure;
      })
    });

    await expect(
      runImageAttachmentPasteOrchestration(okResult(), deps)
    ).resolves.toBe("unexpectedError");

    expect(deps.logUnexpectedError).toHaveBeenCalledWith(failure);
    expect(deps.clearPosition).toHaveBeenCalledTimes(1);
    expect(deps.showWarningDialog).toHaveBeenCalledWith(
      "ioError",
      PNG_BYTES.byteLength
    );
  });

  it.each([
    ["unsupportedFormat", "unsupportedFormat"],
    ["mimeMagicMismatch", "mimeMagicMismatch"],
    ["ioError", "ioError"]
  ] as const)(
    "preparation failure variant (%s): shows warning dialog, does not save image, and clears marker",
    async (reason, expectedDialogReason) => {
      const result: ImageAttachmentPastePreparationResult = {
        ok: false,
        id: "pending-err",
        positionTrackingId: "pending-err",
        sourceDocumentId: "doc:A",
        sourceEditorId: "project:A",
        initialPosition: 3,
        reason,
        reportedMimeType: "image/png",
        actualBytes: 123,
        hadMultipleImages: false,
        ignoredAdditionalImageCount: 0
      };
      const deps = createDeps();

      await expect(
        runImageAttachmentPasteOrchestration(result, deps)
      ).resolves.toBe("preparationFailed");

      expect(deps.showWarningDialog).toHaveBeenCalledWith(
        expectedDialogReason,
        123
      );
      expect(deps.saveImageAttachment).not.toHaveBeenCalled();
      expect(deps.insertMarkdownLink).not.toHaveBeenCalled();
      expect(deps.clearPosition).toHaveBeenCalledWith(result);
    }
  );

  it("multiple images: appends the multiple-image message to the same success Toast", async () => {
    const deps = createDeps();

    await expect(
      runImageAttachmentPasteOrchestration(
        okResult({
          hadMultipleImages: true,
          ignoredAdditionalImageCount: 2
        }),
        deps
      )
    ).resolves.toBe("linkInserted");

    expect(deps.showSuccessToast).toHaveBeenCalledTimes(1);
    expect(deps.showSuccessToast).toHaveBeenCalledWith(
      "添付画像のリンクを挿入しました。\n複数の画像が含まれていたため、先頭の1枚だけを添付しました。"
    );
  });
});
