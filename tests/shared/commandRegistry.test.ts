import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry,
  DuplicateCommandIdError,
  InvalidCommandIdError,
  UnknownCommandIdError,
  defineCommandId
} from "../../src/shared/commandRegistry";
import { InvalidCommandEnablementExpressionError } from "../../src/shared/commandEnablement";
import {
  commandPaletteCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";

const executionOptions = { source: "commandPalette" } as const;

describe("CommandRegistry", () => {
  it("registers and retrieves a command by stable ID", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.get");
    const command = {
      id: commandId,
      title: "Get command",
      execute: () => undefined
    };

    registry.register(command);

    expect(registry.get(commandId)).toBe(command);
  });

  it("lists registered commands", () => {
    const registry = new CommandRegistry();
    const firstCommandId = defineCommandId("test.command.first");
    const secondCommandId = defineCommandId("test.command.second");

    registry.register({
      id: firstCommandId,
      title: "First",
      execute: () => undefined
    });
    registry.register({
      id: secondCommandId,
      title: "Second",
      execute: () => undefined
    });

    expect(registry.list().map((command) => command.id)).toEqual([
      firstCommandId,
      secondCommandId
    ]);
  });

  it("rejects duplicate Command ID registration", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.duplicate");
    const command = {
      id: commandId,
      title: "Duplicate",
      execute: () => undefined
    };

    registry.register(command);

    expect(() => registry.register(command)).toThrow(DuplicateCommandIdError);
  });

  it("rejects unknown Command ID execution", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.unknown");

    await expect(registry.execute(commandId, executionOptions)).rejects.toThrow(
      UnknownCommandIdError
    );
  });

  it("awaits a sync command", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.sync");
    const execute = vi.fn(() => "sync-result");

    registry.register({
      id: commandId,
      title: "Sync",
      execute
    });

    await expect(registry.execute(commandId, executionOptions)).resolves.toBe(
      "sync-result"
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("awaits an async command", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.async");

    registry.register({
      id: commandId,
      title: "Async",
      execute: async () => "async-result"
    });

    await expect(registry.execute(commandId, executionOptions)).resolves.toBe(
      "async-result"
    );
  });

  it("propagates command arguments and return values", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId<readonly [left: number, right: number], number>(
      "test.command.sum"
    );

    registry.register({
      id: commandId,
      title: "Sum",
      execute: (left, right) => left + right
    });

    await expect(
      registry.execute(commandId, executionOptions, 2, 3)
    ).resolves.toBe(5);
  });

  it("propagates thrown errors as rejected execution", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.throw");
    const error = new Error("boom");

    registry.register({
      id: commandId,
      title: "Throw",
      execute: () => {
        throw error;
      }
    });

    await expect(registry.execute(commandId, executionOptions)).rejects.toBe(
      error
    );
  });

  it("propagates rejected promises as rejected execution", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.reject");
    const error = new Error("rejected");

    registry.register({
      id: commandId,
      title: "Reject",
      execute: async () => {
        throw error;
      }
    });

    await expect(registry.execute(commandId, executionOptions)).rejects.toBe(
      error
    );
  });

  it("preserves command titles independently from Command IDs", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.title");

    registry.register({
      id: commandId,
      title: "Readable title",
      execute: () => undefined
    });

    expect(registry.get(commandId)?.title).toBe("Readable title");
  });

  it("evaluates enablement hooks with command arguments", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId<readonly [entryId: string], void>(
      "test.command.enable"
    );
    const isEnabled = vi.fn((entryId: string) => entryId.length > 0);

    registry.register({
      id: commandId,
      title: "Enable",
      execute: () => undefined,
      isEnabled
    });

    expect(registry.isEnabled(commandId, "entry-1")).toBe(true);
    expect(registry.isEnabled(commandId, "")).toBe(false);
    expect(isEnabled).toHaveBeenLastCalledWith("");
  });

  it("treats commands without enablement hooks as enabled", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.defaultEnabled");

    registry.register({
      id: commandId,
      title: "Default enabled",
      execute: () => undefined
    });

    expect(registry.isEnabled(commandId)).toBe(true);
  });

  it("rejects registration of a command with an invalid when expression", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.invalidWhen");

    expect(() =>
      registry.register({
        id: commandId,
        title: "Invalid when",
        execute: () => undefined,
        when: { allOf: [] }
      })
    ).toThrow(InvalidCommandEnablementExpressionError);
    expect(registry.get(commandId)).toBeNull();
  });

  it("treats a command without a context provider as disabled when it has a when", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.noProvider");
    const execute = vi.fn();

    registry.register({
      id: commandId,
      title: "No provider",
      execute,
      when: { key: "editor.isDirty" }
    });

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("re-evaluates when live against the injected context provider at execute time", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.liveWhen");
    const execute = vi.fn();
    let isDirty = false;

    registry.register({
      id: commandId,
      title: "Live when",
      execute,
      when: { key: "editor.isDirty" }
    });
    registry.setCommandContextProvider(() => ({ "editor.isDirty": isDirty }));

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();

    isDirty = true;
    await registry.execute(commandId, executionOptions);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("emits through the injected onCommandIgnored handler, not command.execute, when when is false", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.ignoredHandler");
    const execute = vi.fn();
    const onCommandIgnored = vi.fn();

    registry.register({
      id: commandId,
      title: "Ignored handler",
      execute,
      when: { key: "editor.isDirty" }
    });
    registry.setCommandContextProvider(() => ({}));
    registry.setOnCommandIgnored(onCommandIgnored);

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toThrow(CommandDisabledError);
    expect(onCommandIgnored).toHaveBeenCalledWith({
      commandId,
      source: "commandPalette"
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not emit onCommandInvoked when command execution is ignored", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.ignoredNoInvoked");
    const execute = vi.fn();
    const onCommandIgnored = vi.fn();
    const onCommandInvoked = vi.fn();

    registry.register({
      id: commandId,
      title: "Ignored no invoked",
      execute,
      when: { key: "editor.isDirty" }
    });
    registry.setCommandContextProvider(() => ({ "editor.isDirty": false }));
    registry.setOnCommandIgnored(onCommandIgnored);
    registry.setOnCommandInvoked(onCommandInvoked);

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);

    expect(onCommandIgnored).toHaveBeenCalledTimes(1);
    expect(onCommandInvoked).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("swallows onCommandIgnored handler failures and still rejects disabled commands", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.ignoredHandlerFailure");
    const error = new Error("ignored handler failed");
    const execute = vi.fn();
    const onCommandIgnored = vi.fn(() => {
      throw error;
    });

    registry.register({
      id: commandId,
      title: "Ignored handler failure",
      execute,
      when: { key: "editor.isDirty" }
    });
    registry.setCommandContextProvider(() => ({ "editor.isDirty": false }));
    registry.setOnCommandIgnored(onCommandIgnored);

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(onCommandIgnored).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("emits onCommandInvoked for direct registry execution immediately before the command body", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.directInvoked");
    const events: string[] = [];
    const onCommandInvoked = vi.fn(() => {
      events.push("invoked");
    });

    registry.register({
      id: commandId,
      title: "Direct invoked",
      execute: async () => {
        events.push("body");
      }
    });
    registry.setOnCommandInvoked(onCommandInvoked);

    await registry.execute(commandId, { source: "workspaceSidebar" });

    expect(onCommandInvoked).toHaveBeenCalledWith({
      commandId,
      source: "workspaceSidebar"
    });
    expect(events).toEqual(["invoked", "body"]);
  });

  it("emits onCommandInvoked exactly once for a single command execution", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.invokedOnce");
    const onCommandInvoked = vi.fn();

    registry.register({
      id: commandId,
      title: "Invoked once",
      execute: () => undefined
    });
    registry.setOnCommandInvoked(onCommandInvoked);

    await registry.execute(commandId, executionOptions);

    expect(onCommandInvoked).toHaveBeenCalledTimes(1);
  });

  it("swallows onCommandInvoked handler failures and still invokes the command body", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.invokedHandlerFailure");
    const error = new Error("invoked handler failed");
    const execute = vi.fn(() => "body result");
    const onCommandInvoked = vi.fn(() => {
      throw error;
    });

    registry.register({
      id: commandId,
      title: "Invoked handler failure",
      execute
    });
    registry.setOnCommandInvoked(onCommandInvoked);

    await expect(registry.execute(commandId, executionOptions)).resolves.toBe(
      "body result"
    );
    expect(onCommandInvoked).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not emit onCommandInvoked or onCommandIgnored for unknown commands", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.unknownBoundary");
    const onCommandIgnored = vi.fn();
    const onCommandInvoked = vi.fn();

    registry.setOnCommandIgnored(onCommandIgnored);
    registry.setOnCommandInvoked(onCommandInvoked);

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(UnknownCommandIdError);

    expect(onCommandIgnored).not.toHaveBeenCalled();
    expect(onCommandInvoked).not.toHaveBeenCalled();
  });

  it("treats unset or reset command logging handlers as no-ops", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.resetHandlers");
    const onCommandIgnored = vi.fn();
    const onCommandInvoked = vi.fn();

    registry.register({
      id: commandId,
      title: "Reset handlers",
      execute: () => undefined
    });
    registry.setOnCommandIgnored(onCommandIgnored);
    registry.setOnCommandInvoked(onCommandInvoked);
    registry.setOnCommandIgnored(null);
    registry.setOnCommandInvoked(null);

    await registry.execute(commandId, executionOptions);

    expect(onCommandIgnored).not.toHaveBeenCalled();
    expect(onCommandInvoked).not.toHaveBeenCalled();
  });

  it("cannot be bypassed by calling execute directly instead of through a UI wrapper", async () => {
    // Regression guard for #128: direct commandRegistry.execute() routes
    // (e.g. createGlossaryEntryFromSidebar, openTrackedGlossaryEntry,
    // editContextMenuBridge) must not be able to run a disabled command's
    // body just because they skip a UI-layer pre-check.
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.directRoute");
    const execute = vi.fn();

    registry.register({
      id: commandId,
      title: "Direct route",
      execute,
      when: { key: "project.isOpen" }
    });
    registry.setCommandContextProvider(() => ({ "project.isOpen": false }));

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects execute when Command.isEnabled returns false, even though when is true", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.legacyIsEnabledBlocksExecute");
    const execute = vi.fn();

    registry.register({
      id: commandId,
      title: "Legacy isEnabled blocks execute",
      execute,
      isEnabled: () => false,
      when: { key: "project.isOpen" }
    });
    registry.setCommandContextProvider(() => ({ "project.isOpen": true }));

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects execute when when evaluates false, even though Command.isEnabled is true", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.whenBlocksExecute");
    const execute = vi.fn();

    registry.register({
      id: commandId,
      title: "when blocks execute",
      execute,
      isEnabled: () => true,
      when: { key: "project.isOpen" }
    });
    registry.setCommandContextProvider(() => ({ "project.isOpen": false }));

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects execute and emits onCommandIgnored exactly once when both isEnabled and when are false", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.bothDisabled");
    const execute = vi.fn();
    const onCommandIgnored = vi.fn();

    registry.register({
      id: commandId,
      title: "Both disabled",
      execute,
      isEnabled: () => false,
      when: { key: "project.isOpen" }
    });
    registry.setCommandContextProvider(() => ({ "project.isOpen": false }));
    registry.setOnCommandIgnored(onCommandIgnored);

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
    expect(onCommandIgnored).toHaveBeenCalledTimes(1);
    expect(onCommandIgnored).toHaveBeenCalledWith({
      commandId,
      source: "commandPalette"
    });
  });

  it("blocks background editor and workbench command execution while an app modal dialog is open", async () => {
    const registry = new CommandRegistry();
    const saveDocument = vi.fn();
    const closeEditor = vi.fn();
    const openCommandPalette = vi.fn();
    const onCommandIgnored = vi.fn();
    let appModalOpen = true;

    registry.register({
      id: editorCommandIds.saveDocument,
      title: "Save",
      execute: saveDocument
    });
    registry.register({
      id: editorCommandIds.close,
      title: "Close editor",
      execute: closeEditor
    });
    registry.register({
      id: commandPaletteCommandIds.open,
      title: "Open Command Palette",
      execute: openCommandPalette
    });
    registry.setCommandExecutionBlocker(() =>
      appModalOpen ? "app_modal_open" : null
    );
    registry.setOnCommandIgnored(onCommandIgnored);

    await expect(
      registry.execute(editorCommandIds.saveDocument, {
        source: "applicationMenu"
      })
    ).rejects.toMatchObject({
      commandId: editorCommandIds.saveDocument,
      reason: "app_modal_open"
    });
    await expect(
      registry.execute(editorCommandIds.close, { source: "documentTabBar" })
    ).rejects.toMatchObject({
      commandId: editorCommandIds.close,
      reason: "app_modal_open"
    });
    await expect(
      registry.execute(commandPaletteCommandIds.open, {
        source: "commandPalette"
      })
    ).rejects.toMatchObject({
      commandId: commandPaletteCommandIds.open,
      reason: "app_modal_open"
    });

    expect(saveDocument).not.toHaveBeenCalled();
    expect(closeEditor).not.toHaveBeenCalled();
    expect(openCommandPalette).not.toHaveBeenCalled();
    expect(onCommandIgnored).toHaveBeenNthCalledWith(1, {
      commandId: editorCommandIds.saveDocument,
      source: "applicationMenu",
      reason: "app_modal_open"
    });
    expect(onCommandIgnored).toHaveBeenNthCalledWith(2, {
      commandId: editorCommandIds.close,
      source: "documentTabBar",
      reason: "app_modal_open"
    });
    expect(onCommandIgnored).toHaveBeenNthCalledWith(3, {
      commandId: commandPaletteCommandIds.open,
      source: "commandPalette",
      reason: "app_modal_open"
    });

    appModalOpen = false;

    await registry.execute(editorCommandIds.saveDocument, {
      source: "applicationMenu"
    });
    await registry.execute(editorCommandIds.close, { source: "documentTabBar" });
    await registry.execute(commandPaletteCommandIds.open, {
      source: "commandPalette"
    });

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(closeEditor).toHaveBeenCalledTimes(1);
    expect(openCommandPalette).toHaveBeenCalledTimes(1);
    expect(onCommandIgnored).toHaveBeenCalledTimes(3);
  });

  it("subjects direct execute() routes to Command.isEnabled too, not only when", async () => {
    // Regression guard for the #128 follow-up: before this change, execute()
    // enforced only `when`; a command disabled solely via legacy
    // Command.isEnabled could still run its body through a direct
    // commandRegistry.execute() route that skips a UI-layer isEnabled
    // pre-check (e.g. createGlossaryEntryFromSidebar, openTrackedGlossaryEntry).
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.directRouteLegacy");
    const execute = vi.fn();

    registry.register({
      id: commandId,
      title: "Direct route, legacy isEnabled only",
      execute,
      isEnabled: () => false
    });

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("evaluates isEnabledForContext from both Command.isEnabled and when", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.enabledForContext");

    registry.register({
      id: commandId,
      title: "Enabled for context",
      execute: () => undefined,
      isEnabled: () => true,
      when: { key: "editor.isDirty" }
    });

    expect(
      registry.isEnabledForContext(commandId, { "editor.isDirty": true })
    ).toBe(true);
    expect(
      registry.isEnabledForContext(commandId, { "editor.isDirty": false })
    ).toBe(false);
  });

  it("evaluates isEnabledForContext as false when legacy isEnabled is false, regardless of when", () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.legacyDisabled");

    registry.register({
      id: commandId,
      title: "Legacy disabled",
      execute: () => undefined,
      isEnabled: () => false
    });

    expect(registry.isEnabledForContext(commandId, {})).toBe(false);
  });

  it("reports readOnlyProject as the context disabled reason", async () => {
    const registry = new CommandRegistry();
    const commandId = defineCommandId("test.command.projectWrite");
    const execute = vi.fn();
    const onCommandIgnored = vi.fn();

    registry.register({
      id: commandId,
      title: "Project write",
      execute,
      when: { key: "project.access.readWrite" }
    });
    registry.setCommandContextProvider(() => ({
      "project.access.readWrite": false,
      "project.access.readOnly": true
    }));
    registry.setOnCommandIgnored(onCommandIgnored);

    expect(
      registry.enablementForContext(commandId, {
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });

    await expect(
      registry.execute(commandId, executionOptions)
    ).rejects.toMatchObject({
      commandId,
      reason: "readOnlyProject"
    });
    expect(onCommandIgnored).toHaveBeenCalledWith({
      commandId,
      source: "commandPalette",
      reason: "readOnlyProject"
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects invalid Command ID syntax", () => {
    expect(() => defineCommandId("invalid command")).toThrow(
      InvalidCommandIdError
    );
    expect(() => defineCommandId("editor")).toThrow(InvalidCommandIdError);
  });

  it("keeps the registry module independent from UI dependencies", () => {
    const source = readFileSync("src/shared/commandRegistry.ts", "utf8");

    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("../renderer");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });
});
