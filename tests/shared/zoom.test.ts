import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM_FACTOR,
  MAX_ZOOM_FACTOR,
  MIN_ZOOM_FACTOR,
  ZOOM_CANDIDATES,
  clampZoomFactor,
  formatZoomFactorPercent,
  getNextZoomInFactor,
  getNextZoomOutFactor,
  normalizeZoomFactor
} from "../../src/shared/zoom";

describe("zoom helpers (#589)", () => {
  it("defines expected candidates and range constants", () => {
    expect(ZOOM_CANDIDATES).toEqual([
      0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0
    ]);
    expect(MIN_ZOOM_FACTOR).toBe(0.5);
    expect(MAX_ZOOM_FACTOR).toBe(2.0);
    expect(DEFAULT_ZOOM_FACTOR).toBe(1.0);
  });

  it("clampZoomFactor bounds values within 0.5 to 2.0", () => {
    expect(clampZoomFactor(0.1)).toBe(0.5);
    expect(clampZoomFactor(0.5)).toBe(0.5);
    expect(clampZoomFactor(1.0)).toBe(1.0);
    expect(clampZoomFactor(2.0)).toBe(2.0);
    expect(clampZoomFactor(3.0)).toBe(2.0);
    expect(clampZoomFactor(NaN)).toBe(1.0);
  });

  it("normalizeZoomFactor clamps and snaps to the nearest candidate", () => {
    expect(normalizeZoomFactor(0.1)).toBe(0.5);
    expect(normalizeZoomFactor(1.0)).toBe(1.0);
    expect(normalizeZoomFactor(1.12)).toBe(1.1);
    expect(normalizeZoomFactor(1.23)).toBe(1.25);
    expect(normalizeZoomFactor(1.70)).toBe(1.75);
    expect(normalizeZoomFactor(3.0)).toBe(2.0);
  });

  it("getNextZoomInFactor steps up along the candidate list", () => {
    expect(getNextZoomInFactor(0.5)).toBe(0.75);
    expect(getNextZoomInFactor(0.75)).toBe(0.9);
    expect(getNextZoomInFactor(0.9)).toBe(1.0);
    expect(getNextZoomInFactor(1.0)).toBe(1.1);
    expect(getNextZoomInFactor(1.1)).toBe(1.25);
    expect(getNextZoomInFactor(1.25)).toBe(1.5);
    expect(getNextZoomInFactor(1.5)).toBe(1.75);
    expect(getNextZoomInFactor(1.75)).toBe(2.0);
    expect(getNextZoomInFactor(2.0)).toBe(2.0);

    // Epsilon tolerance / near-miss inputs
    expect(getNextZoomInFactor(0.9999)).toBe(1.1);
    expect(getNextZoomInFactor(1.0001)).toBe(1.1);
  });

  it("getNextZoomOutFactor steps down along the candidate list", () => {
    expect(getNextZoomOutFactor(2.0)).toBe(1.75);
    expect(getNextZoomOutFactor(1.75)).toBe(1.5);
    expect(getNextZoomOutFactor(1.5)).toBe(1.25);
    expect(getNextZoomOutFactor(1.25)).toBe(1.1);
    expect(getNextZoomOutFactor(1.1)).toBe(1.0);
    expect(getNextZoomOutFactor(1.0)).toBe(0.9);
    expect(getNextZoomOutFactor(0.9)).toBe(0.75);
    expect(getNextZoomOutFactor(0.75)).toBe(0.5);
    expect(getNextZoomOutFactor(0.5)).toBe(0.5);

    // Epsilon tolerance / near-miss inputs
    expect(getNextZoomOutFactor(1.0001)).toBe(0.9);
    expect(getNextZoomOutFactor(0.9999)).toBe(0.9);
  });

  it("formatZoomFactorPercent formats factor into percentage string", () => {
    expect(formatZoomFactorPercent(0.5)).toBe("50%");
    expect(formatZoomFactorPercent(1.0)).toBe("100%");
    expect(formatZoomFactorPercent(1.25)).toBe("125%");
    expect(formatZoomFactorPercent(2.0)).toBe("200%");
  });
});
