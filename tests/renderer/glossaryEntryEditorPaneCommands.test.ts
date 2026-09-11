import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { Translate } from "../../src/shared/i18n";
import {
  createGlossaryEntryEditorPaneCommandTitles,
  glossaryEntryEditorPaneCommandIds,
  registerGlossaryEntryEditorPaneCommands,
  type GlossaryEntryEditorPaneCommandController
} from "../../src/renderer/glossaryEntryEditorPaneCommands";

const translate: Translate = (key) => key;
const executionOptions = { source: "unknown" } as const;

const titles = {
  openCreatePane: "Open create pane",
  openCreatePaneDescription: "Open create pane description",
  openEditPane: "Open edit pane",
  openEditPaneDescription: "Open edit pane description",
  closePane: "Close pane",
  closePaneDescription: "Close pane description",
  openFromEditorSelection: "Open from editor selection",
  openFromEditorSelectionDescription: "Open from editor selection description"
};

function recordingController(): {
  controller: GlossaryEntryEditorPaneCommandController;
  calls: string[];
} {
  const calls: string[] = [];

  return {
    calls,
    controller: {
      openGlossaryEntryCreatePane: (options) => {
        calls.push(`create:${options.source}:${options.presetRepresentative ?? ""}`);
      },
      openGlossaryEntryEditPane: (options) => {
        calls.push(`edit:${options.source}:${options.entryId}`);
      },
      closeGlossaryEntryEditorPane: () => {
        calls.push("close");
      },
      openGlossaryEntryEditorPaneFromSelection: (selectedText) => {
        calls.push(`fromSelection:${selectedText}`);
      }
    }
  };
}

describe("glossary entry editor pane commands — Slice 2 (#436)", () => {
  it("registers the create / edit / close / open-from-selection pane commands under the glossary domain", () => {
    const registry = new CommandRegistry();
    const { controller } = recordingController();

    registerGlossaryEntryEditorPaneCommands(registry, controller, titles);

    expect(registry.list().map((command) => command.id)).toEqual([
      glossaryEntryEditorPaneCommandIds.openCreatePane,
      glossaryEntryEditorPaneCommandIds.openEditPane,
      glossaryEntryEditorPaneCommandIds.closePane,
      glossaryEntryEditorPaneCommandIds.openFromEditorSelection
    ]);
    expect(glossaryEntryEditorPaneCommandIds.openCreatePane).toBe(
      "glossary.openCreateEntryPane"
    );
    expect(glossaryEntryEditorPaneCommandIds.openEditPane).toBe(
      "glossary.openEditEntryPane"
    );
    expect(glossaryEntryEditorPaneCommandIds.closePane).toBe(
      "glossary.closeEntryEditorPane"
    );
    expect(glossaryEntryEditorPaneCommandIds.openFromEditorSelection).toBe(
      "glossary.openFromEditorSelection"
    );
  });

  it("keeps the prepared commands out of the Command Palette for now", () => {
    const registry = new CommandRegistry();
    const { controller } = recordingController();

    registerGlossaryEntryEditorPaneCommands(registry, controller, titles);

    for (const command of registry.list()) {
      expect(command.palette).toEqual({ visible: false });
    }
  });

  it("delegates each command to the controller with its arguments", async () => {
    const registry = new CommandRegistry();
    const { controller, calls } = recordingController();

    registerGlossaryEntryEditorPaneCommands(registry, controller, titles);

    await registry.execute(
      glossaryEntryEditorPaneCommandIds.openCreatePane,
      executionOptions,
      { source: "glossary-pane" }
    );
    await registry.execute(
      glossaryEntryEditorPaneCommandIds.openEditPane,
      executionOptions,
      { source: "glossary-settings", entryId: "entry-9" }
    );
    await registry.execute(
      glossaryEntryEditorPaneCommandIds.closePane,
      executionOptions
    );
    await registry.execute(
      glossaryEntryEditorPaneCommandIds.openFromEditorSelection,
      executionOptions,
      "アリス"
    );

    expect(calls).toEqual([
      "create:glossary-pane:",
      "edit:glossary-settings:entry-9",
      "close",
      "fromSelection:アリス"
    ]);
  });

  it("derives command titles through translate", () => {
    expect(createGlossaryEntryEditorPaneCommandTitles(translate)).toEqual({
      openCreatePane: "command.glossary.openCreateEntryPane",
      openCreatePaneDescription:
        "command.glossary.openCreateEntryPane.description",
      openEditPane: "command.glossary.openEditEntryPane",
      openEditPaneDescription: "command.glossary.openEditEntryPane.description",
      closePane: "command.glossary.closeEntryEditorPane",
      closePaneDescription: "command.glossary.closeEntryEditorPane.description",
      openFromEditorSelection: "command.glossary.openFromEditorSelection",
      openFromEditorSelectionDescription:
        "command.glossary.openFromEditorSelection.description"
    });
  });
});
