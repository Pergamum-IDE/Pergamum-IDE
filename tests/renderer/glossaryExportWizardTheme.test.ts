import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// #695 polish: the Glossary Export Wizard (the in-app dialog UI, not the
// exported HTML / PDF) must follow the current theme.

const css = readFileSync("src/renderer/styles.css", "utf8");
const wizardCss = (() => {
  const start = css.indexOf(".glossaryExportWizardDialog {");
  const end = css.indexOf("/* #625 P2a: Japanese machine check wizard.");

  return css.slice(start, end);
})();

/** Every declaration block whose selector list ends with `selector`. */
function rule(selector: string): string {
  const lastLine = selector.split("\n").pop() ?? selector;
  const blocks: string[] = [];

  for (const chunk of wizardCss.split("}")) {
    const brace = chunk.indexOf("{");

    if (brace < 0) {
      continue;
    }

    const selectors = chunk.slice(0, brace).trim().split(/,\s*/);

    if (selectors.includes(lastLine.replace(/,$/, "").trim())) {
      blocks.push(chunk.slice(brace + 1));
    }
  }

  if (blocks.length === 0) {
    throw new Error(`no rule for ${selector}`);
  }

  return blocks.join("\n");
}

describe("Glossary Export Wizard follows the theme (#695)", () => {
  it("has a non-empty wizard block to check", () => {
    expect(wizardCss.length).toBeGreaterThan(1000);
    expect(wizardCss).toContain(".glossaryExportWizardOptionsBlock");
  });

  it("uses no hardcoded colors: no hex or rgb() literal in any wizard rule", () => {
    expect(wizardCss.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(wizardCss).not.toMatch(/\brgba?\(/);
  });

  it("does not rely on dialog tokens that are not defined (they fell back to light colors)", () => {
    for (const missing of [
      "--app-dialog-text",
      "--app-dialog-card-bg",
      "--app-dialog-button-bg"
    ]) {
      expect(wizardCss, missing).not.toContain(missing);
      expect(css.includes(`${missing}:`), missing).toBe(false);
    }
  });

  it("every token it uses is defined, and by more than one theme", () => {
    const used = new Set(
      [...wizardCss.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1])
    );

    expect(used.size).toBeGreaterThan(5);
    for (const token of used) {
      const definitions = css.match(new RegExp(`${token}:`, "g")) ?? [];

      expect(definitions.length, token).toBeGreaterThan(1);
    }
  });

  it("themes the options block, table header, rows and summary block with panel tokens", () => {
    expect(rule(".glossaryExportWizardOptionsBlock")).toContain(
      "background: var(--pg-color-panel-background)"
    );
    expect(rule(".glossaryExportWizardSummaryBlock")).toContain(
      "background: var(--pg-color-panel-background)"
    );
    expect(rule(".glossaryExportWizardTableHead")).toContain(
      "background: var(--pg-color-panel-header-background)"
    );
    expect(rule(".glossaryExportWizardTableHead")).toContain(
      "color: var(--app-dialog-foreground)"
    );
    expect(rule(".glossaryExportWizardTableRow")).toContain(
      "var(--pg-color-panel-divider)"
    );
    expect(rule(".glossaryExportWizardTableSection")).toContain(
      "var(--app-dialog-border)"
    );
  });

  it("themes inputs, selects and buttons with the input / dialog button tokens", () => {
    const input = rule(".glossaryExportWizardSelect,\n.glossaryExportWizardTextInput");

    expect(input).toContain("background: var(--pg-color-input-background)");
    expect(input).toContain("color: var(--pg-color-input-foreground)");
    expect(input).toContain("border-color: var(--pg-color-input-border)");
    expect(rule(".glossaryExportWizardBrowseButton")).toContain(
      "color: var(--app-dialog-button-foreground)"
    );
    expect(
      rule(".glossaryExportWizardCancelButton,\n.glossaryExportWizardBackButton")
    ).toContain("background: var(--app-dialog-button-background)");
  });

  it("themes help, muted, disabled-looking and status text", () => {
    expect(rule(".glossaryExportWizardHelpNote")).toContain(
      "color: var(--pg-color-surface-muted)"
    );
    expect(rule(".glossaryExportWizardNoTags")).toContain(
      "color: var(--pg-color-surface-muted)"
    );
    expect(rule(".glossaryExportWizardCellCount")).toContain(
      "color: var(--pg-color-surface-muted)"
    );
    expect(rule(".glossaryExportWizardErrorText")).toContain(
      "var(--pg-color-status-error-text-alt-4)"
    );
    expect(rule(".glossaryExportWizardSuccessStatus")).toContain(
      "var(--pg-color-status-success)"
    );
    expect(rule(".glossaryExportWizardErrorStatus")).toContain(
      "var(--pg-color-status-error)"
    );
  });

  it("is a general fix, not single-mode only: the shared container sets the text color", () => {
    expect(rule(".glossaryExportWizardContainer")).toContain(
      "color: var(--app-dialog-foreground)"
    );
  });

  it("leaves the exported HTML / PDF CSS alone", () => {
    const exportHtml = readFileSync(
      "src/renderer/glossaryExport/glossaryExportHtml.ts",
      "utf8"
    );

    expect(exportHtml).not.toContain("glossaryExportWizard");
    expect(exportHtml).not.toContain("--app-dialog");
  });
});
