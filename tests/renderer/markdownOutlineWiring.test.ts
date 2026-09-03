import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #352: App / WorkspaceSidebar wiring for the Markdown Outline pane, verified
 * by asserting the source (same approach as other App-wiring tests).
 */
const appSource = readFileSync("src/renderer/App.tsx", "utf8");
const sidebarSource = readFileSync(
  "src/renderer/WorkspaceSidebar.tsx",
  "utf8"
);

describe("Markdown Outline wiring (#352)", () => {
  it("App drives the outline index from openDocumentsState via useMarkdownOutlineIndex", () => {
    expect(appSource).toContain(
      "const { activeOutline: activeMarkdownOutline, index: markdownOutlineIndex } =\n" +
        "    useMarkdownOutlineIndex(openDocumentsState);"
    );
    expect(appSource).toContain(
      "const activeEditorIsMarkdown =\n" +
        '    !isEditorAreaSpecialTabActive && currentEditor?.kind === "markdown";'
    );
  });

  it("App jumps to a clicked heading with a CENTER-scroll offset pending selection (not a line jump)", () => {
    const fn = appSource.slice(
      appSource.indexOf("// #352: jump the active Markdown editor"),
      appSource.indexOf("const activeEditorFocusSurface")
    );
    expect(fn).toContain("if (!activeEditorIsMarkdown) {");
    expect(fn.replace(/\s+/g, " ")).toContain(
      'setPendingMarkdownSelection({ start: item.from, end: item.from, scrollY: "center" })'
    );
    expect(fn).not.toContain("goToLine");
    expect(fn).not.toContain("lineNumber");
    // Q3: navigation history stays a follow-up, not implemented here.
    expect(fn).toContain(
      "// Future: record editor navigation history before heading jump."
    );
  });

  it("only heading jumps pass scrollY: center — line jump / glossary occurrence stay nearest", () => {
    // #352 Outline heading click + #141 Command Palette `#` heading jump are
    // the only `scrollY:` uses in App; both jump to a heading.
    expect(appSource.match(/scrollY:/g) ?? []).toHaveLength(2);
    const goToLine = appSource.slice(
      appSource.indexOf("goToLineCommandRef.current = (line) =>"),
      appSource.indexOf("lineJumpEditorSnapshot")
    );
    expect(goToLine).toContain(
      "setPendingMarkdownSelection({ start: offset, end: offset })"
    );
    expect(goToLine).not.toContain("scrollY");
  });

  it("#141: the Command Palette `#` heading jump activates the tab then jumps to the heading offset, center-scrolled", () => {
    const fn = appSource.slice(
      appSource.indexOf("async function activateHeadingJumpTarget("),
      appSource.indexOf("async function changeSettings(")
    );
    expect(fn).toContain(
      "editorNavigation.openEditor(candidate.editorId, {"
    );
    expect(fn).toContain('history: "skip"');
    expect(fn.replace(/\s+/g, " ")).toContain(
      'setPendingMarkdownSelection({ start: candidate.from, end: candidate.from, scrollY: "center" })'
    );
    // No File Explorer reveal / selection sync, no line jump.
    expect(fn).not.toContain("revealFileExplorer");
    expect(fn).not.toContain("setFileExplorerRevealRequest");
    expect(fn).not.toContain("goToLine");
  });

  it("App passes the outline props to WorkspaceSidebar", () => {
    const block = appSource.slice(
      appSource.indexOf("<WorkspaceSidebar"),
      appSource.indexOf("/>", appSource.indexOf("<WorkspaceSidebar"))
    );
    expect(block).toContain("markdownOutline={activeMarkdownOutline}");
    expect(block).toContain("activeEditorIsMarkdown={activeEditorIsMarkdown}");
    expect(block).toContain("activeOutlineDocumentKey={activeDocumentKey}");
    expect(block).toContain("onOutlineHeadingClick={handleOutlineHeadingClick}");
  });

  it("WorkspaceSidebar delegates files mode to WorkbenchFilesSidebar, which stacks the resizable Outline pane", () => {
    const filesCase = sidebarSource.slice(
      sidebarSource.indexOf('case "files":'),
      sidebarSource.indexOf('case "search":')
    );
    expect(filesCase).toContain("<WorkbenchFilesSidebar");
    expect(filesCase).toContain("fileExplorer={");
    expect(filesCase).toContain("<FileExplorer");
    expect(filesCase).toContain("markdownOutline={markdownOutline}");

    const filesSidebar = readFileSync(
      "src/renderer/WorkbenchFilesSidebar.tsx",
      "utf8"
    );
    expect(filesSidebar).toContain("useVerticalDrag(");
    expect(filesSidebar).toContain("workbenchFilesSidebarResizeHandle");
    expect(filesSidebar).toContain("<CollapsibleSidebarSection");
    expect(filesSidebar).toContain("<MarkdownOutlinePane");
    // #352: the tree item collapsed set is lifted here (survives the pane
    // body unmounting) and cleared on document change, not on every keystroke.
    expect(filesSidebar).toContain("collapsedOutlineItemIds");
    expect(filesSidebar).toContain("}, [activeOutlineDocumentKey]);");
    // handle only rendered while expanded
    expect(filesSidebar).toContain("outlineCollapsed ? null : (");
    // File Explorer is rendered before the Outline section
    expect(filesSidebar.indexOf("{fileExplorer}")).toBeLessThan(
      filesSidebar.indexOf("<MarkdownOutlinePane")
    );
    // No persistence of the Outline height across restarts.
    expect(filesSidebar).not.toContain("localStorage");
    expect(filesSidebar).not.toContain("window.pergamum");
  });

  it("MarkdownEditor applies the pending selection's scroll strategy (default nearest)", () => {
    const editorSource = readFileSync(
      "src/renderer/MarkdownEditor.tsx",
      "utf8"
    );
    expect(editorSource.replace(/\s+/g, " ")).toContain(
      'EditorView.scrollIntoView(from, { y: pendingSelection.scrollY ?? "nearest" })'
    );
  });

  it("#141: the Command Palette heading mode is now a real heading-jump list, not a reserved placeholder", () => {
    const paletteSource = readFileSync(
      "src/renderer/CommandPalette.tsx",
      "utf8"
    );
    expect(paletteSource).not.toContain(
      'return "commandPalette.reserved.heading";'
    );
    expect(paletteSource).toContain('mode === "heading"');
    expect(paletteSource).toContain(
      "filterCommandPaletteHeadingJumpCandidates("
    );
  });
});
