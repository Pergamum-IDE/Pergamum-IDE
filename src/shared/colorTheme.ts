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
export const builtInThemeIds = ["pergamum-light"] as const;

export type BuiltInThemeId = (typeof builtInThemeIds)[number];

export type BuiltInThemeKind = "light" | "dark";

export interface BuiltInTheme {
  readonly id: BuiltInThemeId;
  readonly label: string;
  readonly kind: BuiltInThemeKind;
  readonly cssClassName: string;
}

export const defaultColorThemeId: BuiltInThemeId = "pergamum-light";

const builtInThemeById: Record<BuiltInThemeId, BuiltInTheme> = {
  "pergamum-light": {
    id: "pergamum-light",
    label: "Pergamum Light",
    kind: "light",
    cssClassName: "theme-pergamum-light"
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
