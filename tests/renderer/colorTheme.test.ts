// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  builtInThemeIds,
  builtInThemes,
  defaultColorThemeId,
  isBuiltInThemeId,
  resolveColorTheme
} from "../../src/shared/colorTheme";
import {
  applyColorTheme,
  applyColorThemeById
} from "../../src/renderer/colorTheme";

describe("built-in color theme registry (#621)", () => {
  it("registers exactly Pergamum Light for now", () => {
    expect(builtInThemes).toEqual([
      {
        id: "pergamum-light",
        label: "Pergamum Light",
        kind: "light",
        cssClassName: "theme-pergamum-light"
      }
    ]);
    expect(defaultColorThemeId).toBe("pergamum-light");
  });

  it("has a registry entry (with a unique class) for every id", () => {
    expect(builtInThemes.map((theme) => theme.id)).toEqual([
      ...builtInThemeIds
    ]);
    expect(new Set(builtInThemes.map((t) => t.cssClassName)).size).toBe(
      builtInThemes.length
    );
  });

  it("isBuiltInThemeId only accepts registered ids", () => {
    expect(isBuiltInThemeId("pergamum-light")).toBe(true);
    for (const bad of [
      "night-dark",
      "Pergamum Light",
      "",
      undefined,
      null,
      1,
      "toString",
      "__proto__"
    ]) {
      expect(isBuiltInThemeId(bad)).toBe(false);
    }
  });

  it("resolveColorTheme falls back to Pergamum Light for unknown values", () => {
    for (const bad of ["night-dark", undefined, null, 3, "constructor"]) {
      expect(resolveColorTheme(bad).id).toBe("pergamum-light");
    }
  });
});

describe("applyColorTheme (#621)", () => {
  it("puts the theme class, data-theme, and color-scheme on the root", () => {
    applyColorTheme(
      resolveColorTheme("pergamum-light"),
      document.documentElement
    );

    expect(
      document.documentElement.classList.contains("theme-pergamum-light")
    ).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("pergamum-light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("is idempotent and keeps unrelated root classes", () => {
    const root = document.createElement("html");
    root.classList.add("keep-me");

    applyColorThemeById("pergamum-light", root);
    applyColorThemeById("pergamum-light", root);

    expect([...root.classList].sort()).toEqual([
      "keep-me",
      "theme-pergamum-light"
    ]);
  });

  it("an invalid id applies Pergamum Light instead of throwing", () => {
    const root = document.createElement("html");

    expect(() => applyColorThemeById("no-such-theme", root)).not.toThrow();
    expect(root.dataset.theme).toBe("pergamum-light");
    expect(root.classList.contains("theme-pergamum-light")).toBe(true);
  });
});
