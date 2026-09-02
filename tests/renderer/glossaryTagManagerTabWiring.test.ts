import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

describe("Glossary Tag Manager special tab wiring (#375)", () => {
  it("keeps the Tag Manager as a special workspace tab (no EditorId kind)", () => {
    const source = appSource();

    expect(source).toContain(
      "const [isGlossaryTagManagerTabOpen, setIsGlossaryTagManagerTabOpen]"
    );
    expect(source).toContain('specialWorkspaceTabId("glossaryTagManager")');
    expect(source).toContain('translate("glossary.tagManager.title")');
    expect(source).not.toContain("createGlossaryTagManagerEditorId");
    expect(source).not.toContain('kind: "glossaryTagManager"');
  });

  it("opening the tab activates the existing one instead of duplicating it", () => {
    const source = appSource();
    const fnIndex = source.indexOf(
      "function openGlossaryTagManagerTab(options"
    );
    const nextIndex = source.indexOf(
      "function activateSpecialTab(",
      fnIndex
    );

    expect(fnIndex).toBeGreaterThan(-1);
    const block = source.slice(fnIndex, nextIndex);

    expect(block).toContain("setIsGlossaryTagManagerTabOpen(true)");
    expect(block).toContain('setActiveSpecialTabId("glossaryTagManager")');
    // No new-tab bookkeeping — a plain boolean + active-id flip.
    expect(block).not.toContain("openOrActivateEditor");

    const activateIndex = source.indexOf("function activateSpecialTab(");
    const closeIndex = source.indexOf(
      "function closeSpecialTab(",
      activateIndex
    );
    expect(
      source
        .slice(activateIndex, closeIndex)
        .includes(
          'if (tabId === "glossaryTagManager" && isGlossaryTagManagerTabOpen)'
        )
    ).toBe(true);
  });

  it("routes the glossary tag manage command to openGlossaryTagManagerTab", () => {
    const source = appSource();
    const registerIndex = source.indexOf("registerGlossaryCommands(");
    const nextRegister = source.indexOf(
      "registerGlossaryOccurrencesCommands(",
      registerIndex
    );
    const block = source.slice(registerIndex, nextRegister);

    expect(block).toContain("openGlossaryTagManager: () => {");
    expect(block).toContain("openGlossaryTagManagerTab();");
  });

  it("renders the GlossaryTagManager in the editor area when its tab is active", () => {
    const source = appSource();
    const bodyIndex = source.indexOf(
      '<section className="editorAreaBody" ref={editorAreaBodyRef}>'
    );
    const statusBarIndex = source.indexOf('<footer className="statusBar">');
    const block = source.slice(bodyIndex, statusBarIndex);

    expect(block).toContain("{isGlossaryTagManagerTabActive ? (");
    expect(block).toContain("<GlossaryTagManager");
    expect(block).toContain("autoStartCreate={glossaryTagManagerAutoStartCreate}");
    // Falls through to Settings / EditorSurface below it.
    expect(block.indexOf("{isGlossaryTagManagerTabActive ? (")).toBeLessThan(
      block.indexOf("isSettingsTabActive ? (")
    );
  });

  it("closes the (project-scoped) Tag Manager tab on project switch / close", () => {
    const source = appSource();

    expect(
      (source.match(/setIsGlossaryTagManagerTabOpen\(false\)/g) ?? []).length
    ).toBeGreaterThanOrEqual(3);
  });

  it("wires the Entry editor 'manage tags' link to open the tab in create mode", () => {
    const source = appSource();

    expect(source).toContain(
      "openGlossaryTagManagerTab({ autoStartCreate: true })"
    );
  });
});
