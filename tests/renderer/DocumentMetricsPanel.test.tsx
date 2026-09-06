import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import {
  DocumentMetricsPanel,
  type DocumentMetricsFileInfo
} from "../../src/renderer/DocumentMetricsPanel";
import type { DocumentMetricsAnalysis } from "../../src/renderer/documentMetricsAnalysis";

const translate: Translate = (key) => key;

const emptyAnalysis: DocumentMetricsAnalysis = {
  glossaryCounts: [],
  tagCounts: [],
  dialogueRatio: {
    narrationCharacters: 0,
    pairs: [],
    totalCharacters: 0,
    narrationPercent: 0,
    dialogueCharacters: 0,
    dialoguePercent: 0
  }
};

function render(
  props: Partial<React.ComponentProps<typeof DocumentMetricsPanel>>
): string {
  return renderToStaticMarkup(
    React.createElement(DocumentMetricsPanel, {
      translate,
      hasActiveDocument: true,
      activeEditorIsMarkdown: true,
      characterCount: 0,
      analysis: null,
      fileInfo: null,
      ...props
    })
  );
}

describe("DocumentMetricsPanel (#360 Phase 1 polish)", () => {
  it("shows the no-active-document empty state", () => {
    const markup = render({
      hasActiveDocument: false,
      activeEditorIsMarkdown: false,
      characterCount: null
    });

    expect(markup).toContain("documentMetrics.empty.noActiveDocument");
    expect(markup).not.toContain("documentMetrics.sections.statistics");
  });

  it("shows the unsupported-document empty state for a non-Markdown editor", () => {
    const markup = render({
      hasActiveDocument: true,
      activeEditorIsMarkdown: false,
      characterCount: null
    });

    expect(markup).toContain("documentMetrics.empty.unsupportedDocument");
    expect(markup).not.toContain("documentMetrics.sections.statistics");
  });

  it("renders the host-provided character count verbatim (unified with the status bar)", () => {
    const markup = render({
      characterCount: 976,
      fileInfo: { kind: "unsaved" }
    });

    expect(markup).toContain("documentMetrics.sections.statistics");
    expect(markup).toContain("documentMetrics.metrics.characters");
    expect(markup).toContain("976");
    // ceil(976 / 400) = 3
    expect(markup).toContain("documentMetrics.metrics.aboutPages");
  });

  it("shows 0 (not an 'about N pages' phrase) when the count is 0", () => {
    const markup = render({ characterCount: 0 });

    expect(markup).toContain("documentMetrics.metrics.characters");
    expect(markup).not.toContain("documentMetrics.metrics.aboutPages");
    expect(markup).toMatch(/documentMetricsMetricValue">0</);
  });

  it("shows dashes while the shared count has not resolved yet", () => {
    const markup = render({ characterCount: null });

    expect(markup).toContain("documentMetrics.sections.statistics");
    expect(markup).not.toContain("documentMetrics.metrics.aboutPages");
    expect(markup).toContain("documentMetricsMetricValue\">-<");
  });

  it("shows only a last-modified row in the file-info section — never a created row", () => {
    const fileInfo: DocumentMetricsFileInfo = {
      kind: "timestamps",
      modifiedAtIso: "2026-05-30T00:04:17.000Z"
    };
    const markup = render({ characterCount: 10, fileInfo });

    expect(markup).toContain("documentMetrics.fileInfo.lastModified");
    expect(markup).not.toContain("documentMetrics.fileInfo.created");
    const modifiedValue = new Date(
      "2026-05-30T00:04:17.000Z"
    ).toLocaleString();
    expect(markup).toContain(modifiedValue);
  });

  it("labels an untitled document as unsaved with no timestamp row", () => {
    const markup = render({
      characterCount: 5,
      fileInfo: { kind: "unsaved" }
    });

    expect(markup).toContain("documentMetrics.fileInfo.unsavedDocument");
    expect(markup).not.toContain("documentMetrics.fileInfo.lastModified");
  });

  it("dashes the last-modified value and notes the failure when file info is unavailable", () => {
    const markup = render({
      characterCount: 5,
      fileInfo: { kind: "unavailable" }
    });

    expect(markup).toContain("documentMetrics.fileInfo.lastModified");
    expect(markup).toContain("documentMetrics.fileInfo.unavailable");
    expect(markup).toContain("documentMetricsMetricValue\">-<");
  });

  it("renders a null modified timestamp as a dash", () => {
    const markup = render({
      characterCount: 5,
      fileInfo: { kind: "timestamps", modifiedAtIso: null }
    });

    expect(markup).toContain("documentMetrics.fileInfo.lastModified");
    expect(markup).toContain("documentMetricsMetricValue\">-<");
  });
});

describe("DocumentMetricsPanel Phase 2 sections (#360)", () => {
  it("renders section headers but no rows while the analysis is still pending", () => {
    const markup = render({ characterCount: 10, analysis: null });

    expect(markup).toContain("documentMetrics.sections.glossaryCounts");
    expect(markup).toContain("documentMetrics.sections.tagCounts");
    expect(markup).toContain("documentMetrics.sections.dialogueRatio");
    // No empty-state text (that would misleadingly say "no terms" during the
    // debounce), no table, no dialogue rows.
    expect(markup).not.toContain("documentMetrics.empty.noGlossaryTerms");
    expect(markup).not.toContain("documentMetricsCountsTable");
    expect(markup).not.toContain("documentMetrics.dialogue.narration");
  });

  it("shows the glossary / tag empty states when the analysis resolved with no hits", () => {
    const markup = render({ characterCount: 10, analysis: emptyAnalysis });

    expect(markup).toContain("documentMetrics.empty.noGlossaryTerms");
    expect(markup).toContain("documentMetrics.empty.noTaggedTerms");
    expect(markup).not.toContain("documentMetricsCountsTable");
  });

  it("renders the glossary counts table with count and an ellipsised, title-tooltipped label", () => {
    const markup = render({
      characterCount: 100,
      analysis: {
        ...emptyAnalysis,
        glossaryCounts: [
          { entryId: "e1", label: "山田太郎", count: 8 },
          { entryId: "e2", label: "花子", count: 3 }
        ]
      }
    });

    expect(markup).toContain("documentMetrics.tables.term");
    expect(markup).toContain("documentMetrics.tables.count");
    expect(markup).toContain("documentMetricsCountsTable");
    expect(markup).toContain("documentMetricsCountsLabelText");
    expect(markup).toContain('title="山田太郎"');
    expect(markup).toContain("山田太郎");
    expect(markup).toContain("8");
    expect(markup).not.toContain("documentMetrics.empty.noGlossaryTerms");
    // #360 polish: glossary rows stay plain text — no tag chip here.
    expect(markup).not.toMatch(
      /documentMetricsCountsLabel[^>]*>\s*<span class="glossaryTagChip"/
    );
  });

  it("renders each tag as a colored, compact GlossaryTagChip (stored colors, no correction)", () => {
    const markup = render({
      characterCount: 100,
      analysis: {
        ...emptyAnalysis,
        tagCounts: [
          {
            tagId: "t1",
            label: "コアメンバー",
            backgroundRgb: "#8e44ad",
            foregroundRgb: "#ffffff",
            count: 78
          }
        ]
      }
    });

    expect(markup).toContain("documentMetrics.tagCounts.description");
    expect(markup).toContain("documentMetrics.tables.tag");
    expect(markup).toContain("glossaryTagChip");
    expect(markup).toContain('data-compact="true"');
    expect(markup).toContain("background-color:#8e44ad");
    expect(markup).toContain("color:#ffffff");
    expect(markup).toContain('title="コアメンバー"');
    expect(markup).toContain("78");
  });

  it("keeps a very long tag label from breaking the layout (chip ellipsis + title)", () => {
    const longLabel = "あ".repeat(80);
    const markup = render({
      characterCount: 100,
      analysis: {
        ...emptyAnalysis,
        tagCounts: [
          {
            tagId: "t-long",
            label: longLabel,
            backgroundRgb: "#123456",
            foregroundRgb: "#ffffff",
            count: 1
          }
        ]
      }
    });

    // The chip carries the full label as a tooltip; CSS (.glossaryTagChip)
    // clips the visible text with an ellipsis.
    expect(markup).toContain(`title="${longLabel}"`);
    expect(markup).toContain("glossaryTagChip");
  });

  it("renders the narration / dialogue pair breakdown with pie chart and no aggregate dialogue row", () => {
    const markup = render({
      characterCount: 12_500,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 7800,
          pairs: [
            {
              pairIndex: 0,
              open: "「",
              close: "」",
              color: "#61afef",
              characters: 3700,
              percent: 30
            },
            {
              pairIndex: 1,
              open: "『",
              close: "』",
              color: "#c678dd",
              characters: 1000,
              percent: 8
            }
          ],
          dialogueCharacters: 4700,
          totalCharacters: 12_500,
          narrationPercent: 62,
          dialoguePercent: 38
        }
      }
    });

    expect(markup).toContain("documentMetrics.dialogue.narration");
    // Pair label is used, NOT generic "documentMetrics.dialogue.dialogue" aggregate row
    expect(markup).toContain("documentMetrics.dialogue.pairLabel");
    expect(markup).toContain("documentMetrics.dialogue.charsWithPercent");
    expect(markup).toContain("documentMetrics.dialogue.approximate");
    // Value cells
    expect(markup).toContain("documentMetricsDialogueRatioRow");
    expect(markup).toContain("documentMetricsDialogueRatioValue");
    // Chart selector with pie and bar buttons
    expect(markup).toContain("documentMetricsChartSelector");
    expect(markup).toContain("feather-pie-chart");
    expect(markup).toContain("feather-bar-chart");
    expect(markup).toContain('title="documentMetrics.chart.pieChart"');
    expect(markup).toContain('title="documentMetrics.chart.barChart"');
    // Pie chart
    expect(markup).toContain("documentMetricsDialoguePie");
    expect(markup).toContain("documentMetricsDialoguePieNarration");
    // Pair slices rendered with pair colors
    expect(markup).toContain('fill="#61afef"');
    expect(markup).toContain('fill="#c678dd"');
    // Row swatches key each row to a pie slice, with pair colors
    expect(markup).toContain('data-series="narration"');
    expect(markup).toContain('data-series="dialogue"');
    expect(markup).toContain("background-color:#61afef");
    expect(markup).toContain("background-color:#c678dd");
    // Text colored in pair color
    expect(markup).toContain("color:#61afef");
    expect(markup).toContain("color:#c678dd");
  });

  it("renders a 0-count pair with 0 characters / 0% in the table", () => {
    const markup = render({
      characterCount: 1000,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 1000,
          pairs: [
            {
              pairIndex: 0,
              open: "「",
              close: "」",
              color: "#61afef",
              characters: 0,
              percent: 0
            }
          ],
          dialogueCharacters: 0,
          totalCharacters: 1000,
          narrationPercent: 100,
          dialoguePercent: 0
        }
      }
    });

    expect(markup).toContain("documentMetrics.dialogue.pairLabel");
    expect(markup).toContain("documentMetrics.dialogue.charsWithPercent");
  });

  it("renders only narration row (100%) when pairs is empty array []", () => {
    const markup = render({
      characterCount: 1000,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 1000,
          pairs: [],
          dialogueCharacters: 0,
          totalCharacters: 1000,
          narrationPercent: 100,
          dialoguePercent: 0
        }
      }
    });

    expect(markup).toContain("documentMetrics.dialogue.narration");
    expect(markup).not.toContain("documentMetrics.dialogue.pairLabel");
    expect(markup).not.toContain("documentMetricsDialoguePiePair");
  });

  it("still shows an empty outline donut for an empty analysis", () => {
    const markup = render({ characterCount: 0, analysis: emptyAnalysis });

    expect(markup).toContain("documentMetrics.dialogue.narration");
    expect(markup).toContain("documentMetrics.dialogue.charsWithPercent");
    expect(markup).toContain('data-empty="true"');
    // The coloured slices are not drawn for an empty document.
    expect(markup).not.toContain("documentMetricsDialoguePieNarration");
  });
});
