import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/renderer/styles.css", "utf8");

const menuSelectors = [
  "fileExplorerContextMenu",
  "documentTabContextMenu",
  "editContextMenu"
] as const;

function blocksMentioning(selector: string): string[] {
  const blocks: string[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(css)) !== null) {
    if (match[1].includes(`.${selector}`)) {
      blocks.push(match[0]);
    }
  }

  return blocks;
}

describe("renderer context menu theming (#683 / #685)", () => {
  it("never references the undefined --app-surface token", () => {
    expect(css).not.toContain("--app-surface");
  });

  it.each(menuSelectors)(
    ".%s* rules use no hardcoded colors or fallbacks",
    (selector) => {
      const blocks = blocksMentioning(selector);

      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        // Shadows may use rgba; every color property must be a theme token.
        const withoutShadow = block
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/box-shadow:[^;]*;/g, "");
        expect(withoutShadow).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(withoutShadow).not.toMatch(/\brgba?\(/);
        expect(withoutShadow).not.toContain("--workspace-sidebar");
      }
    }
  );

  it("shares one semantic-token combination across all three menus", () => {
    const shared = css.match(
      /\.fileExplorerContextMenu,\s*\.documentTabContextMenu,\s*\.editContextMenu \{[^}]*\}/
    );

    expect(shared?.[0]).toContain("var(--pg-color-surface-background)");
    expect(shared?.[0]).toContain("var(--pg-color-surface-foreground)");
    expect(shared?.[0]).toContain("var(--pg-color-panel-border)");
  });

  it("makes hover, focus-visible, disabled and separator theme-aware", () => {
    expect(css).toMatch(
      /\.editContextMenuItem:hover:not\(:disabled\) \{\s*background: var\(--pg-color-surface-hover\);/
    );
    expect(css).toMatch(
      /\.editContextMenuItem:focus-visible \{[^}]*var\(--pg-color-surface-active\)[^}]*var\(--pg-color-focus-ring\)/
    );
    expect(css).toMatch(
      /\.editContextMenuItem:disabled \{[^}]*var\(--pg-color-surface-muted\)/
    );
    expect(css).toMatch(
      /\.documentTabContextMenuSeparator \{[^}]*var\(--pg-color-panel-divider\)/
    );
  });
});
