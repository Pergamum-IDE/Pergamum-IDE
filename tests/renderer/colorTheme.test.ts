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
  it("registers built-in themes (#623 Slice 4), each with a representative color", () => {
    expect(builtInThemes).toEqual([
      {
        id: "pergamum-light",
        label: "Pergamum Light",
        kind: "light",
        cssClassName: "theme-pergamum-light",
        accentColor: "#2563a8",
        preview: {
          background: "#ffffff",
          foreground: "#1f2933",
          border: "#cbd5df",
          accent: "#2563a8"
        }
      },
      {
        id: "night-dark",
        label: "Night Dark",
        kind: "dark",
        cssClassName: "theme-night-dark",
        accentColor: "#5b9bd5",
        preview: {
          background: "#1a1e25",
          foreground: "#d7dde5",
          border: "#3b4452",
          accent: "#5b9bd5"
        }
      },
      {
        id: "shine-moon",
        label: "Shine Moon",
        kind: "dark",
        cssClassName: "theme-shine-moon",
        accentColor: "#5ea8f8",
        preview: {
          background: "#171d27",
          foreground: "#dce5ef",
          border: "#354359",
          accent: "#5ea8f8"
        }
      },
      {
        id: "ginza-night",
        label: "Ginza Night",
        kind: "dark",
        cssClassName: "theme-ginza-night",
        accentColor: "#00d4ff",
        preview: {
          background: "#0d1015",
          foreground: "#f4f6fa",
          border: "#4d5d75",
          accent: "#00d4ff"
        }
      },
      {
        id: "resistance-blue",
        label: "Resistance Blue",
        kind: "light",
        cssClassName: "theme-resistance-blue",
        accentColor: "#1b62b0",
        preview: {
          background: "#e6eef7",
          foreground: "#162230",
          border: "#c4d5e7",
          accent: "#1b62b0"
        }
      },
      {
        id: "enlightened-green",
        label: "Enlightened Green",
        kind: "light",
        cssClassName: "theme-enlightened-green",
        accentColor: "#23733e",
        preview: {
          background: "#e6f0e8",
          foreground: "#19261d",
          border: "#c3d7c7",
          accent: "#23733e"
        }
      },
      {
        id: "banana-yellow",
        label: "Banana Yellow",
        kind: "light",
        cssClassName: "theme-banana-yellow",
        accentColor: "#7a5600",
        preview: {
          background: "#f5f0e1",
          foreground: "#272318",
          border: "#e1d8b9",
          accent: "#7a5600"
        }
      },
      {
        id: "sakura-pink",
        label: "Sakura Pink",
        kind: "light",
        cssClassName: "theme-sakura-pink",
        accentColor: "#a03a68",
        preview: {
          background: "#f2e4e8",
          foreground: "#26191d",
          border: "#dbbfc7",
          accent: "#a03a68"
        }
      },
      {
        id: "noble-purple",
        label: "Noble Purple",
        kind: "light",
        cssClassName: "theme-noble-purple",
        accentColor: "#6b46a1",
        preview: {
          background: "#eee8f6",
          foreground: "#211a2d",
          border: "#d5c8e6",
          accent: "#6b46a1"
        }
      },
      {
        id: "sky-cyan",
        label: "Sky Cyan",
        kind: "light",
        cssClassName: "theme-sky-cyan",
        accentColor: "#007a94",
        preview: {
          background: "#e5f5fb",
          foreground: "#102a34",
          border: "#b9dbe5",
          accent: "#007a94"
        }
      },
      {
        id: "parchment-sheep",
        label: "Parchment Sheep",
        kind: "light",
        cssClassName: "theme-parchment-sheep",
        accentColor: "#6b4f2a",
        preview: {
          background: "#ececd6",
          foreground: "#1f1f16",
          border: "#cdcdaa",
          accent: "#6b4f2a"
        }
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
    expect(isBuiltInThemeId("night-dark")).toBe(true);
    expect(isBuiltInThemeId("shine-moon")).toBe(true);
    expect(isBuiltInThemeId("ginza-night")).toBe(true);
    expect(isBuiltInThemeId("resistance-blue")).toBe(true);
    expect(isBuiltInThemeId("enlightened-green")).toBe(true);
    expect(isBuiltInThemeId("banana-yellow")).toBe(true);
    expect(isBuiltInThemeId("sakura-pink")).toBe(true);
    expect(isBuiltInThemeId("noble-purple")).toBe(true);
    expect(isBuiltInThemeId("sky-cyan")).toBe(true);
    expect(isBuiltInThemeId("parchment-sheep")).toBe(true);
    for (const bad of [
      "no-such-theme",
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
    for (const bad of ["no-such-theme", undefined, null, 3, "constructor"]) {
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

  it("switching to Night Dark swaps the class and sets color-scheme dark; switching back restores light", () => {
    const root = document.createElement("html");

    applyColorThemeById("pergamum-light", root);
    applyColorThemeById("night-dark", root);

    expect([...root.classList]).toEqual(["theme-night-dark"]);
    expect(root.dataset.theme).toBe("night-dark");
    expect(root.style.colorScheme).toBe("dark");

    applyColorThemeById("pergamum-light", root);

    expect([...root.classList]).toEqual(["theme-pergamum-light"]);
    expect(root.style.colorScheme).toBe("light");
  });

  it("an invalid id applies Pergamum Light instead of throwing", () => {
    const root = document.createElement("html");

    expect(() => applyColorThemeById("no-such-theme", root)).not.toThrow();
    expect(root.dataset.theme).toBe("pergamum-light");
    expect(root.classList.contains("theme-pergamum-light")).toBe(true);
  });
});
