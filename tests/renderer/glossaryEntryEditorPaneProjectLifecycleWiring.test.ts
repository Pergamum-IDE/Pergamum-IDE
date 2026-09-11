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
// Settings tabs) must also close the pane. Slice 10 itself deliberately did
// this UNCONDITIONALLY (no dirty confirmation yet — see the note on the
// "unconditional reset" test below); Slice 11 added the confirm, but as a
// separate, EARLIER gate at the callers (`closeProject`/`confirmProjectSwitch`)
// rather than inside these 3 reset functions themselves — see
// `glossaryEntryEditorPaneDirtyConfirmationWiring.test.ts`.
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

  it("#436 Slice 11: the reset call inside all 3 functions stays an unconditional, synchronous state set", () => {
    const source = appSource();

    // Slice 11's dirty confirm gates the CALLERS (closeProject,
    // confirmProjectSwitch, runQuitOrRestartFlow, handleLifecycleWindowCloseRequest)
    // — see glossaryEntryEditorPaneDirtyConfirmationWiring.test.ts. These 3
    // reset functions themselves are unconditional on purpose: by the time
    // any of them runs, the confirm (if any) has already happened.
    for (const header of [
      "function resetRendererProjectAfterExplicitClose(",
      "async function activateProject(",
      "function applyRestoredEnvironment("
    ]) {
      const body = region(source, header);
      expect(body).not.toContain("confirmGlossaryEntryEditorPaneDirtyIfNeeded");
      expect(body).not.toContain("confirmGlossaryEntryEditorPaneDiscardOrSave");
    }
  });

  it("#436 Slice 9 regression: create/edit both still route through GlossaryEntryEditorSession hosting GlossaryEditor", () => {
    const paneSource = readFileSync(
      "src/renderer/GlossaryEntryEditorPane.tsx",
      "utf8"
    );
    expect(paneSource).toContain('from "./GlossaryEntryEditorSession"');
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
