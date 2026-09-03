/**
 * #375: Glossary tag color helpers.
 *
 * Foreground auto-calculation is a plain YIQ integer computation
 * (`R*299 + G*587 + B*114`, threshold `128000`). There is NO stored
 * auto/manual mode and no "Auto" button — randomizing the background
 * recomputes `foregroundRgb` from it once, and the user is free to type over
 * the foreground afterwards.
 */

import { normalizeGlossaryRgbHex } from "./glossary";

export const GLOSSARY_TAG_YIQ_THRESHOLD = 128000;

function rgbChannels(rgbHex: string): [number, number, number] {
  const hex = normalizeGlossaryRgbHex(rgbHex).slice(1);

  return [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16)
  ) as [number, number, number];
}

/**
 * `"#000000"` on a light background, `"#ffffff"` on a dark one, decided by the
 * YIQ luminance of `backgroundRgb`. Throws (via `normalizeGlossaryRgbHex`)
 * when `backgroundRgb` is not a valid hex color.
 */
export function autoGlossaryTagForegroundRgb(
  backgroundRgb: string
): "#000000" | "#ffffff" {
  const [r, g, b] = rgbChannels(backgroundRgb);
  const luminance = r * 299 + g * 587 + b * 114;

  return luminance >= GLOSSARY_TAG_YIQ_THRESHOLD ? "#000000" : "#ffffff";
}

/** A random normalized `#rrggbb`. `random` is injectable for tests. */
export function randomGlossaryTagBackgroundRgb(
  random: () => number = Math.random
): string {
  const channel = (): string => {
    const value = Math.max(0, Math.min(255, Math.floor(random() * 256)));

    return value.toString(16).padStart(2, "0");
  };

  return `#${channel()}${channel()}${channel()}`;
}
