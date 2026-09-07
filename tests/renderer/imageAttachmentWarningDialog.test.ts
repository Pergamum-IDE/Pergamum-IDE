import { describe, expect, it } from "vitest";
import { t, type Language } from "../../src/shared/i18n";
import type { SaveImageAttachmentFailureReason } from "../../src/shared/api";
import {
  buildImageAttachmentWarningDialogOptions,
  buildImageAttachmentSettingsSaveFailedWarningDialogOptions
} from "../../src/renderer/dialog/imageAttachmentWarningDialog";

describe("buildImageAttachmentWarningDialogOptions (#407 B2)", () => {
  const translateJa = (key: any) => t("ja", key);
  const translateEn = (key: any) => t("en", key);

  const allReasons: SaveImageAttachmentFailureReason[] = [
    "protectedLocation",
    "projectNotOpen",
    "sizeOverflow",
    "diskFull",
    "permissionDenied",
    "ioError",
    "invalidPath",
    "containmentFailure",
    "saveDirectoryNotDirectory",
    "unsupportedFormat",
    "mimeMagicMismatch",
    "collisionExhausted",
    "writeFailure"
  ];

  it("builds a modal alert with warning icon, confirmOnly structure, and dismissOnBackdropClick false", () => {
    for (const reason of allReasons) {
      const options = buildImageAttachmentWarningDialogOptions(reason, translateJa);
      expect(options.title).toBe(translateJa("dialog.imageAttachment.failed.title"));
      expect(options.icon).toEqual({
        kind: "warning",
        tooltip: translateJa("dialog.icon.warning")
      });
      expect(options.confirmLabel).toBe(translateJa("common.ok"));
      expect(options.cancelLabel).toBeNull();
      expect(options.dismissOnBackdropClick).toBe(false);
      expect(options.clipboardText).toBeNull();
      expect(options.message.kind).toBe("plainText");
    }
  });

  it("produces exact PO required message for protectedLocation in Japanese", () => {
    const options = buildImageAttachmentWarningDialogOptions("protectedLocation", translateJa);
    expect(options.message).toEqual({
      kind: "plainText",
      text: "Pergamumの内部管理用フォルダには画像を保存できません。\n別の保存先を指定してください。"
    });
  });

  it("produces appropriate message for protectedLocation in English", () => {
    const options = buildImageAttachmentWarningDialogOptions("protectedLocation", translateEn);
    expect(options.message).toEqual({
      kind: "plainText",
      text: "Cannot save images into Pergamum's internal management folder.\nPlease specify a different save location."
    });
  });

  it("formats sizeOverflow with actualBytes when provided and positive", () => {
    const bytes25MiB = 25 * 1024 * 1024;
    const optionsJa = buildImageAttachmentWarningDialogOptions("sizeOverflow", translateJa, bytes25MiB);
    expect(optionsJa.message).toEqual({
      kind: "plainText",
      text: "画像サイズが上限（128 MiB）を超えています。 (25 MiB)"
    });

    const optionsEn = buildImageAttachmentWarningDialogOptions("sizeOverflow", translateEn, bytes25MiB);
    expect(optionsEn.message).toEqual({
      kind: "plainText",
      text: "The image size exceeds the maximum limit (128 MiB). (25 MiB)"
    });
  });

  it("formats sizeOverflow without actualBytes when omitted or non-positive", () => {
    const optionsWithoutBytes = buildImageAttachmentWarningDialogOptions("sizeOverflow", translateJa);
    expect(optionsWithoutBytes.message).toEqual({
      kind: "plainText",
      text: "画像サイズが上限（128 MiB）を超えています。"
    });
  });

  it("covers all 13 failure reasons without throwing missing translation errors", () => {
    for (const lang of ["ja", "en"] as Language[]) {
      const translate = (k: any) => t(lang, k);
      for (const reason of allReasons) {
        const options = buildImageAttachmentWarningDialogOptions(reason, translate);
        expect(options.message.kind).toBe("plainText");
        if (options.message.kind === "plainText") {
          expect(typeof options.message.text).toBe("string");
          expect(options.message.text.length).toBeGreaterThan(0);
          // Ensure translation didn't fall back to missing key format
          expect(options.message.text).not.toContain("dialog.imageAttachment.failed.");
        }
      }
    }
  });
});

describe("buildImageAttachmentSettingsSaveFailedWarningDialogOptions (#407 B4 remediation)", () => {
  const translateJa = (key: any) => t("ja", key);
  const translateEn = (key: any) => t("en", key);

  it("builds a modal alert with warning icon, confirmOnly structure, and dismissOnBackdropClick false", () => {
    const options = buildImageAttachmentSettingsSaveFailedWarningDialogOptions(translateJa);
    expect(options.title).toBe(translateJa("dialog.imageAttachment.settingsSaveFailed.title"));
    expect(options.icon).toEqual({
      kind: "warning",
      tooltip: translateJa("dialog.icon.warning")
    });
    expect(options.confirmLabel).toBe(translateJa("common.ok"));
    expect(options.cancelLabel).toBeNull();
    expect(options.dismissOnBackdropClick).toBe(false);
    expect(options.clipboardText).toBeNull();
    expect(options.message).toEqual({
      kind: "plainText",
      text: translateJa("dialog.imageAttachment.settingsSaveFailed.message")
    });
  });

  it("produces exact PO required messages in Japanese and English", () => {
    const optionsJa = buildImageAttachmentSettingsSaveFailedWarningDialogOptions(translateJa);
    expect(optionsJa.title).toBe("設定の保存に失敗しました");
    expect(optionsJa.message).toEqual({
      kind: "plainText",
      text: "添付画像の設定を保存できませんでした。保存先を確認して、もう一度貼り付けてください。"
    });

    const optionsEn = buildImageAttachmentSettingsSaveFailedWarningDialogOptions(translateEn);
    expect(optionsEn.title).toBe("Failed to Save Settings");
    expect(optionsEn.message).toEqual({
      kind: "plainText",
      text: "Could not save image attachment settings. Please check the save destination and paste again."
    });
  });
});
