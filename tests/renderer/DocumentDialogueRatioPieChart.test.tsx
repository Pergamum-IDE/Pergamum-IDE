import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DocumentDialogueRatioPieChart,
  dialogueRatioPieModel
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

describe("DocumentDialogueRatioPieChart (#360 polish)", () => {
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
        ariaLabel: "narration 62% / dialogue 38%",
        ...props
      })
    );
  }

  it("draws the narration arc sized to the percent, over a full dialogue ring", () => {
    const html = markup({});
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="narration 62% / dialogue 38%"');
    expect(html).toContain("documentMetricsDialoguePieDialogue");
    expect(html).toContain("documentMetricsDialoguePieNarration");
    expect(html).toContain('stroke-dasharray="62 38"');
    expect(html).not.toContain('data-empty="true"');
  });

  it("renders an outline-only track for an empty document", () => {
    const html = markup({
      narrationPercent: 0,
      dialoguePercent: 0,
      totalCharacters: 0
    });
    expect(html).toContain('data-empty="true"');
    expect(html).toContain("documentMetricsDialoguePieTrack");
    expect(html).not.toContain("documentMetricsDialoguePieNarration");
    expect(html).not.toContain("documentMetricsDialoguePieDialogue");
  });
});
