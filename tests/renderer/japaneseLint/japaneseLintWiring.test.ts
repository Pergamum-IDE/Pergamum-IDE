import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInThemes } from "../../../src/shared/colorTheme";
import {
  contrastRatio,
  WCAG_AA_LARGE_TEXT_OR_UI
} from "../../../src/shared/colorContrast";

const source = (path: string): string => readFileSync(path, "utf8");
const newline = String.fromCharCode(10);

describe("Japanese lint wiring (#625 Slice 2)", () => {
  const app = source("src/renderer/App.tsx");
  const toolbar = source("src/renderer/components/EditorToolbar.tsx");
  const editor = source("src/renderer/MarkdownEditor.tsx");
  const setup = source("src/renderer/markdownEditorCodeMirrorSetup.ts");

  it("is OFF by default and reset with the project, like the Markdown syntax checker", () => {
    expect(app).toContain(
      "const [isJapaneseLintActive, setIsJapaneseLintActive] =" +
        newline +
        "    useState<boolean>(false);"
    );
    expect(app).toContain("setIsJapaneseLintActive(false);");
  });

  it("is never persisted (no settings / localStorage / session involvement)", () => {
    const lintSources = [
      source("src/renderer/japaneseLint/japaneseLintGutterExtension.ts"),
      source("src/shared/japaneseLint.ts")
    ].join(newline);

    expect(lintSources).not.toMatch(/localStorage|sessionStorage|saveSettings/);
    expect(app).not.toMatch(/JapaneseLint[A-Za-z]*\.(save|persist)/);
  });

  it("offers a toolbar toggle with pressed state, disabled when unsupported", () => {
    expect(toolbar).toContain("jp-check.svg?raw");
    expect(toolbar).toContain("disabled={!canUseJapaneseLint}");
    expect(toolbar).toContain("aria-pressed={isJapaneseLintActive}");
    expect(toolbar).toContain("onClick={onToggleJapaneseLint}");
    expect(toolbar).toContain('translate("toolbar.japaneseLint")');
  });

  it("lints the body editor and the glossary Description (#687) through one source: special tabs stay null", () => {
    const resolver = source(
      "src/renderer/japaneseLint/japaneseLintEditorSource.ts"
    );

    expect(app).toContain("resolveJapaneseLintEditorSource(");
    expect(resolver).toContain("if (input.isSpecialTabActive || currentEditor === null)");
    expect(resolver).toContain('currentEditor.kind === "glossaryDescription"');
    expect(resolver).toContain("japaneseLintSourceForPath(");
    // The editor surface receives the source regardless of the tab kind.
    const glossaryEditorUses = editor.match(/japaneseLintSource/g) ?? [];
    expect(glossaryEditorUses.length).toBeGreaterThan(0);
  });

  it("keeps the renderer free of the textlint engine (it goes through IPC)", () => {
    for (const file of [
      "src/renderer/japaneseLint/japaneseLintGutterExtension.ts",
      "src/renderer/MarkdownEditor.tsx",
      "src/renderer/App.tsx"
    ]) {
      expect(source(file)).not.toMatch(/from ["'](@?textlint|@textlint)/);
    }
    expect(editor).toContain("window.pergamum.japaneseLint.lint(request)");
    expect(source("src/preload/preload.ts")).toContain(
      "JAPANESE_LINT_CHANNELS.lint"
    );
  });

  it("adds the gutter lane to the shared editor setup and leaves the syntax checker in place", () => {
    expect(setup).toContain("createJapaneseLintExtension()");
    expect(editor).toContain("registerEditorViewSyntaxCheckerOptions");
    expect(toolbar).toContain("aria-pressed={isMarkdownSyntaxCheckerActive}");
  });

  it("uses no text underline: only a gutter and no @codemirror/lint in the extension", () => {
    const extension = source(
      "src/renderer/japaneseLint/japaneseLintGutterExtension.ts"
    );

    expect(extension).not.toContain('from "@codemirror/lint"');
    expect(extension).not.toMatch(/Decoration\.mark|cm-lintRange/);
  });
});

describe("Japanese lint marker colors (WCAG, gutter icon >= 3:1)", () => {
  const css = source("src/renderer/styles.css");

  function tokensOf(opener: string): Map<string, string> {
    const start = css.indexOf(opener);
    expect(start, opener).toBeGreaterThanOrEqual(0);
    const end = css.indexOf(`${newline}}${newline}`, start);
    const tokens = new Map<string, string>();

    for (const match of css
      .slice(start, end)
      .matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      tokens.set(match[1] ?? "", (match[2] ?? "").trim());
    }

    return tokens;
  }

  const defaults = tokensOf(`:root {${newline}  --pg-color-japanese-lint-info`);
  const darkOverrides = tokensOf(":root.theme-night-dark {");

  for (const theme of builtInThemes) {
    it(`${theme.label}: info / warning / error icons are visible on the editor gutter`, () => {
      const themeTokens = tokensOf(`.${theme.cssClassName} {`);
      const gutter = themeTokens.get("--pg-color-editor-gutter-background") ?? "";

      for (const name of ["info", "warning", "error"]) {
        const token = `--pg-color-japanese-lint-${name}`;
        const color =
          theme.kind === "dark"
            ? (darkOverrides.get(token) ?? defaults.get(token))
            : defaults.get(token);

        expect(color, `${theme.id} ${token}`).toBeDefined();
        expect(
          contrastRatio(color ?? "", gutter),
          `${theme.id} ${name}: ${color} on ${gutter}`
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_OR_UI);
      }
    });
  }

  it("Night Dark's info icon is white, as specified", () => {
    expect(darkOverrides.get("--pg-color-japanese-lint-info")).toBe("#ffffff");
  });
});
