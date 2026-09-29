import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import {
  JAPANESE_LINT_MAX_SOURCE_LENGTH,
  decideJapaneseLintToggle
} from "../../../src/shared/japaneseLint";
import { createJapaneseLintTooLargeDialogOptions } from "../../../src/renderer/japaneseLint/japaneseLintDialog";

const translateJa: Translate = (key, values) => t("ja", key, values);
const translateEn: Translate = (key, values) => t("en", key, values);

describe("toolbar toggle decision (#625)", () => {
  const base = { canUse: true, isActive: false } as const;

  it("turns ON for a document up to and including the limit", () => {
    expect(
      decideJapaneseLintToggle({ ...base, documentLength: 0 })
    ).toBe("turn-on");
    expect(
      decideJapaneseLintToggle({
        ...base,
        documentLength: JAPANESE_LINT_MAX_SOURCE_LENGTH
      })
    ).toBe("turn-on");
  });

  it("refuses to turn ON one character past the limit (stays OFF, dialog)", () => {
    expect(
      decideJapaneseLintToggle({
        ...base,
        documentLength: JAPANESE_LINT_MAX_SOURCE_LENGTH + 1
      })
    ).toBe("refuse-too-large");
    expect(
      decideJapaneseLintToggle({ ...base, documentLength: 1_000_000 })
    ).toBe("refuse-too-large");
  });

  it("always allows turning OFF, whatever the length", () => {
    expect(
      decideJapaneseLintToggle({
        canUse: true,
        isActive: true,
        documentLength: JAPANESE_LINT_MAX_SOURCE_LENGTH + 1
      })
    ).toBe("turn-off");
  });

  it("ignores the click on an unsupported surface", () => {
    expect(
      decideJapaneseLintToggle({
        canUse: false,
        isActive: false,
        documentLength: 10
      })
    ).toBe("ignore");
  });
});

describe("too-large Information dialog (#625)", () => {
  it("is an Information dialog with a single OK button", () => {
    const options = createJapaneseLintTooLargeDialogOptions(translateJa);

    expect(options.icon).toEqual({ kind: "info", tooltip: "情報" });
    expect(options.confirmLabel).toBe("OK");
    // OK only: no cancel button.
    expect(options.cancelLabel).toBeNull();
    expect(options.clipboardText).toBeNull();
  });

  it("uses the specified wording, on two lines", () => {
    const options = createJapaneseLintTooLargeDialogOptions(translateJa);

    expect(options.title).toBe("インスタント日本語表現チェック");
    expect(options.message).toEqual({
      kind: "plainText",
      text:
        "この文書は長文すぎるため、インスタント日本語表現チェックが行えません。" +
        String.fromCharCode(10) +
        "ファイルの右クリックメニューから個別に実施するか、文書を分割してください。"
    });
  });

  it("has an English translation too", () => {
    const options = createJapaneseLintTooLargeDialogOptions(translateEn);

    expect(options.title).toBe("Instant Japanese Style Check");
    expect(options.cancelLabel).toBeNull();
  });
});

describe("toolbar tooltip and no toast for the size limit (#625)", () => {
  it("names the button 'インスタント日本語表現チェック' (tooltip and label)", () => {
    expect(translateJa("toolbar.japaneseLint")).toBe(
      "インスタント日本語表現チェック"
    );
    expect(readFileSync("src/renderer/components/EditorToolbar.tsx", "utf8")).toContain(
      'title={translate("toolbar.japaneseLint")}'
    );
  });

  it("no longer has a too-large toast: the too-large path opens the dialog", () => {
    const app = readFileSync("src/renderer/App.tsx", "utf8");
    const notify = app.slice(
      app.indexOf("function notifyJapaneseLint("),
      app.indexOf("function notifyJapaneseLint(") + 700
    );

    expect(readFileSync("src/shared/i18n/ja.ts", "utf8")).not.toContain(
      "japaneseLint.toast.tooLarge"
    );
    expect(readFileSync("src/shared/i18n/en.ts", "utf8")).not.toContain(
      "japaneseLint.toast.tooLarge"
    );
    expect(notify).toContain('notice === "too-large"');
    expect(notify).toContain("setIsJapaneseLintActive(false)");
    expect(notify).toContain("showJapaneseLintTooLargeDialog()");
    // The too-large branch returns before the (truncated-only) toast.
    expect(notify.indexOf("showJapaneseLintTooLargeDialog()")).toBeLessThan(
      notify.indexOf("notificationController.notify")
    );
  });

  it("the toggle handler goes through the size decision before turning ON", () => {
    const app = readFileSync("src/renderer/App.tsx", "utf8");

    expect(app).toContain("decideJapaneseLintToggle({");
    expect(app).toContain('decision === "refuse-too-large"');
    expect(app).toContain("showJapaneseLintTooLargeDialog();");
  });

  it("keeps the Main Process too-large guard as a backstop", () => {
    const ipc = readFileSync("src/main/japaneseLintIpc.ts", "utf8");

    expect(ipc).toContain("isJapaneseLintSourceTooLarge(request.text.length)");
    expect(ipc).toContain('reason: "too-large"');
  });
});
