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
export const builtInThemeIds = ["pergamum-light", "night-dark"] as const;

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
   * option is a miniature of the theme (#623). Literals for the same reason
   * as `accentColor`; tests keep them in sync with the theme's CSS tokens
   * (surface-background / surface-foreground / border-default / accent-primary).
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
