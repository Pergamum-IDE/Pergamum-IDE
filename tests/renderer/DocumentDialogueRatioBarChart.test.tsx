import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentDialogueRatioBarChart } from "../../src/renderer/DocumentDialogueRatioBarChart";
import { t } from "../../src/shared/i18n";

function render(
  props: Partial<React.ComponentProps<typeof DocumentDialogueRatioBarChart>>
): string {
  return renderToStaticMarkup(
    React.createElement(DocumentDialogueRatioBarChart, {
      narrationCharacters: 8200,
      narrationLabel: "地の文",
      pairs: [
        {
          pairIndex: 0,
          label: t("ja", "documentMetrics.dialogue.pairLabel", {
            open: "「",
            close: "」"
          }),
          open: "「",
          close: "」",
          color: "#61afef",
          characters: 2700,
          percent: 22
        },
        {
          pairIndex: 1,
          label: t("ja", "documentMetrics.dialogue.pairLabel", {
            open: "『",
            close: "』"
          }),
          open: "『",
          close: "』",
          color: "#c678dd",
          characters: 800,
          percent: 7
        },
        {
          pairIndex: 2,
          label: t("ja", "documentMetrics.dialogue.pairLabel", {
            open: "“",
            close: "”"
          }),
          open: "“",
          close: "”",
          color: "#98c379",
          characters: 300,
          percent: 3
        }
      ],
      ariaLabel: "Narration / dialogue breakdown",
      ...props
    })
  );
}

describe("DocumentDialogueRatioBarChart (#396)", () => {
  it("renders horizontal bar rows for narration and each pair with absolute character counts", () => {
    const html = render({});
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Narration / dialogue breakdown"');
    expect(html).toContain("documentMetricsDialogueBar");

    // Narration row
    expect(html).toContain("地の文");
    expect(html).toContain("8,200");
    expect(html).toContain("documentMetricsBarFill--narration");

    // Pair rows with delimiter labels and absolute counts
    expect(html).toContain("会話文 「 ～ 」");
    expect(html).toContain("2,700");
    expect(html).toContain("会話文 『 ～ 』");
    expect(html).toContain("800");
    expect(html).toContain("会話文 “ ～ ”");
    expect(html).toContain("300");

    // Colors
    expect(html).toContain("background-color:#61afef");
    expect(html).toContain("background-color:#c678dd");
    expect(html).toContain("background-color:#98c379");
    expect(html).toContain("color:#61afef");
    expect(html).toContain("color:#c678dd");
    expect(html).toContain("color:#98c379");

    // No aggregate dialogue row
    expect(html).not.toContain("会話文 合計");
    expect(html).not.toContain("Dialogue total");
  });

  it("renders localized pair labels in English without hard-coded Japanese separator", () => {
    const html = render({
      narrationLabel: "Narration",
      pairs: [
        {
          pairIndex: 0,
          label: t("en", "documentMetrics.dialogue.pairLabel", {
            open: '"',
            close: '"'
          }),
          open: '"',
          close: '"',
          color: "#61afef",
          characters: 2700
        },
        {
          pairIndex: 1,
          label: t("en", "documentMetrics.dialogue.pairLabel", {
            open: "'",
            close: "'"
          }),
          open: "'",
          close: "'",
          color: "#c678dd",
          characters: 800
        }
      ]
    });

    expect(html).toContain("Narration");
    expect(html).toContain("Dialogue &quot; ... &quot;");
    expect(html).toContain("Dialogue &#x27; ... &#x27;");
    expect(html).not.toContain("～");
  });

  it("scales bar widths relative to maxCount", () => {
    // maxCount is 8200
    // narration: 8200 / 8200 = 100%
    // pair 0: 2700 / 8200 ≈ 32.9268%
    const html = render({});
    expect(html).toContain("--bar-width:100%");
    expect(html).toContain(`--bar-width:${(2700 / 8200) * 100}%`);
  });

  it("renders only narration row when pairs is empty array", () => {
    const html = render({
      narrationCharacters: 1500,
      pairs: []
    });
    expect(html).toContain("地の文");
    expect(html).toContain("1,500");
    expect(html).toContain("--bar-width:100%");
    expect(html).not.toContain("会話文");
  });

  it("renders a zero-count pair with width 0% and count 0", () => {
    const html = render({
      narrationCharacters: 500,
      pairs: [
        {
          pairIndex: 0,
          label: t("ja", "documentMetrics.dialogue.pairLabel", {
            open: "「",
            close: "」"
          }),
          open: "「",
          close: "」",
          color: "#61afef",
          characters: 0
        }
      ]
    });
    expect(html).toContain("会話文 「 ～ 」");
    expect(html).toContain(">0<");
    expect(html).toContain("--bar-width:0%");
  });

  it("preserves pair ordering from props", () => {
    const html = render({
      narrationCharacters: 100,
      pairs: [
        { pairIndex: 0, label: "Pair A", open: "A", close: "A", color: "#111", characters: 50 },
        { pairIndex: 1, label: "Pair B", open: "B", close: "B", color: "#222", characters: 200 }
      ]
    });
    const posA = html.indexOf("Pair A");
    const posB = html.indexOf("Pair B");
    expect(posA).toBeGreaterThan(-1);
    expect(posB).toBeGreaterThan(-1);
    expect(posA).toBeLessThan(posB);
  });

  it("protects against long delimiter labels with title attribute", () => {
    const longLabel = "会話文 <<<<<<<<<VERY_LONG_OPEN>>>>>>>>> ～ <<<<<<<<<VERY_LONG_CLOSE>>>>>>>>>";
    const html = render({
      narrationCharacters: 100,
      pairs: [
        {
          pairIndex: 0,
          label: longLabel,
          open: "<<<<<<<<<VERY_LONG_OPEN>>>>>>>>>",
          close: "<<<<<<<<<VERY_LONG_CLOSE>>>>>>>>>",
          color: "#61afef",
          characters: 50
        }
      ]
    });
    expect(html).toContain('title="会話文 &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;VERY_LONG_OPEN&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt; ～ &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;VERY_LONG_CLOSE&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;&gt;"');
  });

  it("renders empty data state when total count is 0", () => {
    const html = render({
      narrationCharacters: 0,
      pairs: []
    });
    expect(html).toContain('data-empty="true"');
    expect(html).toContain("--bar-width:0%");
  });

  it("applies animationKey to data-revealing attribute", () => {
    const html = render({ animationKey: 3 });
    expect(html).toContain('data-revealing="true"');
  });
});
