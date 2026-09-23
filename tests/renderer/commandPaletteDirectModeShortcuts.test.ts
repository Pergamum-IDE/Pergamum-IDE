/**
 * #556: direct Command Palette mode shortcuts (Mod+O / Mod+# / Mod+@ /
 * Mod+: / Mod+%).
 *
 * `App.tsx` is too large to mount in a full render test (see
 * `previewCommandPaletteShortcutSwap.test.ts` / `toolbarCommandBox.test.ts`'s
 * "App.tsx wiring (source-level assertions)" convention, reused here), so
 * these are source-level assertions on the `useGlobalKeyboardShortcuts`
 * registration. Manual verification is documented in the PR description.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function globalShortcutsBlock(): string {
  const source = readFileSync("src/renderer/App.tsx", "utf8");

  const callStart = source.indexOf("useGlobalKeyboardShortcuts(");
  expect(callStart).toBeGreaterThan(-1);

  const callEnd = source.indexOf("\n  function closeSpecialTab", callStart);
  expect(callEnd).toBeGreaterThan(callStart);

  const callBlock = source.slice(callStart, callEnd);
  const start = callBlock.indexOf('id: "togglePreview"');
  expect(start).toBeGreaterThan(-1);

  return callBlock.slice(start);
}

describe("direct Command Palette mode shortcut wiring (source-level assertions, #556)", () => {
  it("registers Mod+O opening file mode (empty prefix, not collapsed to '>')", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "openCommandPaletteFileMode"');
    expect(block).toContain('match: { key: "o", ctrlOrCmd: true }');
    expect(block).toContain('openCommandPaletteWithPrefix("")');
  });

  it("registers Mod+# opening heading jump mode with ignoreShiftAndAltState", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "openCommandPaletteHeadingJump"');
    expect(block).toContain(
      'match: { key: "#", ctrlOrCmd: true, ignoreShiftAndAltState: true }'
    );
    expect(block).toContain('openCommandPaletteWithPrefix("#")');
  });

  it("registers Mod+@ opening glossary jump mode with ignoreShiftAndAltState", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "openCommandPaletteGlossaryJump"');
    expect(block).toContain(
      'match: { key: "@", ctrlOrCmd: true, ignoreShiftAndAltState: true }'
    );
    expect(block).toContain('openCommandPaletteWithPrefix("@")');
  });

  it("registers Mod+: opening line jump mode with ignoreShiftAndAltState", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "openCommandPaletteLineJump"');
    expect(block).toContain(
      'match: { key: ":", ctrlOrCmd: true, ignoreShiftAndAltState: true }'
    );
    expect(block).toContain('openCommandPaletteWithPrefix(":")');
  });

  it("registers Mod+% opening project-wide search mode with ignoreShiftAndAltState", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "openCommandPaletteProjectSearch"');
    expect(block).toContain(
      'match: { key: "%", ctrlOrCmd: true, ignoreShiftAndAltState: true }'
    );
    expect(block).toContain('openCommandPaletteWithPrefix("%")');
  });

  it("does not use a physical-key (event.code) fallback for any symbol shortcut", () => {
    const block = globalShortcutsBlock();

    expect(block).not.toContain("event.code");
    expect(block).not.toContain(".code ===");
  });

  it("preserves the #554 togglePreview shortcut (Mod+Shift+P) unchanged", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain(
      'match: { key: "p", ctrlOrCmd: true, shift: true }'
    );
  });
});
