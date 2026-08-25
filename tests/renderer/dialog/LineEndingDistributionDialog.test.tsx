import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t, type Translate } from "../../../src/shared/i18n";
import { LineEndingDistributionDialog } from "../../../src/renderer/dialog/LineEndingDistributionDialog";
import { computeLineEndingDistribution } from "../../../src/renderer/lineEndingDistribution";
import { buildLineEndingBreakSet } from "../../../src/renderer/editorLineEndingField";
import { analyzeLineEndings } from "../../../src/renderer/lineEndingTracking";

const translateEn: Translate = (key, values) => t("en", key, values);
const noop = () => undefined;

function renderDialog(raw: string, expectedKind: "lf" | "crlf" | "cr" = "lf") {
  const distribution = computeLineEndingDistribution(
    buildLineEndingBreakSet(analyzeLineEndings(raw)),
    expectedKind
  );

  return renderToStaticMarkup(
    React.createElement(LineEndingDistributionDialog, {
      distribution,
      translate: translateEn,
      opener: null,
      onClose: noop
    })
  );
}

describe("LineEndingDistributionDialog (#252)", () => {
  it("is built on InfoDialog, not ConfirmDialog/ChoiceDialog", () => {
    const markup = renderDialog("a\r\nb\nc");

    expect(markup).toContain("appInfoDialog");
    expect(markup).toContain("Line Ending Distribution");
  });

  it("renders LF/CRLF/CR rows with count and percentage, a bar per row, total, expected, and unexpected count", () => {
    const markup = renderDialog("a\r\nb\r\nc\nd\re", "crlf");

    expect(markup).toContain("lineEndingDistributionRow");
    expect(markup).toContain("lineEndingDistributionBarFill");
    expect(markup).toMatch(/LF[\s\S]*1[\s\S]*\(25\.0%\)/);
    expect(markup).toMatch(/CRLF[\s\S]*2[\s\S]*\(50\.0%\)/);
    expect(markup).toMatch(/CR[\s\S]*1[\s\S]*\(25\.0%\)/);
    expect(markup).toContain("Total line breaks");
    expect(markup).toContain(">4<");
    expect(markup).toContain("Expected line ending");
    expect(markup).toContain("Unexpected line endings");
  });

  it("shows the empty-document message and no rows when there are no breaks", () => {
    const markup = renderDialog("no newline here");

    expect(markup).toContain("This document has no line breaks yet.");
    expect(markup).not.toContain("lineEndingDistributionRow\"");
  });

  it("has a single Close button and does not offer any content-mutating action", () => {
    const markup = renderDialog("a\nb");

    expect(markup).toContain("appDialogButton-confirm");
    expect(markup).toContain(">Close<");
    expect(markup).not.toContain("appDialogButton-cancel");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("<input");
  });

  it("renders in Japanese via the same translate function", () => {
    const translateJa: Translate = (key, values) => t("ja", key, values);
    const distribution = computeLineEndingDistribution(
      buildLineEndingBreakSet(analyzeLineEndings("a\r\nb")),
      "lf"
    );
    const markup = renderToStaticMarkup(
      React.createElement(LineEndingDistributionDialog, {
        distribution,
        translate: translateJa,
        opener: null,
        onClose: noop
      })
    );

    expect(markup).toContain("改行コード分布");
  });
});

function cssRuleBlock(styles: string, selector: string): string {
  const start = styles.indexOf(`${selector} {`);

  expect(start).toBeGreaterThan(-1);

  const end = styles.indexOf("}", start);

  expect(end).toBeGreaterThan(start);

  return styles.slice(start, end + 1);
}

describe("LineEndingDistributionDialog bar-chart column alignment (#252 follow-up)", () => {
  it("puts the 3-column grid on the shared rows container, not per row, so label/bar/value columns are sized once across all three rows", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const rowsRule = cssRuleBlock(styles, ".lineEndingDistributionRows");

    expect(rowsRule).toContain("display: grid");
    expect(rowsRule).toContain(
      "grid-template-columns: max-content minmax(0, 1fr) max-content"
    );
  });

  it("makes each row a display:contents wrapper so its label/bar/value become direct items of the shared grid", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const rowRule = cssRuleBlock(styles, ".lineEndingDistributionRow");
    const ddRule = cssRuleBlock(styles, ".lineEndingDistributionRow dd");

    expect(rowRule).toContain("display: contents");
    expect(ddRule).toContain("display: contents");
  });

  it("does not size the bar track or value from a per-row flex layout anymore (no leftover flex sizing that would vary the bar's width by label/value text length)", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const barTrackRule = cssRuleBlock(
      styles,
      ".lineEndingDistributionBarTrack"
    );
    const valueRule = cssRuleBlock(styles, ".lineEndingDistributionRowValue");

    expect(barTrackRule).not.toContain("flex:");
    expect(valueRule).not.toContain("flex:");
  });

  it("keeps the bar fill's width driven only by the percentage (unchanged aggregation/percentage logic)", () => {
    const source = readFileSync(
      "src/renderer/dialog/LineEndingDistributionDialog.tsx",
      "utf8"
    );

    expect(source).toContain(
      "style={{ width: `${distribution.percentages[kind]}%` }}"
    );
  });
});
