/**
 * #558: pane toggle shortcuts (Ctrl+Shift+E / G / M / T).
 *
 * `App.tsx` is too large to mount in a full render test (see
 * `previewCommandPaletteShortcutSwap.test.ts` / `toolbarCommandBox.test.ts`'s
 * "App.tsx wiring (source-level assertions)" convention, reused here), so
 * these are source-level assertions confirming each shortcut reuses
 * `handleActivityBarModeClick` — the exact function the Activity Bar
 * buttons' `onClick` calls — rather than duplicating the pane toggle logic
 * in the shortcut handler. Manual verification is documented in the PR
 * description.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function globalShortcutsCallBlock(): string {
  const source = readFileSync("src/renderer/App.tsx", "utf8");

  const start = source.indexOf("useGlobalKeyboardShortcuts(");
  expect(start).toBeGreaterThan(-1);

  const end = source.indexOf("\n  function closeSpecialTab", start);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function globalShortcutsBlock(): string {
  const block = globalShortcutsCallBlock();
  const start = block.indexOf('id: "togglePreview"');
  expect(start).toBeGreaterThan(-1);

  return block.slice(start);
}

describe("pane toggle shortcut wiring (source-level assertions, #558)", () => {
  it("registers Ctrl+Shift+E toggling the File Explorer via handleActivityBarModeClick", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "toggleFileExplorer"');
    expect(block).toContain(
      'match: { key: "e", ctrlOrCmd: true, shift: true }'
    );
    expect(block).toContain('handleActivityBarModeClick("files")');
  });

  it("registers Ctrl+Shift+G toggling the Glossary pane via handleActivityBarModeClick", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "toggleGlossaryPane"');
    expect(block).toContain(
      'match: { key: "g", ctrlOrCmd: true, shift: true }'
    );
    expect(block).toContain('handleActivityBarModeClick("glossary")');
  });

  it("registers Ctrl+Shift+M toggling the Document Map via handleActivityBarModeClick", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "toggleDocumentMap"');
    expect(block).toContain(
      'match: { key: "m", ctrlOrCmd: true, shift: true }'
    );
    expect(block).toContain('handleActivityBarModeClick("documentMap")');
  });

  it("registers Ctrl+Shift+T toggling Document Metrics via handleActivityBarModeClick", () => {
    const block = globalShortcutsBlock();

    expect(block).toContain('id: "toggleDocumentMetrics"');
    expect(block).toContain(
      'match: { key: "t", ctrlOrCmd: true, shift: true }'
    );
    expect(block).toContain('handleActivityBarModeClick("documentMetrics")');
  });

  it("does not introduce a second pane-toggle code path (no resolveSidebarToggle call in the shortcut block)", () => {
    const block = globalShortcutsBlock();

    // The toggle/collapse decision must live solely in `resolveSidebarToggle`
    // (called once, from `focusSidebarMode`'s command handler) — the
    // shortcut handlers here must only route to the existing
    // activity-bar/command path, never call it directly themselves.
    expect(block).not.toContain("resolveSidebarToggle(");
  });

  it("keeps pane shortcut handlers live with the current Activity Bar command path", () => {
    const block = globalShortcutsCallBlock();

    expect(block).toContain("useGlobalKeyboardShortcuts([");
    expect(block).not.toContain("useMemo(");
    expect(block).not.toContain("[isPreviewEligible]");
  });
});

describe("handleActivityBarModeClick reuse (source-level assertions, #558)", () => {
  it("handleActivityBarModeClick routes through executeUiCommand with the activityBar source", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    const start = source.indexOf("function handleActivityBarModeClick(");
    expect(start).toBeGreaterThan(-1);

    const end = source.indexOf("\n  }", start);
    const block = source.slice(start, end);

    expect(block).toContain("executeUiCommand(workspaceFocusCommandIdForMode(mode)");
    expect(block).toContain('source: "activityBar"');
  });
});
