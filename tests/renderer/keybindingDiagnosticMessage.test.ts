import { describe, expect, it } from "vitest";
import { t } from "../../src/shared/i18n";
import {
  keybindingDiagnosticMessage,
  keybindingDiagnosticMessageKey
} from "../../src/renderer/keybindings/keybindingDiagnosticMessage";
import type { KeybindingDiagnosticCode } from "../../src/shared/keybindings";

const userFacingCodes: KeybindingDiagnosticCode[] = [
  "jsonParseError", "rootMustBeArray", "entryMustBeObject", "missingKey",
  "missingCommand", "invalidKeyType", "invalidCommandType", "invalidWhenType",
  "unknownField", "invalidKeyNotation", "unknownCommand", "readonlyCommand",
  "unsupportedWhen", "duplicateUserEntry", "conflictingKey",
  "unbindTargetNotFound", "reservedForbiddenKey", "reservedReloadKey",
  "reservedNativeOnlyKey", "reservedDiscouragedKey", "fileReadError",
  "fileWriteError"
];

describe("keybindingDiagnosticMessage (#651)", () => {
  for (const language of ["ja", "en"] as const) {
    const translate = (key: Parameters<typeof t>[1], values?: Record<string, string | number>) =>
      t(language, key, values);

    it(`has a ${language} message for every user-facing code, without the developer text`, () => {
      for (const code of userFacingCodes) {
        expect(keybindingDiagnosticMessageKey(code)).toBeDefined();
        const message = keybindingDiagnosticMessage(
          { code, message: "DEV-DETAIL", command: "c.id", key: "Mod-s", when: "w", field: "f" },
          translate,
          language
        );
        expect(message).not.toBe("");
        expect(message).not.toContain("DEV-DETAIL");
        expect(message).not.toMatch(/\{\w+\}/);
      }
    });
  }

  it("interpolates command / key / when / field values", () => {
    const ja = (key: Parameters<typeof t>[1], v?: Record<string, string | number>) => t("ja", key, v);
    expect(
      keybindingDiagnosticMessage({ code: "invalidKeyNotation", message: "", key: "Ctrl+S" }, ja, "ja")
    ).toBe("`Ctrl+S` は対応していないキー表記です。例: `Mod-s`");
    expect(
      keybindingDiagnosticMessage({ code: "unknownCommand", message: "", command: "unknown.command" }, ja, "ja")
    ).toBe("`unknown.command` というコマンドは存在しません。");
    expect(
      keybindingDiagnosticMessage({ code: "unknownField", message: "", field: "args" }, ja, "ja")
    ).toBe("未対応の項目 `args` は無視されます。");
    expect(
      keybindingDiagnosticMessage({ code: "unsupportedWhen", message: "", when: "foo && bar" }, ja, "ja")
    ).toBe(
      "この when 条件（`foo && bar`）は現在サポートされていません。このショートカット定義は適用されません。"
    );
  });

  it("falls back to a generic localized message in ja, and to the developer message in en", () => {
    const unknown = { code: "brandNew" as KeybindingDiagnosticCode, message: "Raw English" };
    expect(
      keybindingDiagnosticMessage(unknown, (k, v) => t("ja", k, v), "ja")
    ).toBe("キーバインド設定で問題が発生しました。（brandNew）");
    expect(
      keybindingDiagnosticMessage(unknown, (k, v) => t("en", k, v), "en")
    ).toBe("Raw English");
  });
});
