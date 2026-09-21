import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("toolbar command wiring", () => {
  it("does not execute disabled UI commands, relying on the registry's own enablement check", () => {
    // #128 follow-up: enablement (both legacy Command.isEnabled and when) is
    // enforced once, inside CommandRegistry.execute, so every execute() call
    // site — including direct registry routes — is covered the same way.
    // executeUiCommand must not re-implement its own pre-check.
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const startIndex = source.indexOf("function executeUiCommand<");
    const endIndex = source.indexOf(
      "executeUiCommandRef.current = (commandId) => {"
    );
    const executeUiCommandSource = source.slice(startIndex, endIndex);

    expect(executeUiCommandSource).not.toContain("commandRegistry.isEnabled(");
    expect(executeUiCommandSource).toContain(
      "if (error instanceof CommandDisabledError) {"
    );
  });

  it("logs command.ignored with a registry-supplied reason and disabled_command fallback", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const handlerIndex = source.indexOf("registry.setOnCommandIgnored(");
    const returnRegistryIndex = source.indexOf("return registry;");

    expect(handlerIndex).toBeGreaterThan(-1);
    expect(returnRegistryIndex).toBeGreaterThan(-1);
    expect(handlerIndex).toBeLessThan(returnRegistryIndex);

    const handlerBlock = source.slice(handlerIndex, returnRegistryIndex);

    expect(handlerBlock).toContain('event: "command.ignored"');
    expect(handlerBlock).toContain('level: "debug"');
    expect(handlerBlock).toContain("source: event.source");
    expect(handlerBlock).toContain('result: "ignored"');
    expect(handlerBlock).toContain('reason: event.reason ?? "disabled_command"');
    expect(source).not.toContain('event: "command.succeeded"');
  });

  it("logs command.invoked from the registry's onCommandInvoked handler", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const handlerIndex = source.indexOf("registry.setOnCommandInvoked(");
    const returnRegistryIndex = source.indexOf("return registry;");

    expect(handlerIndex).toBeGreaterThan(-1);
    expect(returnRegistryIndex).toBeGreaterThan(-1);
    expect(handlerIndex).toBeLessThan(returnRegistryIndex);

    const handlerBlock = source.slice(handlerIndex, returnRegistryIndex);

    expect(handlerBlock).toContain('event: "command.invoked"');
    expect(handlerBlock).toContain("commandId: event.commandId");
    expect(handlerBlock).toContain("source: event.source");
  });

  it("keeps UI command.failed emission after registry execution", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const startIndex = source.indexOf("function executeUiCommand<");
    const endIndex = source.indexOf(
      "executeUiCommandRef.current = (commandId) => {"
    );

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);

    const executeUiCommandSource = source.slice(startIndex, endIndex);
    const registryExecuteIndex = executeUiCommandSource.indexOf(
      "commandRegistry.execute(commandId, options, ...args).catch"
    );
    const commandFailedIndex = executeUiCommandSource.indexOf(
      'event: "command.failed"'
    );

    expect(registryExecuteIndex).toBeGreaterThan(-1);
    expect(commandFailedIndex).toBeGreaterThan(registryExecuteIndex);
    expect(executeUiCommandSource).not.toContain('event: "command.invoked"');
  });

  it("emits command.ignored from exactly one place for disabled commands", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const occurrences = source.match(/event: "command\.ignored"/g) ?? [];

    expect(occurrences).toHaveLength(1);
  });

  it("keeps executeUiCommand free of raw key, selection, clipboard, and content logging", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const startIndex = source.indexOf("function executeUiCommand<");
    const endIndex = source.indexOf(
      "executeUiCommandRef.current = (commandId) => {"
    );

    expect(startIndex).toBeGreaterThan(-1);
    expect(endIndex).toBeGreaterThan(startIndex);

    const executeUiCommandSource = source.slice(startIndex, endIndex);

    expect(executeUiCommandSource).not.toContain('event: "command.invoked"');
    expect(executeUiCommandSource).not.toContain("KeyboardEvent");
    expect(executeUiCommandSource).not.toContain("selectedText");
    expect(executeUiCommandSource).not.toContain("selectionText");
    expect(executeUiCommandSource).not.toContain("clipboard");
    expect(executeUiCommandSource).not.toContain("surface");
    expect(executeUiCommandSource).not.toContain("description");
    expect(executeUiCommandSource).not.toContain("innerText");
    expect(executeUiCommandSource).not.toContain("textContent");
    expect(executeUiCommandSource).not.toContain(".value");
    expect(executeUiCommandSource).not.toContain("path");
  });
});
