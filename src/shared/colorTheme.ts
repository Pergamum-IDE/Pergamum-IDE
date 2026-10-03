/**
 * #621: built-in application color theme registry.
 *
 * Themes are CSS-driven: a theme is a `cssClassName` on the document root
 * that redefines the semantic `--pg-color-*` custom properties in
 * styles.css. This module owns only the registry (id / label / kind /
 * class); it does not know about the DOM. The renderer applies a resolved
 * theme in src/renderer/colorTheme.ts.
 *
 * Adding a built-in theme later means: add its id to `builtInThemeIds`, add
 * its entry to `builtInThemes` (the `Record` type makes a missing entry a
 * compile error), and add a matching `.theme-<id>` token block to
 * styles.css. Settings, the Settings UI select, fallback handling, and the
 * apply flow need no change.
 */

// Order is the order shown in the Settings select. Kept as a literal tuple
// so the settings catalog can use it as an enum value list.
export const builtInThemeIds = [
  "pergamum-light",
  "night-dark",
  "shine-moon",
  "ginza-night",
  "resistance-blue",
  "enlightened-green",
  "banana-yellow",
  "sakura-pink",
  "noble-purple",
  "sky-cyan",
  "parchment-sheep"
] as const;

export type BuiltInThemeId = (typeof builtInThemeIds)[number];

export type BuiltInThemeKind = "light" | "dark";

export interface BuiltInTheme {
  readonly id: BuiltInThemeId;
  readonly label: string;
  readonly kind: BuiltInThemeKind;
  readonly cssClassName: string;
  /**
   * Representative color shown as a swatch in the Settings theme selector
   * (#623). Deliberately a literal here, not a CSS token: the selector must
   * show each theme's own color regardless of the currently active theme.
   */
  readonly accentColor: string;
  /**
   * Colors the Settings theme selector paints a theme's option with, so each
   * option is a miniature preview of the theme's UI chrome (#623). Literals
   * for the same reason as `accentColor`; tests keep them in sync with the
   * theme's CSS tokens (app-background or surface-background /
   * surface-foreground / border-default / accent-primary). Note: this is for
   * the Settings dropdown UI option preview, not the Markdown document preview.
   */
  readonly preview: ThemePreviewColors;
}

export interface ThemePreviewColors {
  readonly background: string;
  readonly foreground: string;
  readonly border: string;
  readonly accent: string;
}

export const defaultColorThemeId: BuiltInThemeId = "pergamum-light";

const builtInThemeById: Record<BuiltInThemeId, BuiltInTheme> = {
  "pergamum-light": {
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
  "night-dark": {
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
  "shine-moon": {
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
  "ginza-night": {
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
  "resistance-blue": {
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
  "enlightened-green": {
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
  "banana-yellow": {
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
  "sakura-pink": {
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
  "noble-purple": {
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
  "sky-cyan": {
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
  "parchment-sheep": {
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
};

// Theme names are proper nouns and are intentionally not translated.
export const builtInThemes: readonly BuiltInTheme[] = builtInThemeIds.map(
  (id) => builtInThemeById[id]
);

export function isBuiltInThemeId(value: unknown): value is BuiltInThemeId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(builtInThemeById, value)
  );
}

/** Resolves any stored value to a registered theme; unknown -> default. */
export function resolveColorTheme(themeId: unknown): BuiltInTheme {
  return isBuiltInThemeId(themeId)
    ? builtInThemeById[themeId]
    : builtInThemeById[defaultColorThemeId];
}
