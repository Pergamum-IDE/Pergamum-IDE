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

function translate(key: string): string {
  return t("ja", key as Parameters<typeof t>[1]);
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
        selectedCategoryId="application"
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
    '#settingLabel-workbench\\.enablePlainTextDocuments + div input[type="checkbox"]'
  );
  if (!checkbox) {
    throw new Error("Plain text documents switch not found");
  }
  return checkbox;
}

describe("workbench.enablePlainTextDocuments Confirmation Dialog (#501 Slice 2)", () => {
  it("defaults to false in effective settings", () => {
    const defaultSettings = createDefaultApplicationSettings();
    const effective = resolveEffectiveSettings(defaultSettings, null);

    expect(effective.workbench.enablePlainTextDocuments).toBe(false);
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
    expect(savedRequest.workbench.enablePlainTextDocuments).toBe(true);
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
    settings.workbench.enablePlainTextDocuments = true;

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
    expect(savedRequest.workbench.enablePlainTextDocuments).toBe(false);
  });
});
