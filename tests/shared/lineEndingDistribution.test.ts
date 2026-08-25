import { describe, expect, it } from "vitest";
import { computeLineEndingDistribution } from "../../src/renderer/lineEndingDistribution";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import {
  analyzeLineEndings,
  type LineEndingBreak
} from "../../src/renderer/lineEndingTracking";

function breaksFromKinds(kinds: readonly LineEndingBreak["kind"][]) {
  return buildLineEndingBreakSet(
    kinds.map((kind, index) => ({ position: index, kind }))
  );
}

describe("computeLineEndingDistribution (#252)", () => {
  it("matches the issue's worked example: CRLF 4, LF 1, CR 1, total 6", () => {
    const breaks = breaksFromKinds([
      "crlf",
      "crlf",
      "crlf",
      "crlf",
      "lf",
      "cr"
    ]);

    const distribution = computeLineEndingDistribution(breaks, "lf");

    expect(distribution.counts).toEqual({ lf: 1, crlf: 4, cr: 1 });
    expect(distribution.total).toBe(6);
    expect(distribution.percentages.crlf).toBeCloseTo(66.7, 5);
    expect(distribution.percentages.lf).toBeCloseTo(16.7, 5);
    expect(distribution.percentages.cr).toBeCloseTo(16.7, 5);
  });

  it("counts CRLF as exactly one break, sourced from the real #253 tracking data (analyzeLineEndings), not a reparse", () => {
    const raw = "abc\r\ndef\nghi";
    const breaks = buildLineEndingBreakSet(analyzeLineEndings(raw));

    const distribution = computeLineEndingDistribution(breaks, "lf");

    expect(distribution.counts).toEqual({ lf: 1, crlf: 1, cr: 0 });
    expect(distribution.total).toBe(2);
  });

  it("does not count EOF without a terminating break", () => {
    const breaks = buildLineEndingBreakSet(analyzeLineEndings("no newline here"));

    const distribution = computeLineEndingDistribution(breaks, "lf");

    expect(distribution.total).toBe(0);
  });

  it("handles a zero-break document safely, with all percentages 0", () => {
    const breaks = breaksFromKinds([]);

    const distribution = computeLineEndingDistribution(breaks, "lf");

    expect(distribution.total).toBe(0);
    expect(distribution.counts).toEqual({ lf: 0, crlf: 0, cr: 0 });
    expect(distribution.percentages).toEqual({ lf: 0, crlf: 0, cr: 0 });
    expect(distribution.unexpectedCount).toBe(0);
  });

  it("rounds percentages to one decimal place", () => {
    // 1/3 = 33.333...%, 2/3 = 66.666...%
    const breaks = breaksFromKinds(["lf", "crlf", "crlf"]);

    const distribution = computeLineEndingDistribution(breaks, "lf");

    expect(distribution.percentages.lf).toBe(33.3);
    expect(distribution.percentages.crlf).toBe(66.7);
  });

  it("reports the expected kind passed in, unchanged", () => {
    const breaks = breaksFromKinds(["lf"]);

    expect(computeLineEndingDistribution(breaks, "crlf").expectedKind).toBe(
      "crlf"
    );
    expect(computeLineEndingDistribution(breaks, "cr").expectedKind).toBe(
      "cr"
    );
  });

  it("counts every break whose kind differs from expectedKind as unexpected", () => {
    const breaks = breaksFromKinds(["lf", "lf", "crlf", "cr"]);

    expect(computeLineEndingDistribution(breaks, "lf").unexpectedCount).toBe(
      2
    );
    expect(computeLineEndingDistribution(breaks, "crlf").unexpectedCount).toBe(
      3
    );
  });

  it("reports zero unexpected breaks when every kind matches expectedKind", () => {
    const breaks = breaksFromKinds(["lf", "lf", "lf"]);

    expect(computeLineEndingDistribution(breaks, "lf").unexpectedCount).toBe(
      0
    );
  });
});
