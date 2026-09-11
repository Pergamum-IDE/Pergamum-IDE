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
    const body = region(source, "openGlossaryEntry: (entryId) => {", 260);
    expect(body).toContain(
      'openGlossaryEntryEditPane({ source: "glossary-pane", entryId })'
    );
    expect(body).not.toContain("openEditorFromExplicitActivation");

    // The retired inline create path and its command are gone.
    expect(source).not.toContain("function createGlossaryEntryFromSidebar");
    expect(source).not.toContain("glossaryCommandIds.createEntry");
    expect(source).not.toContain("onCreateGlossaryEntry={");
  });
});
