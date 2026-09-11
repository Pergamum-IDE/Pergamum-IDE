import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

/** A window of App source starting at `header`, for scoped `toContain` checks. */
function region(source: string, header: string, length = 2000): string {
  const index = source.indexOf(header);
  expect(index, `App source is missing: ${header}`).toBeGreaterThan(-1);
  return source.slice(index, index + length);
}

// #436 Slice 10: the Glossary Entry Editor Pane holds a project-owned draft
// (create OR edit) once Slice 9 relocated GlossaryEditor into it. It must not
// outlive the project it belongs to — every renderer choke point that tears
// down / replaces the active project's project-scoped UI (the same 3 spots
// that already reset the Glossary Tag Manager / Entry Manager / Project
// Settings tabs) must also close the pane. Dirty confirmation is explicitly
// NOT part of this slice — the draft is discarded silently, same as it was
// before Slice 10 existed.
describe("Glossary Entry Editor Pane project-lifecycle reset (#436 Slice 10)", () => {
  it("closes the pane on explicit Project Close, alongside the other project-scoped tab resets", () => {
    const body = region(
      appSource(),
      "function resetRendererProjectAfterExplicitClose("
    );

    expect(body).toContain(
      "setGlossaryEntryEditorPane(closeGlossaryEntryEditorPane());"
    );
    // Same reset point as the other project-scoped UI — regression guard.
    expect(body).toContain("setIsGlossaryTagManagerTabOpen(false);");
    expect(body).toContain("setIsGlossaryEntryManagerTabOpen(false);");
    expect(body).toContain("setIsProjectSettingsTabOpen(false);");
    expect(body).toContain("setProject(null);");
  });

  it("closes the pane on project switch / opening another project (activateProject)", () => {
    const body = region(appSource(), "async function activateProject(");

    expect(body).toContain(
      "setGlossaryEntryEditorPane(closeGlossaryEntryEditorPane());"
    );
    expect(body).toContain("setIsGlossaryTagManagerTabOpen(false);");
    expect(body).toContain("setIsGlossaryEntryManagerTabOpen(false);");
    expect(body).toContain("setIsProjectSettingsTabOpen(false);");
    expect(body).toContain("setProject(openedProject);");
  });

  it("closes the pane when applying a restored environment (cold start)", () => {
    const body = region(appSource(), "function applyRestoredEnvironment(");

    expect(body).toContain(
      "setGlossaryEntryEditorPane(closeGlossaryEntryEditorPane());"
    );
    expect(body).toContain("setIsGlossaryTagManagerTabOpen(false);");
    expect(body).toContain("setIsGlossaryEntryManagerTabOpen(false);");
    expect(body).toContain("setIsProjectSettingsTabOpen(false);");
    expect(body).toContain("setProject(env.project);");
  });

  it("does not touch the pane's resize height state at any of the 3 reset points (Slice 10 non-goal)", () => {
    const source = appSource();

    for (const header of [
      "function resetRendererProjectAfterExplicitClose(",
      "async function activateProject(",
      "function applyRestoredEnvironment("
    ]) {
      const body = region(source, header);
      expect(body).not.toContain("setGlossaryEntryEditorPaneHeight");
    }
  });

  it("does not introduce a dirty-confirm dialog for the pane's draft (Slice 10 non-goal, later slice)", () => {
    const source = appSource();

    // The reset call itself is an unconditional, synchronous state set — no
    // confirm dialog / dirty-check gate wraps it in any of the 3 functions
    // (already verified individually above).
    expect(source).not.toContain("glossaryEntryEditorPaneDirty");
    expect(source).not.toContain("confirmCloseGlossaryEntryEditorPane");
  });

  it("#436 Slice 9 regression: create/edit both still route through GlossaryEntryEditorSession hosting GlossaryEditor", () => {
    const paneSource = readFileSync(
      "src/renderer/GlossaryEntryEditorPane.tsx",
      "utf8"
    );
    expect(paneSource).toContain(
      'import { GlossaryEntryEditorSession } from "./GlossaryEntryEditorSession"'
    );
    expect(paneSource).toContain('mode="create"');
    expect(paneSource).toContain('mode="edit"');
  });

  it("does not revive the old glossaryEntry tab or occurrence navigation UI", () => {
    const source = appSource();
    expect(source).not.toContain("function createGlossaryEntryFromSidebar");
    expect(source).not.toContain("glossaryCommandIds.createEntry");

    const editorSource = readFileSync(
      "src/renderer/GlossaryEditor.tsx",
      "utf8"
    );
    expect(editorSource).not.toContain("onNavigateToPreviousOccurrence");
    expect(editorSource).not.toContain("onNavigateToNextOccurrence");
  });
});
