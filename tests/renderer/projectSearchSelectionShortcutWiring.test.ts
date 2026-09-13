import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #457 - Ctrl+Shift+F / Ctrl+Shift+H selection-seeding wiring (source-scan;
 * the full end-to-end flow (real keydown -> real focused DOM -> SearchSidebar
 * render) needs an App-level harness this repo does not have for App.tsx).
 * Pins the safety-critical shape: selection resolved before focus/pane
 * changes, the existing Command Palette `%` call site left untouched, no
 * replacement-related side effect ever triggered.
 */

const appSource = readFileSync("src/renderer/App.tsx", "utf8");

function functionBlock(name: string): string {
  const start = appSource.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = appSource.indexOf("\n  }\n", start);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end + 5);
}

describe("openProjectSearch (#384/#457)", () => {
  const fn = functionBlock("openProjectSearch");

  it("accepts an optional tab parameter and threads it into the seed request", () => {
    expect(fn).toContain("function openProjectSearch(query: string, tab?: SearchPaneTab)");
    expect(fn).toContain("tab\n");
  });

  it("still unconditionally opens/uncollapses the sidebar (unchanged #384 behaviour)", () => {
    expect(fn).toContain('setSidebarMode("search")');
    expect(fn).toContain("setLayout(");
  });
});

describe("handleProjectSearchSelectionShortcut (#457)", () => {
  const fn = functionBlock("handleProjectSearchSelectionShortcut");

  it("resolves the current selection before calling openProjectSearch (which moves focus)", () => {
    const resolveIndex = fn.indexOf("resolveCurrentSelectedTextForProjectSearch(");
    const openIndex = fn.indexOf("openProjectSearch(");
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(openIndex).toBeGreaterThan(-1);
    expect(resolveIndex).toBeLessThan(openIndex);
  });

  it("seeds '' (not the raw selection) when the selection is unusable, never trimming a usable one", () => {
    expect(fn).toContain("isUsableSelectedText(selectedText)");
    expect(fn).toContain("? selectedText");
    expect(fn).toContain('""');
    // Never a trim/normalize/escape call on the seed text.
    expect(fn).not.toContain("selectedText.trim()");
    expect(fn).not.toContain("selectedText.normalize(");
    expect(fn).not.toContain("escapeRegex(");
  });

  it("never touches replacement text or triggers a replace/preview/apply path", () => {
    expect(fn).not.toContain("replaceText");
    expect(fn).not.toContain("onReplaceInOpenDocuments");
    expect(fn).not.toContain("onReplaceInProject");
    expect(fn).not.toContain("ReplacePreview");
  });
});

describe("no app-wide keydown listener for #457 (guarded by editContextMenuSourceChecks.test.ts)", () => {
  it("App.tsx does not attach onKeyDownCapture / onKeyDown to the appShell for this feature", () => {
    const shellIndex = appSource.indexOf('className="appShell"');
    expect(shellIndex).toBeGreaterThan(-1);
    const shellBlock = appSource.slice(shellIndex, shellIndex + 400);
    expect(shellBlock).not.toContain("onKeyDownCapture");
    expect(shellBlock).not.toContain("onKeyDown");
  });
});

describe("Ctrl+Shift+F/H wired via the Electron application-menu accelerator, not a keydown listener (#457)", () => {
  it("registers the two commands, routed through refs updated on every render", () => {
    const index = appSource.indexOf(
      "registerProjectSearchSelectionShortcutCommands("
    );
    expect(index).toBeGreaterThan(-1);
    const block = appSource.slice(index, index + 500);
    expect(block).toContain(
      "openProjectSearchFromSelectionCommandRef.current()"
    );
    expect(block).toContain(
      "openProjectReplaceFromSelectionCommandRef.current()"
    );
    expect(block).toContain(
      "createProjectSearchSelectionShortcutCommandTitles(translate)"
    );
  });

  it("assigns the refs to call handleProjectSearchSelectionShortcut with the correct tab", () => {
    expect(appSource).toContain(
      'openProjectSearchFromSelectionCommandRef.current = () =>\n    handleProjectSearchSelectionShortcut("search");'
    );
    expect(appSource).toContain(
      'openProjectReplaceFromSelectionCommandRef.current = () =>\n    handleProjectSearchSelectionShortcut("replace");'
    );
  });

  it("the menu accelerators live in src/main/menu.ts's Edit menu, not a renderer keydown handler", () => {
    const menuSource = readFileSync("src/main/menu.ts", "utf8");
    expect(menuSource).toContain(
      "searchSelectionShortcutCommandIds.openProjectSearchFromSelection"
    );
    expect(menuSource).toContain(
      "searchSelectionShortcutCommandIds.openProjectReplaceFromSelection"
    );
    expect(menuSource).toContain('"CommandOrControl+Shift+F"');
    expect(menuSource).toContain('"CommandOrControl+Shift+H"');
  });

  it("the commands are palette-hidden (keybinding-only, matching the #436 Ctrl+G precedent)", () => {
    const commandsSource = readFileSync(
      "src/renderer/projectSearchSelectionShortcutCommands.ts",
      "utf8"
    );
    const paletteHiddenCount = commandsSource.match(
      /palette: \{ visible: false \}/g
    )?.length;
    expect(paletteHiddenCount).toBe(2);
  });
});

describe("Command Palette `%` call site is unchanged by #457", () => {
  it("still calls openProjectSearch with exactly the query - no tab argument", () => {
    const index = appSource.indexOf("onExecuteProjectSearch={(searchQuery)");
    expect(index).toBeGreaterThan(-1);
    const block = appSource.slice(index, index + 200);
    expect(block).toContain("openProjectSearch(searchQuery);");
    // Not openProjectSearch(searchQuery, "search") or similar - the existing
    // caller must never force a tab.
    expect(block).not.toMatch(/openProjectSearch\(searchQuery,/);
  });
});

describe("SearchSidebar / WorkspaceSidebar queryRequest.tab plumbing (#457)", () => {
  it("SearchSidebar's queryRequest prop type carries an optional tab field", () => {
    const source = readFileSync("src/renderer/SearchSidebar.tsx", "utf8");
    const index = source.indexOf("readonly queryRequest?: {");
    expect(index).toBeGreaterThan(-1);
    const block = source.slice(index, index + 200);
    expect(block).toContain("readonly tab?: SearchPaneTab");
  });

  it("the queryRequest effect forces the tab independent of query emptiness, and resets glossary mode only when moving to Replace", () => {
    const source = readFileSync("src/renderer/SearchSidebar.tsx", "utf8");
    const index = source.indexOf("queryRequest.tab !== undefined");
    expect(index).toBeGreaterThan(-1);
    const block = source.slice(index, index + 400);
    expect(block).toContain('queryRequest.tab === "replace" && mode === "glossary"');
    expect(block).toContain("setActiveTab(queryRequest.tab)");
  });

  it("WorkspaceSidebar forwards the whole searchQueryRequest object (tab included) into SearchSidebar's queryRequest", () => {
    const source = readFileSync("src/renderer/WorkspaceSidebar.tsx", "utf8");
    expect(source).toContain("readonly tab?: SearchPaneTab");
    expect(source).toContain("queryRequest={searchQueryRequest}");
  });
});
