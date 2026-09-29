import {
  builtInThemes,
  resolveColorTheme,
  type BuiltInTheme
} from "../shared/colorTheme";

/**
 * #621: applies a built-in color theme to the document root.
 *
 * Theme switching is CSS-only: the theme's class on <html> redefines the
 * semantic `--pg-color-*` custom properties in styles.css. Nothing is
 * re-mounted, so editor content / selection / undo history are untouched.
 * `root` is injectable so this stays testable without a full DOM.
 */
export function applyColorTheme(
  theme: BuiltInTheme,
  root: HTMLElement = document.documentElement
): void {
  for (const candidate of builtInThemes) {
    if (candidate.id !== theme.id) {
      root.classList.remove(candidate.cssClassName);
    }
  }

  root.classList.add(theme.cssClassName);
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.kind;
}

/** Resolves a stored (possibly invalid) theme id and applies it. */
export function applyColorThemeById(
  themeId: unknown,
  root: HTMLElement = document.documentElement
): void {
  applyColorTheme(resolveColorTheme(themeId), root);
}
