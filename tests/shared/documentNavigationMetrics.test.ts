import { describe, expect, it } from "vitest";
import {
  MANUSCRIPT_PAGE_CHARACTER_COUNT,
  estimateManuscriptPages
} from "../../src/shared/documentNavigationMetrics";

describe("estimateManuscriptPages (#360)", () => {
  it("uses 400 characters per manuscript page", () => {
    expect(MANUSCRIPT_PAGE_CHARACTER_COUNT).toBe(400);
  });

  it("is 0 for 0 characters", () => {
    expect(estimateManuscriptPages(0)).toBe(0);
  });

  it("rounds up any partial page", () => {
    expect(estimateManuscriptPages(1)).toBe(1);
    expect(estimateManuscriptPages(400)).toBe(1);
    expect(estimateManuscriptPages(401)).toBe(2);
    expect(estimateManuscriptPages(976)).toBe(3);
    expect(estimateManuscriptPages(12_345)).toBe(31);
  });

  it("never returns NaN or throws for invalid input", () => {
    expect(estimateManuscriptPages(-5)).toBe(0);
    expect(estimateManuscriptPages(Number.NaN)).toBe(0);
    expect(estimateManuscriptPages(Number.POSITIVE_INFINITY)).toBe(0);
    expect(estimateManuscriptPages("400" as unknown as number)).toBe(0);
  });
});
