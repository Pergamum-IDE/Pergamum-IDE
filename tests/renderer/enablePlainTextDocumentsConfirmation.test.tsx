// @vitest-environment happy-dom
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPanelView } from "../../src/renderer/SettingsPanel";
import { t, type Language } from "../../src/shared/i18n";
import {
  createDefaultApplicationSettings,
  resolveEffectiveSettings,
  type ApplicationSettings,
  type SaveApplicationSettingsRequest
} from "../../src/shared/settings";
import type { AppConfirmDialogOptions, AppConfirmDialogResult } from "../../src/renderer/dialog/appDialogTypes";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

function translate(
  key: string,
  values?: Parameters<typeof t>[2]
): string {
  return t("ja", key as Parameters<typeof t>[1], values);
}

function renderSettingsPanel(
  settings: ApplicationSettings,
  onChangeSettings: (s: SaveApplicationSettingsRequest) => void,
  confirmDialog?: (opts: AppConfirmDialogOptions) => Promise<AppConfirmDialogResult>
): void {
  act(() => {
    root!.render(
      <SettingsPanelView
        settings={settings}
        isLoading={false}
        error={null}
        translate={translate}
        displayLanguage="ja"
        selectedCategoryId="textFiles"
        onSelectCategory={() => {}}
        searchQuery=""
        onSearchQueryChange={() => {}}
        onChangeSettings={onChangeSettings}
        confirmDialog={confirmDialog}
      />
    );
  });
}

function getPlainTextSwitch(): HTMLInputElement {
  const checkbox = container!.querySelector<HTMLInputElement>(
    '#settingLabel-textFiles\\.enablePlainTextDocuments + div input[type="checkbox"]'
  );
  if (!checkbox) {
    throw new Error("Plain text documents switch not found");
  }
  return checkbox;
}

function getEncodingSelect(): HTMLSelectElement {
  const select = container!.querySelector<HTMLSelectElement>(
    '#settingLabel-textFiles\\.encoding + div select'
  );
  if (!select) {
    throw new Error("Text file encoding select not found");
  }
  return select;
}

function getLineEndingSelect(): HTMLSelectElement {
  const select = container!.querySelector<HTMLSelectElement>(
    '#settingLabel-textFiles\\.lineEnding + div select'
  );
  if (!select) {
    throw new Error("Text file line ending select not found");
  }
  return select;
}

describe("textFiles.enablePlainTextDocuments Confirmation Dialog (#501 Slice 2/5)", () => {
  it("defaults to false in effective settings", () => {
    const defaultSettings = createDefaultApplicationSettings();
    const effective = resolveEffectiveSettings(defaultSettings, null);

    expect(effective.textFiles.enablePlainTextDocuments).toBe(false);
  });

  it("shows confirmation dialog when enabling from false to true, and persists on confirm", async () => {
    const settings = createDefaultApplicationSettings();
    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn(
      (_opts: AppConfirmDialogOptions): Promise<AppConfirmDialogResult> =>
        Promise.resolve("confirm")
    );

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const switchEl = getPlainTextSwitch();
    expect(switchEl.checked).toBe(false);

    await act(async () => {
      switchEl.click();
    });

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const dialogOpts = confirmDialog.mock.calls[0][0];

    expect(dialogOpts.title).toBe("平文テキストファイル（.txt）のサポートを有効にしますか？");
    expect(dialogOpts.confirmLabel).toBe("有効にする");
    expect(dialogOpts.cancelLabel).toBe("キャンセル");
    expect(dialogOpts.message.kind).toBe("plainText");

    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    const savedRequest = onChangeSettings.mock.calls[0][0] as SaveApplicationSettingsRequest;
    expect(savedRequest.textFiles.enablePlainTextDocuments).toBe(true);
  });

  it("shows confirmation dialog when enabling from false to true, and cancels without persisting if user cancels", async () => {
    const settings = createDefaultApplicationSettings();
    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn(
      (_opts: AppConfirmDialogOptions): Promise<AppConfirmDialogResult> =>
        Promise.resolve("cancel")
    );

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const switchEl = getPlainTextSwitch();

    await act(async () => {
      switchEl.click();
    });

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(onChangeSettings).not.toHaveBeenCalled();
  });

  it("does not show confirmation dialog when disabling from true to false, and persists false directly", async () => {
    const settings = createDefaultApplicationSettings();
    settings.textFiles.enablePlainTextDocuments = true;

    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn();

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const switchEl = getPlainTextSwitch();
    expect(switchEl.checked).toBe(true);

    await act(async () => {
      switchEl.click();
    });

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    const savedRequest = onChangeSettings.mock.calls[0][0] as SaveApplicationSettingsRequest;
    expect(savedRequest.textFiles.enablePlainTextDocuments).toBe(false);
  });
});

