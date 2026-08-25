import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Assist / Line Ending Distribution command wiring (#252)", () => {
  it("routes assist.lineEndingDistribution.show through the App command registry into the dialog's state", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "showLineEndingDistribution: () =>\n          showLineEndingDistributionCommandRef.current()"
    );
    expect(source).toContain(
      "showLineEndingDistributionCommandRef.current =\n    openLineEndingDistributionDialog"
    );
    expect(source).toContain("setLineEndingDistributionData(");
    expect(source).toContain("<LineEndingDistributionDialog");
  });

  it("derives the dialog's data from #253's tracking state and the current editor.lineEnding.expected setting, not raw content or IPC", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const openIndex = source.indexOf(
      "function openLineEndingDistributionDialog"
    );
    const closeIndex = source.indexOf(
      "function closeLineEndingDistributionDialog"
    );

    expect(openIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeGreaterThan(openIndex);

    const openBlock = source.slice(openIndex, closeIndex);

    expect(openBlock).toContain("computeLineEndingDistribution(");
    expect(openBlock).toContain("activeMarkdownDocument.lineEndingBreaks");
    expect(openBlock).toContain(
      "effectiveSettings.editor.lineEnding.expected"
    );
    expect(openBlock).not.toContain("window.pergamum");
  });

  it("guards against opening without an active Markdown document, and against re-entrant opens", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const openIndex = source.indexOf(
      "function openLineEndingDistributionDialog"
    );
    const closeIndex = source.indexOf(
      "function closeLineEndingDistributionDialog"
    );
    const openBlock = source.slice(openIndex, closeIndex);

    expect(openBlock).toContain(
      "isLineEndingDistributionDialogPendingOrOpenRef.current"
    );
    expect(openBlock).toContain("!activeMarkdownDocument");
  });

  it("treats the distribution dialog as an app modal command blocker, alongside the About dialog", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const blockerIndex = source.indexOf(
      "registry.setCommandExecutionBlocker("
    );
    const ignoredIndex = source.indexOf("registry.setOnCommandIgnored(");

    expect(blockerIndex).toBeGreaterThan(-1);
    expect(ignoredIndex).toBeGreaterThan(blockerIndex);

    const blockerBlock = source.slice(blockerIndex, ignoredIndex);

    expect(blockerBlock).toContain("dialogController.getPendingRequest()");
    expect(blockerBlock).toContain("isAboutDialogPendingOrOpenRef.current");
    expect(blockerBlock).toContain(
      "isLineEndingDistributionDialogPendingOrOpenRef.current"
    );
    expect(blockerBlock).toContain('"app_modal_open"');
  });

  it("passes editor.lineEnding.expected and markerGlyph settings into EditorSurface, separate from files.newFile.lineEnding", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "expectedLineEnding={\n                          effectiveSettings.editor.lineEnding.expected\n                        }"
    );
    expect(source).toContain(
      "markerGlyph={\n                          effectiveSettings.editor.lineEnding.markerGlyph\n                        }"
    );
  });
});
