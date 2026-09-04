import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Translate } from "../../src/shared/i18n";
import {
  DocumentNavigationPanel,
  type DocumentNavigationFileInfo
} from "../../src/renderer/DocumentNavigationPanel";
import type { DocumentNavigationAnalysis } from "../../src/renderer/documentNavigationAnalysis";

const translate: Translate = (key) => key;

const emptyAnalysis: DocumentNavigationAnalysis = {
  glossaryCounts: [],
  tagCounts: [],
  dialogueRatio: {
    narrationCharacters: 0,
    dialogueCharacters: 0,
    totalCharacters: 0,
    narrationPercent: 0,
    dialoguePercent: 0
  }
};

function render(
  props: Partial<React.ComponentProps<typeof DocumentNavigationPanel>>
): string {
  return renderToStaticMarkup(
    React.createElement(DocumentNavigationPanel, {
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

describe("DocumentNavigationPanel (#360 Phase 1 polish)", () => {
  it("shows the no-active-document empty state", () => {
    const markup = render({
      hasActiveDocument: false,
      activeEditorIsMarkdown: false,
      characterCount: null
    });

    expect(markup).toContain("documentNavigation.empty.noActiveDocument");
    expect(markup).not.toContain("documentNavigation.sections.statistics");
  });

  it("shows the unsupported-document empty state for a non-Markdown editor", () => {
    const markup = render({
      hasActiveDocument: true,
      activeEditorIsMarkdown: false,
      characterCount: null
    });

    expect(markup).toContain("documentNavigation.empty.unsupportedDocument");
    expect(markup).not.toContain("documentNavigation.sections.statistics");
  });

  it("renders the host-provided character count verbatim (unified with the status bar)", () => {
    const markup = render({
      characterCount: 976,
      fileInfo: { kind: "unsaved" }
    });

    expect(markup).toContain("documentNavigation.sections.statistics");
    expect(markup).toContain("documentNavigation.metrics.characters");
    expect(markup).toContain("976");
    // ceil(976 / 400) = 3
    expect(markup).toContain("documentNavigation.metrics.aboutPages");
  });

  it("shows 0 (not an 'about N pages' phrase) when the count is 0", () => {
    const markup = render({ characterCount: 0 });

    expect(markup).toContain("documentNavigation.metrics.characters");
    expect(markup).not.toContain("documentNavigation.metrics.aboutPages");
    expect(markup).toMatch(/documentNavigationMetricValue">0</);
  });

  it("shows dashes while the shared count has not resolved yet", () => {
    const markup = render({ characterCount: null });

    expect(markup).toContain("documentNavigation.sections.statistics");
    expect(markup).not.toContain("documentNavigation.metrics.aboutPages");
    expect(markup).toContain("documentNavigationMetricValue\">-<");
  });

  it("shows only a last-modified row in the file-info section — never a created row", () => {
    const fileInfo: DocumentNavigationFileInfo = {
      kind: "timestamps",
      modifiedAtIso: "2026-05-30T00:04:17.000Z"
    };
    const markup = render({ characterCount: 10, fileInfo });

    expect(markup).toContain("documentNavigation.fileInfo.lastModified");
    expect(markup).not.toContain("documentNavigation.fileInfo.created");
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

    expect(markup).toContain("documentNavigation.fileInfo.unsavedDocument");
    expect(markup).not.toContain("documentNavigation.fileInfo.lastModified");
  });

  it("dashes the last-modified value and notes the failure when file info is unavailable", () => {
    const markup = render({
      characterCount: 5,
      fileInfo: { kind: "unavailable" }
    });

    expect(markup).toContain("documentNavigation.fileInfo.lastModified");
    expect(markup).toContain("documentNavigation.fileInfo.unavailable");
    expect(markup).toContain("documentNavigationMetricValue\">-<");
  });

  it("renders a null modified timestamp as a dash", () => {
    const markup = render({
      characterCount: 5,
      fileInfo: { kind: "timestamps", modifiedAtIso: null }
    });

    expect(markup).toContain("documentNavigation.fileInfo.lastModified");
    expect(markup).toContain("documentNavigationMetricValue\">-<");
  });
});

describe("DocumentNavigationPanel Phase 2 sections (#360)", () => {
  it("renders section headers but no rows while the analysis is still pending", () => {
    const markup = render({ characterCount: 10, analysis: null });

    expect(markup).toContain("documentNavigation.sections.glossaryCounts");
    expect(markup).toContain("documentNavigation.sections.tagCounts");
    expect(markup).toContain("documentNavigation.sections.dialogueRatio");
    // No empty-state text (that would misleadingly say "no terms" during the
    // debounce), no table, no dialogue rows.
    expect(markup).not.toContain("documentNavigation.empty.noGlossaryTerms");
    expect(markup).not.toContain("documentNavigationCountsTable");
    expect(markup).not.toContain("documentNavigation.dialogue.narration");
  });

  it("shows the glossary / tag empty states when the analysis resolved with no hits", () => {
    const markup = render({ characterCount: 10, analysis: emptyAnalysis });

    expect(markup).toContain("documentNavigation.empty.noGlossaryTerms");
    expect(markup).toContain("documentNavigation.empty.noTaggedTerms");
    expect(markup).not.toContain("documentNavigationCountsTable");
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

    expect(markup).toContain("documentNavigation.tables.term");
    expect(markup).toContain("documentNavigation.tables.count");
    expect(markup).toContain("documentNavigationCountsTable");
    expect(markup).toContain("documentNavigationCountsLabelText");
    expect(markup).toContain('title="山田太郎"');
    expect(markup).toContain("山田太郎");
    expect(markup).toContain("8");
    expect(markup).not.toContain("documentNavigation.empty.noGlossaryTerms");
    // #360 polish: glossary rows stay plain text — no tag chip here.
    expect(markup).not.toMatch(
      /documentNavigationCountsLabel[^>]*>\s*<span class="glossaryTagChip"/
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

    expect(markup).toContain("documentNavigation.tagCounts.description");
    expect(markup).toContain("documentNavigation.tables.tag");
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

  it("renders the narration / dialogue split right-aligned, with a donut chart and approximate note", () => {
    const markup = render({
      characterCount: 12_500,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 7800,
          dialogueCharacters: 4700,
          totalCharacters: 12_500,
          narrationPercent: 62,
          dialoguePercent: 38
        }
      }
    });

    expect(markup).toContain("documentNavigation.dialogue.narration");
    expect(markup).toContain("documentNavigation.dialogue.dialogue");
    expect(markup).toContain("documentNavigation.dialogue.charsWithPercent");
    expect(markup).toContain("documentNavigation.dialogue.approximate");
    // #360 polish: value cell is a dedicated right-aligned / tabular-nums cell.
    expect(markup).toContain("documentNavigationDialogueRatioRow");
    expect(markup).toContain("documentNavigationDialogueRatioValue");
    // #360 polish: the horizontal ratio bar is replaced by an SVG donut.
    expect(markup).not.toContain("documentNavigationRatioBar");
    expect(markup).toContain("documentNavigationDialoguePie");
    expect(markup).toContain("documentNavigationDialoguePieNarration");
    expect(markup).toContain('stroke-dasharray="62 38"');
    // Row swatches key each row to a pie slice.
    expect(markup).toContain('data-series="narration"');
    expect(markup).toContain('data-series="dialogue"');
  });

  it("still shows a 0 / 0% dialogue split (empty outline donut) for an empty analysis", () => {
    const markup = render({ characterCount: 0, analysis: emptyAnalysis });

    expect(markup).toContain("documentNavigation.dialogue.narration");
    expect(markup).toContain("documentNavigation.dialogue.charsWithPercent");
    expect(markup).toContain('data-empty="true"');
    // The coloured slices are not drawn for an empty document.
    expect(markup).not.toContain("documentNavigationDialoguePieNarration");
  });

  it("renders a full narration donut when there is no dialogue", () => {
    const markup = render({
      characterCount: 1000,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 1000,
          dialogueCharacters: 0,
          totalCharacters: 1000,
          narrationPercent: 100,
          dialoguePercent: 0
        }
      }
    });

    expect(markup).toContain("documentNavigationDialoguePieNarration");
    expect(markup).toContain('stroke-dasharray="100 0"');
    expect(markup).not.toContain('data-empty="true"');
  });

  it("renders a full dialogue donut (narration arc of 0) when it is all dialogue", () => {
    const markup = render({
      characterCount: 1000,
      analysis: {
        ...emptyAnalysis,
        dialogueRatio: {
          narrationCharacters: 0,
          dialogueCharacters: 1000,
          totalCharacters: 1000,
          narrationPercent: 0,
          dialoguePercent: 100
        }
      }
    });

    expect(markup).toContain("documentNavigationDialoguePieDialogue");
    expect(markup).toContain('stroke-dasharray="0 100"');
    expect(markup).not.toContain('data-empty="true"');
  });
});
