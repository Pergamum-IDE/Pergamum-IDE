/**
 * #375 Document Map tag-colour auto-adjustment.
 *
 * A Glossary tag colour that reads well as a UI chip can vanish into the
 * Document Map's 2×2 cells / narration colour. When
 * `documentMap.adjustTagColorsForVisibility` is on, the map draws each tag in a
 * DERIVED colour: same hue, same lightness, saturation forced to a fixed value.
 *
 *   - The tag DEFINITION (`GlossaryTag.backgroundRgb`) is never touched.
 *   - The adjustment is computed ONCE PER TAG (see
 *     {@link buildDocumentMapTagColorCache}) — never per pixel.
 *
 * PoC scope: fixed saturation, lightness kept as-is (no clamp), no alpha,
 * output is always `#rrggbb`.
 */

import {
  GlossaryValidationError,
  normalizeGlossaryRgbHex
} from "./glossary";

/** Fixed HSL saturation (0..1) the Document Map forces every tag colour to. */
export const DOCUMENT_MAP_TAG_COLOR_SATURATION = 0.85;

interface Hsl {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  l: number;
}

/** `#rrggbb` (0..255 channels) → HSL. Achromatic input yields `h = 0`. */
function rgbHexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  if (h < 0) {
    h += 360;
  }

  return { h, s, l };
}

function channelToHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value * 255)));
  return clamped.toString(16).padStart(2, "0");
}

/** HSL (`h` 0..360, `s`/`l` 0..1) → `#rrggbb`. */
function hslToRgbHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) {
    [r, g, b] = [c, x, 0];
  } else if (hp < 2) {
    [r, g, b] = [x, c, 0];
  } else if (hp < 3) {
    [r, g, b] = [0, c, x];
  } else if (hp < 4) {
    [r, g, b] = [0, x, c];
  } else if (hp < 5) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return `#${channelToHex(r + m)}${channelToHex(g + m)}${channelToHex(b + m)}`;
}

/**
 * #375: `rgb` with its saturation forced to `saturation` (default
 * {@link DOCUMENT_MAP_TAG_COLOR_SATURATION}), hue and lightness kept. Accepts
 * `#rgb` / `#rrggbb` in any case; returns lowercase `#rrggbb`. A value that is
 * not a hex colour is returned UNCHANGED (the draw side must never throw).
 * `rgb` itself is never mutated.
 */
export function adjustDocumentMapTagColorForVisibility(
  rgb: string,
  saturation: number = DOCUMENT_MAP_TAG_COLOR_SATURATION
): string {
  let normalized: string;
  try {
    normalized = normalizeGlossaryRgbHex(rgb);
  } catch (error) {
    if (error instanceof GlossaryValidationError) {
      return rgb;
    }
    throw error;
  }

  const hsl = rgbHexToHsl(normalized);
  const forcedSaturation = Math.max(0, Math.min(1, saturation));
  return hslToRgbHex({ h: hsl.h, s: forcedSaturation, l: hsl.l });
}

export interface DocumentMapTagColorCacheInput {
  /** The distinct tags that may colour a Document Map hit. */
  tags: readonly { id: string; backgroundRgb: string }[];
  /** `documentMap.adjustTagColorsForVisibility`. */
  adjustTagColorsForVisibility: boolean;
  /** Override the fixed saturation (PoC: unused by callers). */
  saturation?: number;
}

/**
 * #375: `tagId → colour to draw` for every tag in `tags`. When
 * `adjustTagColorsForVisibility` is on, the value is the HSL-adjusted colour
 * (computed once here, per tag); when off, it is the tag's raw `backgroundRgb`.
 * The draw side reads this map — it does NOT convert colours per pixel.
 *
 * ONLY Glossary tag colours pass through here. The Document Map's narration /
 * dialogue-pair / untagged-fallback colours are NEVER adjusted — they are a
 * separate "document structure" layer designed by brightness.
 */
export function buildDocumentMapTagColorCache(
  input: DocumentMapTagColorCacheInput
): Map<string, string> {
  const cache = new Map<string, string>();
  for (const tag of input.tags) {
    if (cache.has(tag.id)) {
      continue;
    }
    cache.set(
      tag.id,
      input.adjustTagColorsForVisibility
        ? adjustDocumentMapTagColorForVisibility(
            tag.backgroundRgb,
            input.saturation
          )
        : tag.backgroundRgb
    );
  }
  return cache;
}
