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

describe("theme tokens in styles.css (#621, #623)", () => {
  const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
  const newline = String.fromCharCode(10);

  // Returns the text from `opener` up to (not including) the next `closer`.
  function blockAt(opener: string, closer: string): string {
    const start = stylesSource.indexOf(opener);
    expect(start, opener).toBeGreaterThanOrEqual(0);

    return stylesSource.slice(start, stylesSource.indexOf(closer, start));
  }

  function tokenNames(block: string): Set<string> {
    return new Set(
      [...block.matchAll(/(--pg-color-[a-z0-9-]+):/g)].map(
        (match) => match[1] ?? ""
      )
    );
  }

  const lightBlock = blockAt(
    `:root,${newline}.theme-pergamum-light {`,
    `${newline}}${newline}`
  );
  const nightBlock = blockAt(".theme-night-dark {", `${newline}}${newline}`);
  const blueBlock = blockAt(".theme-resistance-blue {", `${newline}}${newline}`);
  const greenBlock = blockAt(".theme-enlightened-green {", `${newline}}${newline}`);
  const bananaBlock = blockAt(".theme-banana-yellow {", `${newline}}${newline}`);
  const sakuraBlock = blockAt(".theme-sakura-pink {", `${newline}}${newline}`);
  const purpleBlock = blockAt(".theme-noble-purple {", `${newline}}${newline}`);
  const cyanBlock = blockAt(".theme-sky-cyan {", `${newline}}${newline}`);
  const parchmentBlock = blockAt(
    ".theme-parchment-sheep {",
    `${newline}}${newline}`
  );
  const printBlock = blockAt(
    `@media print {${newline}  .preview {`,
    `${newline}  }${newline}}`
  );

  it("every var(--pg-color-*) used is defined in the theme block", () => {
    const used = new Set(stylesSource.match(/var\(--pg-color-[a-z0-9-]+/g) ?? []);

    for (const usage of used) {
      const token = usage.slice("var(".length);
      expect(stylesSource, token).toContain(`${token}:`);
    }
  });

  it("every theme overrides every semantic token Pergamum Light defines (no token silently stays un-overridden)", () => {
    const lightTokens = tokenNames(lightBlock);
    const themeBlocks = [
      { name: "Night Dark", tokens: tokenNames(nightBlock) },
      { name: "Resistance Blue", tokens: tokenNames(blueBlock) },
      { name: "Enlightened Green", tokens: tokenNames(greenBlock) },
      { name: "Banana Yellow", tokens: tokenNames(bananaBlock) },
      { name: "Sakura Pink", tokens: tokenNames(sakuraBlock) },
      { name: "Noble Purple", tokens: tokenNames(purpleBlock) },
      { name: "Sky Cyan", tokens: tokenNames(cyanBlock) },
      { name: "Parchment Sheep", tokens: tokenNames(parchmentBlock) }
    ];

    for (const { name, tokens } of themeBlocks) {
      for (const token of lightTokens) {
        expect(tokens, `${name} missing ${token}`).toContain(token);
      }
    }
  });

  it("the print block re-pins every preview color token, so a dark theme never reaches paper", () => {
    const pinned = tokenNames(printBlock);

    for (const token of tokenNames(nightBlock)) {
      if (token.startsWith("--pg-color-preview-")) {
        expect(pinned, token).toContain(token);
      }
    }
  });

  it("pins preview tokens to print-safe values under @media print", () => {
    expect(printBlock).toContain("--pg-color-preview-background: #ffffff");
    expect(printBlock).toContain("--pg-color-preview-table-header-background");
    expect(printBlock).toContain("--pg-color-preview-table-border");
    expect(printBlock).toContain("--pg-color-preview-code-background");
    expect(printBlock).toContain("--pg-color-preview-blockquote-border");
  });
});
