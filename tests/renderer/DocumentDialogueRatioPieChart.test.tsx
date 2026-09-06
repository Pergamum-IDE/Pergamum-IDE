import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DocumentDialogueRatioPieChart,
  computePieSlices,
  describePieSector,
  dialogueRatioPieModel,
  PIE_RADIUS
} from "../../src/renderer/DocumentDialogueRatioPieChart";

describe("dialogueRatioPieModel (#360 polish)", () => {
  it("marks total = 0 as empty and plots nothing", () => {
    const model = dialogueRatioPieModel(0, 0, 0);
    expect(model).toEqual({
      isEmpty: true,
      narrationPercent: 0,
      dialoguePercent: 0
    });
  });

  it("keeps a mixed split summing to 100", () => {
    const model = dialogueRatioPieModel(62, 38, 12_500);
    expect(model.isEmpty).toBe(false);
    expect(model.narrationPercent + model.dialoguePercent).toBe(100);
    expect(model.narrationPercent).toBe(62);
    expect(model.dialoguePercent).toBe(38);
  });

  it("derives dialogue as the remainder so rounding never breaks the ring", () => {
    // Source percents that do NOT sum to 100 (defensive).
    const model = dialogueRatioPieModel(67, 34, 900);
    expect(model.narrationPercent).toBe(67);
    expect(model.dialoguePercent).toBe(33);
    expect(model.narrationPercent + model.dialoguePercent).toBe(100);
  });

  it("renders a full narration ring at 100%", () => {
    const model = dialogueRatioPieModel(100, 0, 1000);
    expect(model).toEqual({
      isEmpty: false,
      narrationPercent: 100,
      dialoguePercent: 0
    });
  });

  it("renders a zero-length narration arc when it is all dialogue", () => {
    const model = dialogueRatioPieModel(0, 100, 1000);
    expect(model).toEqual({
      isEmpty: false,
      narrationPercent: 0,
      dialoguePercent: 100
    });
  });

  it("never produces NaN / Infinity / out-of-range values", () => {
    for (const [n, d, t] of [
      [Number.NaN, Number.NaN, 100],
      [Number.POSITIVE_INFINITY, 0, 100],
      [-40, 140, 100],
      [250, -10, 100],
      [50, 50, Number.NaN],
      [50, 50, Number.POSITIVE_INFINITY]
    ] as const) {
      const model = dialogueRatioPieModel(n, d, t);
      for (const value of [model.narrationPercent, model.dialoguePercent]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      if (!model.isEmpty) {
        expect(model.narrationPercent + model.dialoguePercent).toBe(100);
      }
    }
  });
});


describe("computePieSlices raw count geometry (#396)", () => {
  it("returns full circle for 100% narration only", () => {
    const slices = computePieSlices(1000, 1000, []);
    expect(slices.length).toBe(1);
    expect(slices[0].key).toBe("narration");
    expect(slices[0].isFullCircle).toBe(true);
    expect(slices[0].startAngle).toBe(0);
    expect(slices[0].endAngle).toBe(2 * Math.PI);
  });

  it("returns full circle for single pair 100% when narration is 0", () => {
    const slices = computePieSlices(1000, 0, [
      { pairIndex: 0, characters: 1000, color: "#61afef" }
    ]);
    expect(slices.length).toBe(1);
    expect(slices[0].key).toBe("pair-0");
    expect(slices[0].isFullCircle).toBe(true);
    expect(slices[0].color).toBe("#61afef");
  });

  it("computes exact sectors from raw counts closing mathematically to 360 degrees", () => {
    const pairs = [
      { pairIndex: 0, characters: 250, color: "#61afef" },
      { pairIndex: 1, characters: 150, color: "#c678dd" }
    ];
    const slices = computePieSlices(1000, 600, pairs);
    expect(slices.length).toBe(3);

    // Narration: 0 to 600 / 1000 * 2π = 1.2π
    expect(slices[0].key).toBe("narration");
    expect(slices[0].isFullCircle).toBe(false);
    expect(slices[0].startAngle).toBeCloseTo(0);
    expect(slices[0].endAngle).toBeCloseTo(1.2 * Math.PI);

    // Pair 0: 1.2π to (600 + 250) / 1000 * 2π = 1.7π
    expect(slices[1].key).toBe("pair-0");
    expect(slices[1].color).toBe("#61afef");
    expect(slices[1].startAngle).toBeCloseTo(1.2 * Math.PI);
    expect(slices[1].endAngle).toBeCloseTo(1.7 * Math.PI);

    // Pair 1: 1.7π to 2.0π
    expect(slices[2].key).toBe("pair-1");
    expect(slices[2].color).toBe("#c678dd");
    expect(slices[2].startAngle).toBeCloseTo(1.7 * Math.PI);
    expect(slices[2].endAngle).toBeCloseTo(2.0 * Math.PI);

    // Circle is fully closed: first start is 0, last end is 2π
    expect(slices[0].startAngle).toBe(0);
    expect(slices[slices.length - 1].endAngle).toBeCloseTo(2 * Math.PI);
  });

  it("handles rounding-prone counts (e.g. 1/1/1) closing exactly to 2π without gap", () => {
    const pairs = [
      { pairIndex: 0, characters: 1, color: "#61afef" },
      { pairIndex: 1, characters: 1, color: "#c678dd" }
    ];
    const slices = computePieSlices(3, 1, pairs);
    expect(slices.length).toBe(3);
    expect(slices[0].startAngle).toBeCloseTo(0);
    expect(slices[0].endAngle).toBeCloseTo((1 / 3) * 2 * Math.PI);
    expect(slices[1].startAngle).toBeCloseTo((1 / 3) * 2 * Math.PI);
    expect(slices[1].endAngle).toBeCloseTo((2 / 3) * 2 * Math.PI);
    expect(slices[2].startAngle).toBeCloseTo((2 / 3) * 2 * Math.PI);
    expect(slices[2].endAngle).toBeCloseTo(2 * Math.PI);
  });

  it("omits slices for zero-count pairs", () => {
    const pairs = [
      { pairIndex: 0, characters: 200, color: "#61afef" },
      { pairIndex: 1, characters: 0, color: "#c678dd" }
    ];
    const slices = computePieSlices(1000, 800, pairs);
    expect(slices.length).toBe(2);
    expect(slices.some((s) => s.key === "pair-1")).toBe(false);
  });

  it("returns empty array for totalCharacters = 0", () => {
    expect(computePieSlices(0, 0, [])).toEqual([]);
    expect(computePieSlices(-5, 0, [])).toEqual([]);
    expect(computePieSlices(Number.NaN, 0, [])).toEqual([]);
  });

  it("never produces NaN / negative angles", () => {
    const pairs = [
      { pairIndex: 0, characters: 100, color: "#61afef" }
    ];
    const slices = computePieSlices(500, 400, pairs);
    for (const slice of slices) {
      expect(Number.isFinite(slice.startAngle)).toBe(true);
      expect(Number.isFinite(slice.endAngle)).toBe(true);
      expect(slice.startAngle).toBeGreaterThanOrEqual(0);
      expect(slice.endAngle).toBeGreaterThanOrEqual(slice.startAngle);
    }
  });

  it("clamps angles according to animationProgress", () => {
    const pairs = [
      { pairIndex: 0, characters: 500, color: "#61afef" }
    ];
    // Narration 500 (0 to π), Pair 0 500 (π to 2π)
    // Progress 0.25 -> maxAngle = 0.5π
    const p25 = computePieSlices(1000, 500, pairs, 0.25);
    expect(p25.length).toBe(1);
    expect(p25[0].key).toBe("narration");
    expect(p25[0].endAngle).toBeCloseTo(0.5 * Math.PI);

    // Progress 0.75 -> maxAngle = 1.5π
    const p75 = computePieSlices(1000, 500, pairs, 0.75);
    expect(p75.length).toBe(2);
    expect(p75[0].endAngle).toBeCloseTo(Math.PI);
    expect(p75[1].startAngle).toBeCloseTo(Math.PI);
    expect(p75[1].endAngle).toBeCloseTo(1.5 * Math.PI);

    // Progress 0 -> empty
    expect(computePieSlices(1000, 500, pairs, 0)).toEqual([]);
  });
});

describe("DocumentDialogueRatioPieChart SVG rendering (#396)", () => {
  function markup(
    props: Partial<
      React.ComponentProps<typeof DocumentDialogueRatioPieChart>
    >
  ): string {
    return renderToStaticMarkup(
      React.createElement(DocumentDialogueRatioPieChart, {
        narrationPercent: 62,
        dialoguePercent: 38,
        totalCharacters: 1000,
        narrationCharacters: 620,
        ariaLabel: "narration 62% / dialogue 38%",
        ...props
      })
    );
  }

  it("renders a standard SVG pie chart with role=img and aria-label", () => {
    const html = markup({});
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="narration 62% / dialogue 38%"');
    expect(html).toContain("documentMetricsDialoguePie");
    expect(html).toContain("documentMetricsDialoguePieTrack");
    expect(html).toContain("documentMetricsDialoguePieSector");
    expect(html).not.toContain('data-empty="true"');
  });

  it("renders an outline-only track circle for an empty document", () => {
    const html = markup({
      narrationPercent: 0,
      dialoguePercent: 0,
      totalCharacters: 0,
      narrationCharacters: 0
    });
    expect(html).toContain('data-empty="true"');
    expect(html).toContain("documentMetricsDialoguePieTrack");
    expect(html).not.toContain("documentMetricsDialoguePieSector");
  });

  it("renders multi-pair breakdown with individual pair colors and no aggregate slice", () => {
    const html = markup({
      totalCharacters: 1000,
      narrationCharacters: 600,
      narrationPercent: 60,
      pairs: [
        { pairIndex: 0, characters: 250, percent: 25, color: "#61afef" },
        { pairIndex: 1, characters: 150, percent: 15, color: "#c678dd" }
      ],
      ariaLabel: "Narration 60% / Pair 0 25% / Pair 1 15%"
    });

    expect(html).toContain("documentMetricsDialoguePieNarration");
    // Pair 0 rendered with fill
    expect(html).toContain('fill="#61afef"');
    // Pair 1 rendered with fill
    expect(html).toContain('fill="#c678dd"');
    // Sector paths drawn
    expect(html).toContain("<path");
    // No aggregate dialogue slice
    expect(html).not.toContain("documentMetricsDialoguePieDialogue");
  });

  it("renders full circle for narration-only text", () => {
    const html = markup({
      totalCharacters: 1000,
      narrationCharacters: 1000,
      narrationPercent: 100,
      pairs: []
    });

    expect(html).toContain("documentMetricsDialoguePieNarration");
    // Full circle is rendered as a <circle>
    expect(html).toMatch(/<circle[^>]*class="[^"]*documentMetricsDialoguePieNarration/);
    expect(html).not.toContain("documentMetricsDialoguePiePair");
  });

  it("renders full circle for 100% single pair dialogue", () => {
    const html = markup({
      totalCharacters: 1000,
      narrationCharacters: 0,
      narrationPercent: 0,
      pairs: [
        { pairIndex: 0, characters: 1000, percent: 100, color: "#61afef" }
      ]
    });

    expect(html).toContain('fill="#61afef"');
    expect(html).toMatch(/<circle[^>]*fill="#61afef"/);
  });

  it("omits sector for zero-count pair in multi-pair breakdown", () => {
    const html = markup({
      totalCharacters: 1000,
      narrationCharacters: 800,
      narrationPercent: 80,
      pairs: [
        { pairIndex: 0, characters: 200, percent: 20, color: "#61afef" },
        { pairIndex: 1, characters: 0, percent: 0, color: "#c678dd" }
      ]
    });

    expect(html).toContain('fill="#61afef"');
    expect(html).not.toContain('fill="#c678dd"');
  });

  it("includes animation attributes when animationKey is provided", () => {
    const html = markup({ animationKey: 2 });
    expect(html).toContain('data-revealing="true"');
    expect(html).toContain("documentMetricsDialoguePieMask");
  });
});
