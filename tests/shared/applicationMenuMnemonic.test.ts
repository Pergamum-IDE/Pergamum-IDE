import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationMenuModel,
  getApplicationMenuModel,
  type ApplicationMenuItem
} from "../../src/shared/applicationMenuModel";
import { enTranslations as en } from "../../src/shared/i18n/en";
import { jaTranslations as ja } from "../../src/shared/i18n/ja";

/**
 * #668: top-level menu mnemonics are canonical semantic metadata. Showing
 * them is the Renderer's job (see applicationMenuProjection); keyboard use is
 * #665. Native Electron menus and translations stay untouched.
 */
function mnemonicsByLabelKey(
  platform: "win32" | "linux" | "darwin"
): Record<string, string | undefined> {
  return Object.fromEntries(
    getApplicationMenuModel(platform).map((menu) => [
      "key" in menu.label ? menu.label.key : menu.label.literal,
      menu.mnemonic
    ])
  );
}

function allItems(
  items: readonly ApplicationMenuItem[]
): ApplicationMenuItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.type === "submenu" ? allItems(item.items) : [])
  ]);
}

describe("canonical menu mnemonics (#668)", () => {
  it.each(["win32", "linux"] as const)(
    "%s: File=F, Edit=E, View=V, Assist=A, Help=H",
    (platform) => {
      expect(mnemonicsByLabelKey(platform)).toEqual({
        "menu.file": "F",
        "menu.edit": "E",
        "menu.view": "V",
        "menu.assist": "A",
        "menu.help": "H"
      });
    }
  );

  it("macOS keeps the same mnemonics on the shared menus; its own menus have none", () => {
    const mac = mnemonicsByLabelKey("darwin");

    expect(mac["menu.file"]).toBe("F");
    expect(mac["menu.help"]).toBe("H");
    expect(mac["Pergamum"]).toBeUndefined();
    expect(mac["menu.window"]).toBeUndefined();
  });

  it("each mnemonic is one uppercase Latin letter and unique within a platform", () => {
    for (const platform of ["win32", "linux", "darwin"] as const) {
      const letters = getApplicationMenuModel(platform)
        .map((menu) => menu.mnemonic)
        .filter((letter): letter is string => letter !== undefined);

      for (const letter of letters) {
        expect(letter).toMatch(/^[A-Z]$/);
      }
      expect(new Set(letters).size).toBe(letters.length);
    }
  });

  it("only top-level menus have a mnemonic (no nested / item framework)", () => {
    for (const menu of applicationMenuModel) {
      for (const item of allItems(menu.items)) {
        expect(item).not.toHaveProperty("mnemonic");
      }
    }
  });

  it("lives in the model source, not as a Renderer-only table", () => {
    const model = readFileSync("src/shared/applicationMenuModel.ts", "utf8");
    for (const letter of ["F", "E", "V", "A", "H"]) {
      expect(model).toContain(`mnemonic: "${letter}"`);
    }
  });

  it("translations carry no mnemonic syntax (no & markers, no (F) suffixes)", () => {
    for (const dictionary of [en, ja] as const) {
      for (const [key, value] of Object.entries(dictionary)) {
        if (!key.startsWith("menu.")) continue;
        expect(value, key).not.toMatch(/&[A-Za-z]/);
        expect(value, key).not.toMatch(/\([A-Z]\)\s*$/);
      }
    }
  });

  it("the translations of the top-level labels are unchanged", () => {
    expect([ja["menu.file"], ja["menu.edit"], ja["menu.view"]]).toEqual([
      "ファイル",
      "編集",
      "表示"
    ]);
    // PO decision (#668): the Japanese Assist menu is "アシスト" (was "支援").
    expect([ja["menu.assist"], ja["menu.help"]]).toEqual([
      "アシスト",
      "ヘルプ"
    ]);
    expect([en["menu.file"], en["menu.assist"]]).toEqual(["File", "Assist"]);
  });

  it("the 支援ウィンドウ (utility window) translations are unchanged", () => {
    expect(ja["utilityWindow.label"]).toBe("支援ウィンドウ");
    expect(ja["utilityWindow.close"]).toBe("支援ウィンドウを閉じる");
    expect(ja["workbench.utilityWindowResizeHandle"]).toBe(
      "支援ウィンドウのサイズを変更"
    );
  });
});
