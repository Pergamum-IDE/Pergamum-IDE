import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEditorThemeExtension } from "../../src/renderer/editorThemeExtension";

describe("editor theme extension (#621)", () => {
  it("is a static extension (no per-theme reconfiguration needed)", () => {
    expect(createEditorThemeExtension()).toBeDefined();
  });

  it("references only --pg-color-editor-* tokens that the Pergamum Light theme defines", () => {
    const extensionSource = readFileSync(
      "src/renderer/editorThemeExtension.ts",
      "utf8"
    );
    const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
    const used = new Set(
      extensionSource.match(/--pg-color-editor-[a-z-]+/g) ?? []
    );

    expect(used.size).toBeGreaterThan(0);
    for (const token of used) {
      expect(stylesSource).toContain(`${token}:`);
    }
  });

  it("is part of the shared base setup, so every CodeMirror surface gets it", () => {
    expect(
      readFileSync("src/renderer/markdownEditorCodeMirrorSetup.ts", "utf8")
    ).toContain("createEditorThemeExtension()");
  });
});

describe("theme tokens in styles.css (#621)", () => {
  const stylesSource = readFileSync("src/renderer/styles.css", "utf8");

  it("every var(--pg-color-*) used is defined in the theme block", () => {
    const used = new Set(stylesSource.match(/var\(--pg-color-[a-z-]+/g) ?? []);

    for (const usage of used) {
      const token = usage.slice("var(".length);
      expect(stylesSource, token).toContain(`${token}:`);
    }
  });

  it("pins preview tokens to print-safe values under @media print", () => {
    const printStart = stylesSource.indexOf("@media print {\n  .preview {");
    const printEnd = stylesSource.indexOf("\n}\n", printStart);
    const printBlock = stylesSource.slice(printStart, printEnd);

    expect(printStart).toBeGreaterThan(0);
    expect(printBlock).toContain("--pg-color-preview-background: #ffffff");
    expect(printBlock).toContain("--pg-color-preview-table-header-background");
    expect(printBlock).toContain("--pg-color-preview-table-border");
    expect(printBlock).toContain("--pg-color-preview-code-background");
    expect(printBlock).toContain("--pg-color-preview-blockquote-border");
  });
});
