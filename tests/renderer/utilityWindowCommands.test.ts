import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { Translate } from "../../src/shared/i18n";
import {
  createUtilityWindowCommandTitles,
  registerUtilityWindowCommands,
  utilityWindowCommandIds
} from "../../src/renderer/utilityWindowCommands";

const translate: Translate = (key) => key;
const executionOptions = { source: "utilityWindow" } as const;

describe("utility window commands", () => {
  const titles = {
    open: "Open Utility Window",
    openDescription: "Show the Utility Window.",
    close: "Close Utility Window",
    closeDescription: "Hide the Utility Window.",
    toggle: "Toggle Utility Window",
    toggleDescription: "Toggle the Utility Window."
  };

  it("registers open, close, and toggle commands", () => {
    const registry = new CommandRegistry();

    registerUtilityWindowCommands(
      registry,
      {
        openUtilityWindow: () => undefined,
        closeUtilityWindow: () => undefined,
        toggleUtilityWindow: () => undefined
      },
      titles
    );

    expect(registry.list().map((command) => command.id)).toEqual([
      utilityWindowCommandIds.open,
      utilityWindowCommandIds.close,
      utilityWindowCommandIds.toggle
    ]);
  });

  it("opens the Utility Window through the open command", async () => {
    const registry = new CommandRegistry();
    let open = false;

    registerUtilityWindowCommands(
      registry,
      {
        openUtilityWindow: () => {
          open = true;
        },
        closeUtilityWindow: () => {
          open = false;
        },
        toggleUtilityWindow: () => {
          open = !open;
        }
      },
      titles
    );

    await registry.execute(utilityWindowCommandIds.open, executionOptions);
    expect(open).toBe(true);

    await registry.execute(utilityWindowCommandIds.close, executionOptions);
    expect(open).toBe(false);

    await registry.execute(utilityWindowCommandIds.toggle, executionOptions);
    expect(open).toBe(true);

    await registry.execute(utilityWindowCommandIds.toggle, executionOptions);
    expect(open).toBe(false);
  });

  it("derives command titles through translate", () => {
    expect(createUtilityWindowCommandTitles(translate)).toEqual({
      open: "command.workbench.utilityWindow.open",
      openDescription: "command.workbench.utilityWindow.open.description",
      close: "command.workbench.utilityWindow.close",
      closeDescription: "command.workbench.utilityWindow.close.description",
      toggle: "command.workbench.utilityWindow.toggle",
      toggleDescription: "command.workbench.utilityWindow.toggle.description"
    });
  });
});
