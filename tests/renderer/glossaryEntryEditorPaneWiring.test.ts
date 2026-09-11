import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glossaryEntryEditorPaneCommandIds } from "../../src/renderer/glossaryEntryEditorPaneCommands";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

/** A window of App source starting at `header`, for scoped `toContain` checks. */
function region(source: string, header: string, length = 480): string {
  const index = source.indexOf(header);
  expect(index, `App source is missing: ${header}`).toBeGreaterThan(-1);
  return source.slice(index, index + length);
}

/** The `<GlossaryEntryManager ... />` element from the App render tree. */
function glossaryEntryManagerElement(source: string): string {
  const start = source.indexOf("<GlossaryEntryManager");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("/>", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 2);
}

describe("Glossary Entry Editor Pane entry-point wiring (#436 Slices 3-4)", () => {
  it("routes the Glossary side pane 語彙を追加 through openCreatePane with source glossary-pane", () => {
    const body = region(
      appSource(),
      "function openGlossaryCreateEntryPaneFromSidebar()"
    );

    expect(body).toContain(
      "glossaryEntryEditorPaneCommandIds.openCreatePane"
    );
    expect(body).toContain('source: "glossary-pane"');
    expect(body).toContain(
      "presetRepresentative: DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE"
    );
  });

  it("routes the Glossary Management 語彙追加 through openCreatePane with source glossary-settings", () => {
    const body = region(
      appSource(),
      "function handleAddGlossaryEntryFromManager()"
    );

    expect(body).toContain(
      "glossaryEntryEditorPaneCommandIds.openCreatePane"
    );
    expect(body).toContain('source: "glossary-settings"');
    expect(body).toContain(
      "presetRepresentative: DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE"
    );
    // It no longer persists a placeholder entry / opens a glossary entry tab.
    expect(body).not.toContain("createGlossaryEntryFromSidebar");
    expect(body).not.toContain("glossary.entryManager.newEntryValue");
  });

  it("routes the Glossary Management per-row edit through openEditPane with source glossary-settings and the entry id", () => {
    const body = region(
      appSource(),
      "function handleEditGlossaryEntryFromManager(entryId: GlossaryEntryId)"
    );

    expect(body).toContain("glossaryEntryEditorPaneCommandIds.openEditPane");
    expect(body).toContain('source: "glossary-settings"');
    expect(body).toContain("entryId");
  });

  it("wires the Glossary Management tab's add / edit props to the pane handlers, not a tab command", () => {
    const element = glossaryEntryManagerElement(appSource());

    expect(element).toContain(
      "onAddEntry={handleAddGlossaryEntryFromManager}"
    );
    expect(element).toContain(
      "onOpenEntry={handleEditGlossaryEntryFromManager}"
    );
    expect(element).not.toContain("glossaryCommandIds.openEntry");
    expect(element).not.toContain("glossaryCommandIds.createEntry");
  });

  it("does not add a Ctrl+G create-from-selection command yet (Slice 8)", () => {
    expect(Object.keys(glossaryEntryEditorPaneCommandIds).sort()).toEqual([
      "closePane",
      "openCreatePane",
      "openEditPane"
    ]);
    expect(appSource()).not.toContain("createEntryFromSelection");
  });

  it("#436 Slice 5: opening a glossary entry (side pane / palette / occurrence) opens the pane, never a glossaryEntry tab", () => {
    const source = appSource();

    // The `glossary.entry.open` controller now opens the Entry Editor Pane.
    const body = region(source, "openGlossaryEntry: async (entryId) => {", 260);
    expect(body).toContain(
      'openGlossaryEntryEditPane({ source: "glossary-pane", entryId })'
    );
    // #436 Slice 11: routed through the dirty-confirm transition helper.
    expect(body).toContain("transitionGlossaryEntryEditorPane(");
    expect(body).not.toContain("openEditorFromExplicitActivation");

    // The retired inline create path and its command are gone.
    expect(source).not.toContain("function createGlossaryEntryFromSidebar");
    expect(source).not.toContain("glossaryCommandIds.createEntry");
    expect(source).not.toContain("onCreateGlossaryEntry={");
  });

  it("#436 Slice 6/9: the pane's create session persists through the glossary create IPC and refreshes, never a tab", () => {
    const source = appSource();

    const handler = region(
      source,
      "async function handleCreateGlossaryEntryFromPane(",
      1400
    );
    expect(handler).toContain("await window.pergamum.glossary.create(input)");
    expect(handler).toContain("setGlossaryRefreshToken((token) => token + 1)");
    // #436 Slice 9: mirrors handleSaveGlossaryEntryFromPane — resolves the
    // saved entry (so the caller can flip create → edit), reuses the SAME
    // save-failed dialog, and rethrows on failure.
    expect(handler).toContain("): Promise<GlossaryEntry> {");
    expect(handler).toContain("showGlossarySaveFailedDialog()");
    expect(handler).not.toContain("openEditor");
    expect(handler).not.toContain("createGlossaryEntryEditorId");
    expect(handler).not.toContain("openDocumentsState");

    // The pane gets the tag list and the create handler.
    const paneStart = source.indexOf("<GlossaryEntryEditorPane\n");
    expect(paneStart).toBeGreaterThan(-1);
    const paneElement = source.slice(
      paneStart,
      source.indexOf("/>", paneStart) + 2
    );
    expect(paneElement).toContain("availableTags={glossaryTags}");
    expect(paneElement).toContain(
      "onCreateEntry={handleCreateGlossaryEntryFromPane}"
    );
    // #436 Slice 9: occurrence navigation is out of the pane entirely — the
    // session/GlossaryEditor no longer accept those props.
    expect(paneElement).not.toContain("onNavigateToPreviousOccurrence");
    expect(paneElement).not.toContain("onNavigateToNextOccurrence");
  });

  it("#436 Slice 6 remediation: the pane sits below the active-tab content region, not inside the Markdown-only branch, and is resizable", () => {
    const source = appSource();

    const bodyStart = source.indexOf(
      '<section className="editorAreaBody" ref={editorAreaBodyRef}>'
    );
    const bodyEnd = source.indexOf('<footer className="statusBar">');
    const body = source.slice(bodyStart, bodyEnd);

    // The tab content is wrapped, and the pane + resize handle are SIBLINGS of
    // that wrapper (so they render under any tab, not only a Markdown doc).
    expect(body).toContain('<div className="editorAreaContent">');
    const contentClose = body.indexOf("</div>");
    const paneCond = body.indexOf("{glossaryEntryEditorPane.isOpen ? (");
    expect(contentClose).toBeGreaterThan(-1);
    expect(paneCond).toBeGreaterThan(contentClose);

    // The Markdown branch no longer wraps EditorSurface + pane in a fragment.
    expect(body).toContain(") : activeDocument ? (\n                    <EditorSurface");

    // A top-edge resize handle drives the pane height.
    expect(body).toContain('className="glossaryEntryEditorPaneResizeHandle"');
    expect(body).toContain(
      "glossaryEntryEditorPaneResizeDrag.onPointerDown"
    );
    expect(body).toContain(
      "height={clampGlossaryEntryEditorPaneHeight("
    );
  });

  it("#436 Slice 6 remediation: the Glossary Management add / edit handlers open the pane without switching the active tab", () => {
    const source = appSource();

    for (const header of [
      "function handleAddGlossaryEntryFromManager()",
      "function handleEditGlossaryEntryFromManager(entryId: GlossaryEntryId)"
    ]) {
      const body = region(source, header, 420);
      expect(body).toContain("executeUiCommand(");
      expect(body).not.toContain("setActiveSpecialTabId");
      expect(body).not.toContain("activateDocument");
      expect(body).not.toContain("openEditor");
    }
  });

  it("#436 Slice 8: edit mode's App handlers reuse the EXISTING glossary getById/update/delete IPC + dialogs, never a tab", () => {
    const source = appSource();

    const loadHandler = region(
      source,
      "async function handleLoadGlossaryEntryFromPane(",
      260
    );
    expect(loadHandler).toContain(
      "return window.pergamum.glossary.getById(entryId)"
    );

    const saveHandler = region(
      source,
      "async function handleSaveGlossaryEntryFromPane(",
      1400
    );
    expect(saveHandler).toContain("await window.pergamum.glossary.update(input)");
    expect(saveHandler).toContain("setGlossaryRefreshToken((token) => token + 1)");
    expect(saveHandler).toContain("showGlossarySaveFailedDialog()");
    expect(saveHandler).not.toContain("openEditor");
    expect(saveHandler).not.toContain("createGlossaryEntryEditorId");
    expect(saveHandler).not.toContain("openDocumentsState");

    const deleteHandler = region(
      source,
      "async function handleDeleteGlossaryEntryFromPane(",
      900
    );
    expect(deleteHandler).toContain("confirmDeleteGlossaryEntry(draft)");
    expect(deleteHandler).toContain(
      "await window.pergamum.glossary.delete(draft.entry.id)"
    );
    expect(deleteHandler).toContain("glossaryDeleteInFlightRef.current");
    expect(deleteHandler).not.toContain("closeOpenEditor");
    expect(deleteHandler).not.toContain("invalidateEditor");

    // The pane gets all three edit-mode handlers.
    const paneStart = source.indexOf("<GlossaryEntryEditorPane\n");
    const paneElement = source.slice(
      paneStart,
      source.indexOf("/>", paneStart) + 2
    );
    expect(paneElement).toContain(
      "onLoadEntry={handleLoadGlossaryEntryFromPane}"
    );
    expect(paneElement).toContain(
      "onSaveEntry={handleSaveGlossaryEntryFromPane}"
    );
    expect(paneElement).toContain(
      "onDeleteEntry={handleDeleteGlossaryEntryFromPane}"
    );
  });

  it("#436 Slice 9: both create and edit route through the SAME GlossaryEntryEditorSession, which hosts the EXISTING GlossaryEditor", () => {
    const paneSource = readFileSync(
      "src/renderer/GlossaryEntryEditorPane.tsx",
      "utf8"
    );
    expect(paneSource).toContain('from "./GlossaryEntryEditorSession"');
    expect(paneSource).toContain("GlossaryEntryEditorSession,");
    // Both branches of the mode ternary render the SAME session component —
    // no separate create-only form.
    expect(
      (paneSource.match(/<GlossaryEntryEditorSession/g) ?? []).length
    ).toBe(2);
    expect(paneSource).toContain('mode="create"');
    expect(paneSource).toContain('mode="edit"');
    // The retired create-only form is at most mentioned in a comment now —
    // never imported or rendered.
    expect(paneSource).not.toContain('from "./GlossaryEntryForm"');
    expect(paneSource).not.toContain("<GlossaryEntryForm");

    const sessionSource = readFileSync(
      "src/renderer/GlossaryEntryEditorSession.tsx",
      "utf8"
    );
    expect(sessionSource).toContain(
      'import { GlossaryEditor } from "./GlossaryEditor"'
    );
    expect(sessionSource).toContain("<GlossaryEditor");
    // `mode` is forwarded to GlossaryEditor based on whether the draft has
    // ever been persisted — not a separately-tracked create/edit flag.
    expect(sessionSource).toContain("mode={isNew ? \"create\" : \"edit\"}");
    expect(sessionSource).toContain("glossaryEntryDraftIsNew(");
    expect(sessionSource).toContain("glossaryEntryDraftCreateInput(");
    expect(sessionSource).toContain("onCreateEntry(");

    // #436 Slice 9: the create-only form is gone entirely.
    expect(() =>
      readFileSync("src/renderer/GlossaryEntryForm.tsx", "utf8")
    ).toThrow();
  });

  it("#436 Slice 9: GlossaryEditor's occurrence navigation UI is gone, but the broader occurrence command system is untouched", () => {
    const editorSource = readFileSync(
      "src/renderer/GlossaryEditor.tsx",
      "utf8"
    );
    expect(editorSource).not.toContain("onNavigateToPreviousOccurrence");
    expect(editorSource).not.toContain("onNavigateToNextOccurrence");
    expect(editorSource).not.toContain("glossaryEditorOccurrenceButton");
    expect(editorSource).toContain("export type GlossaryEditorMode");

    // Out of scope for Slice 9: the occurrence command ids / search system.
    const source = appSource();
    expect(source).toContain("glossaryCommandIds.previousOccurrence");
    expect(source).toContain("glossaryCommandIds.nextOccurrence");
  });
});
