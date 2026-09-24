import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { Translate } from "../../src/shared/i18n";
import {
  createGlossaryEntryTabCommandTitles,
  glossaryEntryTabCommandIds,
  registerGlossaryEntryTabCommands,
  type GlossaryEntryTabCommandController
} from "../../src/renderer/glossaryEntryTabCommands";

const translate: Translate = (key) => key;
const executionOptions = { source: "unknown" } as const;

const titles = {
  openNewEntryTab: "Open new entry tab",
  openNewEntryTabDescription: "Open new entry tab description",
  openEntryTab: "Open entry tab",
  openEntryTabDescription: "Open entry tab description",
  openFromEditorSelection: "Open from editor selection",
  openFromEditorSelectionDescription: "Open from editor selection description"
};

function recordingController(): {
  controller: GlossaryEntryTabCommandController;
  calls: string[];
} {
  const calls: string[] = [];

  return {
    calls,
    controller: {
      openNewGlossaryEntryTab: (options) => {
        calls.push(`create:${options.source}:${options.presetRepresentative ?? ""}`);
      },
      openGlossaryEntryTab: (options) => {
        calls.push(`edit:${options.source}:${options.entryId}`);
      },
      openGlossaryEntryTabFromSelection: (selectedText) => {
        calls.push(`fromSelection:${selectedText}`);
      }
    }
  };
}

describe("glossary entry tab commands — Slice 2 (#436, renamed #574 Slice 5)", () => {
  it("registers the create / edit / open-from-selection commands under the glossary domain (#573 Slice 7: no closePane)", () => {
    const registry = new CommandRegistry();
    const { controller } = recordingController();

    registerGlossaryEntryTabCommands(registry, controller, titles);

    expect(registry.list().map((command) => command.id)).toEqual([
      glossaryEntryTabCommandIds.openNewEntryTab,
      glossaryEntryTabCommandIds.openEntryTab,
      glossaryEntryTabCommandIds.openFromEditorSelection
    ]);
    expect(Object.keys(glossaryEntryTabCommandIds)).not.toContain(
      "closePane"
    );
    expect(glossaryEntryTabCommandIds.openNewEntryTab).toBe(
      "glossary.openCreateEntryPane"
    );
    expect(glossaryEntryTabCommandIds.openEntryTab).toBe(
      "glossary.openEditEntryPane"
    );
    expect(glossaryEntryTabCommandIds.openFromEditorSelection).toBe(
      "glossary.openFromEditorSelection"
    );
  });

  it("keeps the prepared commands out of the Command Palette for now", () => {
    const registry = new CommandRegistry();
    const { controller } = recordingController();

    registerGlossaryEntryTabCommands(registry, controller, titles);

    for (const command of registry.list()) {
      expect(command.palette).toEqual({ visible: false });
    }
  });

  it("delegates each command to the controller with its arguments", async () => {
    const registry = new CommandRegistry();
    const { controller, calls } = recordingController();

    registerGlossaryEntryTabCommands(registry, controller, titles);

    await registry.execute(
      glossaryEntryTabCommandIds.openNewEntryTab,
      executionOptions,
      { source: "glossary-pane" }
    );
    await registry.execute(
      glossaryEntryTabCommandIds.openEntryTab,
      executionOptions,
      { source: "glossary-settings", entryId: "entry-9" }
    );
    await registry.execute(
      glossaryEntryTabCommandIds.openFromEditorSelection,
      executionOptions,
      "アリス"
    );

    expect(calls).toEqual([
      "create:glossary-pane:",
      "edit:glossary-settings:entry-9",
      "fromSelection:アリス"
    ]);
  });

  it("derives command titles through translate", () => {
    expect(createGlossaryEntryTabCommandTitles(translate)).toEqual({
      openNewEntryTab: "command.glossary.openCreateEntryPane",
      openNewEntryTabDescription:
        "command.glossary.openCreateEntryPane.description",
      openEntryTab: "command.glossary.openEditEntryPane",
      openEntryTabDescription: "command.glossary.openEditEntryPane.description",
      openFromEditorSelection: "command.glossary.openFromEditorSelection",
      openFromEditorSelectionDescription:
        "command.glossary.openFromEditorSelection.description"
    });
  });
});