describe("textFiles.encoding Confirmation Dialog (#501 Slice 5)", () => {
  it("shows confirmation dialog when changing encoding to non-UTF-8, and persists on confirm", async () => {
    const settings = createDefaultApplicationSettings();
    settings.textFiles.enablePlainTextDocuments = true;
    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn(
      (_opts: AppConfirmDialogOptions): Promise<AppConfirmDialogResult> =>
        Promise.resolve("confirm")
    );

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const selectEl = getEncodingSelect();
    expect(selectEl.value).toBe("utf8");

    await act(async () => {
      selectEl.value = "shiftJis";
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const dialogOpts = confirmDialog.mock.calls[0][0];

    expect(dialogOpts.title).toBe("文字エンコーディングを変更しますか？");
    expect(dialogOpts.confirmLabel).toBe("変更する");
    expect(dialogOpts.cancelLabel).toBe("キャンセル");
    if (dialogOpts.message.kind !== "plainText") {
      throw new Error("Expected plainText dialog message");
    }
    expect(dialogOpts.message.text).toBe(
      "文字エンコーディングを Shift_JIS（CP932） に変更しようとしています。\n\nこの設定は、平文テキストファイル（.txt）の読み書きに影響します。\n意味を理解しないまま変更すると、文字化けや保存時の意図しない文字変換が発生する可能性があります。\n\nこの意味を理解した上で設定を変更しますか？"
    );

    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    const savedRequest = onChangeSettings.mock.calls[0][0] as SaveApplicationSettingsRequest;
    expect(savedRequest.textFiles.encoding).toBe("shiftJis");
  });

  it("cancels without persisting if user cancels non-UTF-8 encoding change", async () => {
    const settings = createDefaultApplicationSettings();
    settings.textFiles.enablePlainTextDocuments = true;
    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn(
      (_opts: AppConfirmDialogOptions): Promise<AppConfirmDialogResult> =>
        Promise.resolve("cancel")
    );

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const selectEl = getEncodingSelect();

    await act(async () => {
      selectEl.value = "shiftJis";
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(onChangeSettings).not.toHaveBeenCalled();
  });

  it("does not show confirmation dialog when changing encoding back to UTF-8", async () => {
    const settings = createDefaultApplicationSettings();
    settings.textFiles.enablePlainTextDocuments = true;
    settings.textFiles.encoding = "shiftJis";

    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn();

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const selectEl = getEncodingSelect();
    expect(selectEl.value).toBe("shiftJis");

    await act(async () => {
      selectEl.value = "utf8";
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    const savedRequest = onChangeSettings.mock.calls[0][0] as SaveApplicationSettingsRequest;
    expect(savedRequest.textFiles.encoding).toBe("utf8");
  });

  it("keeps dependent controls disabled while Plain Text support is off, preserves values, and does not reach encoding confirmation", async () => {
    const settings = createDefaultApplicationSettings();
    settings.textFiles.enablePlainTextDocuments = false;
    settings.textFiles.encoding = "shiftJis";
    settings.textFiles.lineEnding = "crlf";

    const onChangeSettings = vi.fn();
    const confirmDialog = vi.fn();

    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    const encodingSelect = getEncodingSelect();
    const lineEndingSelect = getLineEndingSelect();

    expect(encodingSelect.disabled).toBe(true);
    expect(encodingSelect.value).toBe("shiftJis");
    expect(lineEndingSelect.disabled).toBe(true);
    expect(lineEndingSelect.value).toBe("crlf");

    await act(async () => {
      encodingSelect.value = "eucJp";
      encodingSelect.dispatchEvent(new Event("change", { bubbles: true }));
      lineEndingSelect.value = "lf";
      lineEndingSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(confirmDialog).not.toHaveBeenCalled();
    expect(onChangeSettings).not.toHaveBeenCalled();

    settings.textFiles.enablePlainTextDocuments = true;
    renderSettingsPanel(settings, onChangeSettings, confirmDialog);

    expect(getEncodingSelect().disabled).toBe(false);
    expect(getEncodingSelect().value).toBe("shiftJis");
    expect(getLineEndingSelect().disabled).toBe(false);
    expect(getLineEndingSelect().value).toBe("crlf");
  });
});
