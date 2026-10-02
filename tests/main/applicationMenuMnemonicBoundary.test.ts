import { readFileSync } from "node:fs";
import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it } from "vitest";
import { buildNativeMenuTemplate } from "../../src/main/applicationMenuAdapter";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import type { Language } from "../../src/shared/i18n";
import type { PergamumPlatform } from "../../src/shared/keybindings";

/**
 * #668 boundaries: the mnemonic metadata added to the canonical model must
 * not leak into the native Electron menu (no `&` markers, no "(F)" suffixes),
 * and the Renderer shows it as text only (no underline).
 */
function labels(
  items: readonly MenuItemConstructorOptions[]
): string[] {
  return items.flatMap((item) => [
    ...(typeof item.label === "string" ? [item.label] : []),
    ...(Array.isArray(item.submenu) ? labels(item.submenu) : [])
  ]);
}

function build(platform: PergamumPlatform, language: Language) {
  return buildNativeMenuTemplate({
    language,
    platform,
    accelerators: createMenuAcceleratorLookup(platform),
    sendCommand: () => true
  });
}

describe("native menu is untouched by the mnemonic metadata (#668)", () => {
  it.each(["win32", "linux", "darwin"] as const)(
    "%s: no label carries an & marker or a (X) mnemonic suffix, in ja and en",
    (platform) => {
      for (const language of ["ja", "en"] as const) {
        for (const label of labels(build(platform, language))) {
          expect(label, `${platform}/${language}`).not.toMatch(/&/);
          expect(label, `${platform}/${language}`).not.toMatch(/\([A-Z]\)$/);
        }
      }
    }
  );

  it("keeps the plain native top-level labels", () => {
    expect(build("win32", "ja").map((item) => item.label)).toEqual([
      "ファイル",
      "編集",
      "表示",
      "アシスト",
      "ヘルプ"
    ]);
    expect(build("win32", "en").map((item) => item.label)).toEqual([
      "File",
      "Edit",
      "View",
      "Assist",
      "Help"
    ]);
    expect(build("darwin", "en")[0].label).toBe("Pergamum");
  });

  it("the adapter does not read the mnemonic at all", () => {
    const adapter = readFileSync(
      "src/main/applicationMenuAdapter.ts",
      "utf8"
    );

    expect(adapter).not.toContain("mnemonic");
  });
});

describe("the Renderer menu shows the mnemonic as text only (#668)", () => {
  const css = readFileSync("src/renderer/styles.css", "utf8");
  const menuCss = css
    .slice(css.indexOf("/* #663: Renderer application menu bar"))
    .replace(/\/\*[\s\S]*?\*\//g, "");

  it("adds no underline / text-decoration to the menu bar styles", () => {
    expect(menuCss).not.toMatch(/text-decoration/);
    expect(menuCss).not.toMatch(/underline/);
  });

  it("the component renders no underline markup", () => {
    const component = readFileSync(
      "src/renderer/ApplicationMenuBar.tsx",
      "utf8"
    );

    expect(component).not.toMatch(/<u[\s>]|<ins[\s>]|underline|text-decoration/);
  });

  it("keeps locale-specific label building out of the component", () => {
    // (comments may mention #665's mnemonics; only code is checked)
    const component = readFileSync("src/renderer/ApplicationMenuBar.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(component).not.toMatch(/mnemonic/i);
    expect(component).toContain("{menu.label}");
  });
});
