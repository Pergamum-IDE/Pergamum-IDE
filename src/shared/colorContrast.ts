/**
 * #623: WCAG 2.x contrast helpers. Pure functions, no DOM.
 *
 * Used by the theme token contrast tests so every built-in theme is checked
 * against the same readability floor. Supports the color formats the theme
 * tokens use: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` and `rgba(...)`.
 * Translucent colors are composited over an opaque backdrop first.
 */

export interface Rgba {
  readonly r: number; // 0-255
  readonly g: number;
  readonly b: number;
  readonly a: number; // 0-1
}

export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);

  if (hex) {
    let digits = hex[1] ?? "";

    if (digits.length <= 4) {
      digits = digits
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }

    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    };
  }

  const functional =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
      text
    );

  if (functional) {
    return {
      r: Number(functional[1]),
      g: Number(functional[2]),
      b: Number(functional[3]),
      a: functional[4] === undefined ? 1 : Number(functional[4])
    };
  }

  return null;
}

/** Composites `foreground` over an opaque `background`. */
export function compositeOver(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a;

  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1
  };
}

function linearChannel(channel: number): number {
  const value = channel / 255;

  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * linearChannel(color.r) +
    0.7152 * linearChannel(color.g) +
    0.0722 * linearChannel(color.b)
  );
}

/**
 * WCAG contrast ratio (1-21) between two colors. A translucent foreground is
 * composited over the background; the background itself must be opaque.
 * Throws on an unparsable color so a bad token fails loudly in tests.
 */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseColor(foreground);
  const bg = parseColor(background);

  if (fg === null) {
    throw new Error(`Unsupported color: ${foreground}`);
  }

  if (bg === null) {
    throw new Error(`Unsupported color: ${background}`);
  }

  const opaqueBackground: Rgba = { ...bg, a: 1 };
  const opaqueForeground = compositeOver(fg, opaqueBackground);
  const l1 = relativeLuminance(opaqueForeground);
  const l2 = relativeLuminance(opaqueBackground);

  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** WCAG AA / AAA thresholds. */
export const WCAG_AA_NORMAL_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT_OR_UI = 3;
export const WCAG_AAA_NORMAL_TEXT = 7;
