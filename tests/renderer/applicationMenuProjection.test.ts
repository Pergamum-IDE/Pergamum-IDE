import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import {
  getApplicationMenuModel,
  type ApplicationMenuItem
} from "../../src/shared/applicationMenuModel";
import {
  applicationCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";
import {
  presentMnemonicLabel,
  projectApplicationMenu,
  shouldShowRendererMenuBar,
  type RendererMenuEntry
} from "../../src/renderer/applicationMenuProjection";

const translateFor =
  (language: Language): Translate =>
  (key, values) =>
    t(language, key, values);

function flatten(entries: readonly RendererMenuEntry[]): RendererMenuEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.kind === "submenu" ? flatten(entry.items) : [])
  ]);
}

function modelCommandIds(items: readonly ApplicationMenuItem[]): string[] {
  return items.flatMap((item) => {
    if (item.type === "command") return [item.commandId];
    if (item.type === "nativeRole") {
      return item.commandId ? [item.commandId] : [];
    }
    if (item.type === "submenu") return modelCommandIds(item.items);
    return [];
  });
}

describe("renderer menu projection (#663)", () => {
  it("shows the Renderer menu bar on Windows / Linux only", () => {
    expect(shouldShowRendererMenuBar("windows")).toBe(true);
    expect(shouldShowRendererMenuBar("linux")).toBe(true);
    expect(shouldShowRendererMenuBar("macos")).toBe(false);
    expect(shouldShowRendererMenuBar("other")).toBe(false);
  });

  it.each(["windows", "linux"] as const)(
    "%s: top-level menus follow the canonical model order",
    (appPlatform) => {
      const projected = projectApplicationMenu(appPlatform, {
        translate: translateFor("en")
      });

      expect(projected.map((menu) => menu.label)).toEqual([
        "File",
        "Edit",
        "View",
        "Assist",
        "Help"
      ]);
      expect(projected).toHaveLength(
        getApplicationMenuModel(appPlatform === "windows" ? "win32" : "linux")
          .length
      );
    }
  );

  it("projects every model item 1:1 (same command identities, same order)", () => {
    const expected = modelCommandIds(
      getApplicationMenuModel("win32").flatMap((menu) => menu.items)
    );
    const projected = flatten(
      projectApplicationMenu("windows", { translate: translateFor("en") })
    ).flatMap((entry) =>
      entry.kind === "item" && entry.target.commandId !== undefined
        ? [entry.target.commandId]
        : []
    );

    expect(projected).toEqual(expected);
  });

  it("renders the nested File > Import submenu and its separators", () => {
    const [file] = projectApplicationMenu("windows", {
      translate: translateFor("en")
    });
    const importMenu = file.items.find((entry) => entry.kind === "submenu");

    expect(importMenu).toMatchObject({ kind: "submenu", label: "Import" });
    expect(
      importMenu?.kind === "submenu"
        ? importMenu.items.map((entry) => entry.kind === "item" && entry.target)
        : []
    ).toEqual([
      {
        type: "command",
        commandId: applicationCommandIds.openBulkTextImportDialog
      }
    ]);
    expect(
      file.items.filter((entry) => entry.kind === "separator").length
    ).toBeGreaterThan(2);
  });

  it("keeps native-role items as role targets (no command substitution)", () => {
    const edit = projectApplicationMenu("windows", {
      translate: translateFor("en")
    })[1];
    const copy = flatten(edit.items).find(
      (entry) => entry.kind === "item" && entry.label === "Copy"
    );

    expect(copy).toMatchObject({
      kind: "item",
      target: {
        type: "nativeRole",
        role: "copy",
        commandId: editorCommandIds.copySelection
      }
    });
  });

  it("resolves labels through translation keys for the current language (#668: ja shows the mnemonic)", () => {
    const ja = projectApplicationMenu("windows", {
      translate: translateFor("ja")
    });

    // Assist is "アシスト" in Japanese (PO decision, #668).
    expect(ja.map((menu) => menu.label)).toEqual([
      "ファイル(F)",
      "編集(E)",
      "表示(V)",
      "アシスト(A)",
      "ヘルプ(H)"
    ]);
  });

  it("#668: English labels already contain their mnemonic and stay plain", () => {
    const en = projectApplicationMenu("windows", {
      translate: translateFor("en")
    });

    expect(en.map((menu) => menu.label)).toEqual([
      "File",
      "Edit",
      "View",
      "Assist",
      "Help"
    ]);
  });

  it("#668: passes the canonical mnemonic through for #665, in every language", () => {
    for (const language of ["ja", "en"] as const) {
      const menus = projectApplicationMenu("linux", {
        translate: translateFor(language)
      });

      expect(menus.map((menu) => menu.mnemonic)).toEqual([
        "F",
        "E",
        "V",
        "A",
        "H"
      ]);
    }
  });

  it("#668: nested menus and items carry no mnemonic", () => {
    const [file] = projectApplicationMenu("windows", {
      translate: translateFor("ja")
    });
    const nested = flatten(file.items).filter(
      (entry) => entry.kind === "submenu"
    );

    expect(nested.length).toBeGreaterThan(0);
    for (const entry of nested) {
      expect(entry).not.toHaveProperty("mnemonic");
      expect(entry.label).not.toMatch(/\([A-Z]\)$/);
    }
  });

  it("attaches shortcut label / disabled only from the injected view state", () => {
    const none = flatten(
      projectApplicationMenu("windows", { translate: translateFor("en") })
    );
    expect(
      none.every(
        (entry) =>
          entry.kind !== "item" ||
          (entry.shortcutLabel === undefined && entry.disabled === false)
      )
    ).toBe(true);

    const injected = flatten(
      projectApplicationMenu("windows", {
        translate: translateFor("en"),
        getShortcutLabel: (request) =>
          request.id === editorCommandIds.saveDocument ? "Ctrl+S" : undefined,
        isDisabled: (id) => id === editorCommandIds.saveAll
      })
    );
    const save = injected.find(
      (entry) => entry.kind === "item" && entry.label === "Save"
    );
    const saveAll = injected.find(
      (entry) => entry.kind === "item" && entry.label === "Save All"
    );

    expect(save).toMatchObject({ shortcutLabel: "Ctrl+S", disabled: false });
    expect(saveAll).toMatchObject({ disabled: true });
  });

  it("#668 presentMnemonicLabel: suffix only when the label lacks the letter", () => {
    expect(presentMnemonicLabel("ファイル", "F")).toBe("ファイル(F)");
    expect(presentMnemonicLabel("File", "F")).toBe("File");
    expect(presentMnemonicLabel("help", "H")).toBe("help");
    expect(presentMnemonicLabel("ファイル", undefined)).toBe("ファイル");
  });

  it("#668: never guesses the mnemonic from the label or keeps its own table", () => {
    const source = readFileSync(
      "src/renderer/applicationMenuProjection.ts",
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(source).not.toMatch(/\[0\]|charAt\(|\.at\(0\)|slice\(0,\s*1\)/);
    expect(source).not.toMatch(/"[A-Z]"\s*[:,\]]/);
    expect(source).toContain("menu.mnemonic");
  });

  it("is a projection, not a second menu definition", () => {
    const source = readFileSync(
      "src/renderer/applicationMenuProjection.ts",
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    // No menu labels, shortcut strings or command id tables written out here.
    expect(source).not.toMatch(/"(File|Edit|View|Assist|Help)"/);
    expect(source).not.toMatch(/CommandOrControl|Ctrl\+|Shift\+/);
    expect(source).not.toMatch(/commandIds"/);
  });
});
