import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { knownDebugLogCommandIds } from "../../src/shared/debugLog";
import {
  CORE_COMMAND_DOMAINS
} from "../../src/shared/commandTaxonomy";
import {
  createDebugLogCommandTitles,
  debugLogCommandIds,
  registerDebugLogCommands
} from "../../src/renderer/debugLogCommands";

const titles = {
  open: "Open Debug Log",
  openDescription: "Open the Debug Log tab."
};
const executionOptions = { source: "activityBar" } as const;

describe("debug log commands (#377)", () => {
  it("registers a single workbench-domain open command", () => {
    const registry = new CommandRegistry();

    registerDebugLogCommands(registry, { openDebugLog: () => undefined }, titles);

    expect(registry.list().map((command) => command.id)).toEqual([
      "workbench.debugLog.open"
    ]);
    expect(debugLogCommandIds.open).toBe("workbench.debugLog.open");
    expect(CORE_COMMAND_DOMAINS).toContain(
      String(debugLogCommandIds.open).split(".")[0]
    );
  });

  it("routes execution to the controller's openDebugLog", async () => {
    const registry = new CommandRegistry();
    const openDebugLog = vi.fn();

    registerDebugLogCommands(registry, { openDebugLog }, titles);

    await registry.execute(debugLogCommandIds.open, executionOptions);

    expect(openDebugLog).toHaveBeenCalledTimes(1);
  });

  it("stays visible in the Command Palette (opt-out flag not set)", () => {
    const registry = new CommandRegistry();

    registerDebugLogCommands(registry, { openDebugLog: () => undefined }, titles);

    expect(registry.get(debugLogCommandIds.open)?.palette?.visible).not.toBe(
      false
    );
  });

  it("is a known debug-log command id so its invocation logs cleanly", () => {
    expect(knownDebugLogCommandIds).toContain("workbench.debugLog.open");
  });

  it("creates localized command titles from command i18n keys", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createDebugLogCommandTitles(translate)).toEqual({
      open: "translated:command.workbench.debugLog.open",
      openDescription: "translated:command.workbench.debugLog.open.description"
    });
  });

  it("keeps the command definition independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/debugLogCommands.ts", "utf8");

    expect(source).not.toContain('from "react"');
    expect(source).not.toContain("window.");
    expect(source).not.toContain("JSX");
  });
});
