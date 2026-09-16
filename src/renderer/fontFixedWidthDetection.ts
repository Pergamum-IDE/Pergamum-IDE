import { quoteCssFontFamily } from "../shared/fontSettings";
import type { CachedFontFamily, FontFixedWidthStatus } from "../shared/fontCache";

/**
 * #495 (ADR-0015): fixed-width detection for the local font cache. Runs in
 * the renderer only — Canvas 2D `measureText` is a DOM API the main process
 * has no business touching (see fontCacheStore.ts: main only reads/writes/
 * validates the JSON payload it's handed).
 */

const FONT_WIDTH_EPSILON = 0.01;
const MEASURE_FONT_SIZE_PX = 16;

/** The two generic fallbacks used for the fallback-font guard (see
 * `detectFixedWidth`). Any two distinct generics work; these two are picked
 * because their default browser metrics differ enough to make a fallback
 * substitution obvious in the measured widths. */
const GUARD_GENERIC_A = "monospace";
const GUARD_GENERIC_B = "serif";

export type MeasureTextWidth = (fontCss: string, text: string) => number;

function nearlyEqual(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= FONT_WIDTH_EPSILON;
}

function buildMeasureFontCss(family: string, generic: string): string {
  return `normal 400 ${MEASURE_FONT_SIZE_PX}px ${quoteCssFontFamily(family)}, ${generic}`;
}

/**
 * Creates a `MeasureTextWidth` backed by a real, offscreen `<canvas>`.
 * Returns `null` when Canvas 2D isn't available (headless/unsupported
 * environments) — callers treat a `null` measurer as "cannot measure",
 * i.e. every family reports `"unknown"`.
 */
export function createCanvasMeasureTextWidth(): MeasureTextWidth | null {
  if (typeof document === "undefined") {
    return null;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  return (fontCss: string, text: string): number => {
    context.font = fontCss;
    return context.measureText(text).width;
  };
}

interface RawProbe {
  w: number;
  i: number;
  ww: number;
  fullW: number;
}

function probe(
  measure: MeasureTextWidth,
  family: string,
  generic: string
): RawProbe | null {
  const fontCss = buildMeasureFontCss(family, generic);
  const w = measure(fontCss, "W");
  const i = measure(fontCss, "i");
  const ww = measure(fontCss, "WW");
  const fullW = measure(fontCss, "Ｗ");
  if (![w, i, ww, fullW].every(Number.isFinite)) {
    return null;
  }
  return { w, i, ww, fullW };
}

function classify(probeResult: RawProbe): FontFixedWidthStatus {
  const widthEqualsI = nearlyEqual(probeResult.w, probeResult.i);
  const doubleWidthEqualsFullWidth = nearlyEqual(probeResult.ww, probeResult.fullW);
  return widthEqualsI && doubleWidthEqualsFullWidth ? "fixed" : "proportional";
}

/**
 * Classifies one family as fixed-width, proportional, or unknown (ADR-0015
 * rule: `width("W") == width("i")` AND `width("WW") == width("Ｗ")` ⇒
 * `"fixed"`; otherwise `"proportional"`; anything inconclusive ⇒
 * `"unknown"`).
 *
 * Fallback-font guard: the same four probes are measured twice, once with
 * each of two different trailing generic fallbacks appended to the font
 * string. If `family` actually resolves, the generic tail is never reached
 * by the renderer and both measurement sets must be identical; if `family`
 * doesn't resolve, the browser silently substitutes the generic instead,
 * and swapping monospace↔serif changes the measured widths. Any
 * disagreement between the two sets is treated as "we were measuring a
 * fallback font, not `family`" and returns `"unknown"` rather than risk
 * misclassifying it.
 */
export function detectFixedWidth(
  family: string,
  measure: MeasureTextWidth | null
): FontFixedWidthStatus {
  if (!measure || !family.trim()) {
    return "unknown";
  }

  try {
    const primary = probe(measure, family, GUARD_GENERIC_A);
    const secondary = probe(measure, family, GUARD_GENERIC_B);
    if (!primary || !secondary) {
      return "unknown";
    }

    const stableAcrossFallbacks =
      nearlyEqual(primary.w, secondary.w) &&
      nearlyEqual(primary.i, secondary.i) &&
      nearlyEqual(primary.ww, secondary.ww) &&
      nearlyEqual(primary.fullW, secondary.fullW);
    if (!stableAcrossFallbacks) {
      return "unknown";
    }

    return classify(primary);
  } catch {
    return "unknown";
  }
}

/**
 * Measures `fixedWidth` for every already-aggregated family. Never throws:
 * a single family's measurement failure is caught and isolated to that
 * family (reported as `"unknown"`), so it can never fail the whole scan.
 * Returns a new array; does not mutate `families`.
 */
export function measureFixedWidthForFamilies(
  families: readonly CachedFontFamily[],
  measure: MeasureTextWidth | null
): CachedFontFamily[] {
  return families.map((family) => {
    try {
      return { ...family, fixedWidth: detectFixedWidth(family.family, measure) };
    } catch {
      return { ...family, fixedWidth: "unknown" as FontFixedWidthStatus };
    }
  });
}
