import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

/** A window of App source starting at `header`, for scoped `toContain` checks. */
function region(source: string, header: string, length = 900): string {
  const index = source.indexOf(header);
  expect(index, `App source is missing: ${header}`).toBeGreaterThan(-1);
  return source.slice(index, index + length);
}

// #436 Slice 11: the Glossary Entry Editor Pane's own dirty confirm
// (`glossaryEntryEditorPaneDirtyConfirmation.ts`) — deliberately SEPARATE
// from the existing Markdown `DirtyWorkingCopy` lifecycle machinery (the
// pane's draft was never an open editor). Every choke point that can throw
// away the pane's unsaved draft gates on `confirmGlossaryEntryEditorPaneDirtyIfNeeded`
// (project close/switch/quit/restart/window-close) or the
// `transitionGlossaryEntryEditorPane`/`closeGlossaryEntryEditorPaneWithConfirm`
// helpers (pane close, entry switch, create start).
describe("Glossary Entry Editor Pane dirty confirm wiring (#436 Slice 11)", () => {
  it("gates explicit Project Close BEFORE the existing Markdown dirty-resolution / commit-barrier flow", () => {
    const body = region(
      appSource(),
      "async function closeProject(): Promise<void> {",
      1300
    );

    const glossaryGateIndex = body.indexOf(
      "confirmGlossaryEntryEditorPaneDirtyIfNeeded()"
    );
    const markdownResolveIndex = body.indexOf("resolveDirtyForLifecycle(");

    expect(glossaryGateIndex).toBeGreaterThan(-1);
    expect(markdownResolveIndex).toBeGreaterThan(-1);
    expect(glossaryGateIndex).toBeLessThan(markdownResolveIndex);
  });

  it("gates project switch (confirmProjectSwitch) AFTER the existing Markdown unsaved-documents check", () => {
    const body = region(appSource(), "async function confirmProjectSwitch(): Promise<boolean> {");

    const markdownIndex = body.indexOf("confirmProjectSwitchWithUnsavedDocuments(");
    const glossaryGateIndex = body.indexOf(
      "confirmGlossaryEntryEditorPaneDirtyIfNeeded()"
    );

    expect(markdownIndex).toBeGreaterThan(-1);
    expect(glossaryGateIndex).toBeGreaterThan(-1);
    expect(markdownIndex).toBeLessThan(glossaryGateIndex);

    // createProject / openProject / openRecentProject all funnel through
    // this one function — no need to check each call site separately.
  });

  it("gates quit/restart (runQuitOrRestartFlow) BEFORE the existing Markdown dirty-resolution / commit-barrier flow", () => {
    const body = region(
      appSource(),
      "async function runQuitOrRestartFlow(restartAfterQuit: boolean): Promise<void> {"
    );

    const glossaryGateIndex = body.indexOf(
      "confirmGlossaryEntryEditorPaneDirtyIfNeeded()"
    );
    const markdownResolveIndex = body.indexOf("resolveDirtyForLifecycle(");

    expect(glossaryGateIndex).toBeGreaterThan(-1);
    expect(markdownResolveIndex).toBeGreaterThan(-1);
    expect(glossaryGateIndex).toBeLessThan(markdownResolveIndex);
  });

  it("gates ordinary window close (handleLifecycleWindowCloseRequest) — a cancel declines the close without ever starting the commit-barrier flow", () => {
    const body = region(
      appSource(),
      "async function handleLifecycleWindowCloseRequest(",
      1400
    );

    expect(body).toContain("confirmGlossaryEntryEditorPaneDirtyIfNeeded()");
    expect(body).toContain(
      'decision = { status: "cancelled", requestId: request.requestId };'
    );
    // Still calls respondWindowCloseRequest either way (outside this region) —
    // covered by the function's own pre-existing behavior, unchanged here.
  });

  it("routes every 'open create/edit pane' entry point through transitionGlossaryEntryEditorPane, never setGlossaryEntryEditorPane directly", () => {
    const source = appSource();

    const openEntryBody = region(source, "openGlossaryEntry: async (entryId) => {", 260);
    expect(openEntryBody).toContain("transitionGlossaryEntryEditorPane(");
    expect(openEntryBody).not.toContain("setGlossaryEntryEditorPane(");

    const paneCommandsBody = region(
      source,
      "registerGlossaryEntryEditorPaneCommands(",
      900
    );
    expect(paneCommandsBody).toContain(
      "openGlossaryEntryCreatePane: async (options) => {"
    );
    expect(paneCommandsBody).toContain(
      "openGlossaryEntryEditPane: async (options) => {"
    );
    expect(paneCommandsBody).toContain("transitionGlossaryEntryEditorPane(");
    expect(paneCommandsBody).toContain("closeGlossaryEntryEditorPaneWithConfirm()");
  });

  it("the pane header's onClose (JSX) goes through closeGlossaryEntryEditorPaneWithConfirm, not a direct setGlossaryEntryEditorPane(close...) call", () => {
    const source = appSource();
    const paneStart = source.indexOf("<GlossaryEntryEditorPane\n");
    expect(paneStart).toBeGreaterThan(-1);
    const paneElement = source.slice(paneStart, source.indexOf("/>", paneStart) + 2);

    expect(paneElement).toContain("ref={glossaryEntryEditorSessionHandleRef}");
    expect(paneElement).toContain(
      "onClose={() =>\n                          void closeGlossaryEntryEditorPaneWithConfirm()"
    );
    expect(paneElement).not.toContain("closeGlossaryEntryEditorPane()");
  });

  it("confirmGlossaryEntryEditorPaneDirtyIfNeeded reads the live session handle, not the draft directly", () => {
    const body = region(
      appSource(),
      "async function confirmGlossaryEntryEditorPaneDirtyIfNeeded(): Promise<boolean> {"
    );

    expect(body).toContain("glossaryEntryEditorSessionHandleRef.current");
    expect(body).toContain("confirmGlossaryEntryEditorPaneDiscardOrSave(");
    expect(body).toContain("handle.isDirty()");
    expect(body).toContain("handle.save()");
  });

  it("transitionGlossaryEntryEditorPane skips the confirm entirely for a re-open of the identical target", () => {
    const body = region(
      appSource(),
      "async function transitionGlossaryEntryEditorPane("
    );

    expect(body).toContain("isSameGlossaryEntryEditorPaneTarget(");
    // The identical-target branch sets state directly, before any confirm.
    const sameTargetIndex = body.indexOf("isSameGlossaryEntryEditorPaneTarget(");
    const confirmIndex = body.indexOf("confirmGlossaryEntryEditorPaneDirtyIfNeeded()");
    expect(sameTargetIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(sameTargetIndex);
  });

  it("i18n: the 3-choice dirty-confirm dialog strings exist for ja and en", async () => {
    const { jaTranslations } = await import("../../src/shared/i18n/ja");
    const { enTranslations } = await import("../../src/shared/i18n/en");

    for (const key of [
      "glossaryEntryEditorPane.dirty.title",
      "glossaryEntryEditorPane.dirty.message",
      "glossaryEntryEditorPane.dirty.saveAndContinue",
      "glossaryEntryEditorPane.dirty.discardAndContinue",
      "glossaryEntryEditorPane.dirty.cancel"
    ]) {
      expect(
        (jaTranslations as Record<string, string>)[key],
        `ja missing ${key}`
      ).toBeTruthy();
      expect(
        (enTranslations as Record<string, string>)[key],
        `en missing ${key}`
      ).toBeTruthy();
    }
  });

  it("does not implement Ctrl+G, a right-click menu, or new keybindings (Slice 11 non-goals)", () => {
    const source = appSource();
    expect(source).not.toContain("createEntryFromSelection");
  });

  it("does not revive the old glossaryEntry tab or occurrence navigation UI (regression)", () => {
    const source = appSource();
    expect(source).not.toContain("function createGlossaryEntryFromSidebar");

    const editorSource = readFileSync("src/renderer/GlossaryEditor.tsx", "utf8");
    expect(editorSource).not.toContain("onNavigateToPreviousOccurrence");
    expect(editorSource).not.toContain("onNavigateToNextOccurrence");
  });
});
