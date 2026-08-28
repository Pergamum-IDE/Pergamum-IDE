import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("command palette wiring", () => {
  it("registers the command palette open command with a no-op re-open", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain("registerCommandPaletteCommands(");
    expect(source).toContain(
      "setIsCommandPaletteOpen((isOpen) => (isOpen ? isOpen : true));"
    );
  });

  it("mounts the Command Palette only while open, inside the app shell", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const mainCloseIndex = source.lastIndexOf("</main>");
    const paletteIndex = source.indexOf("isCommandPaletteOpen ? (");
    const componentIndex = source.indexOf("<CommandPalette");

    expect(paletteIndex).toBeGreaterThan(-1);
    expect(componentIndex).toBeGreaterThan(paletteIndex);
    expect(componentIndex).toBeLessThan(mainCloseIndex);
  });

  it("executes selected commands through the existing executeUiCommand path", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);

    expect(propsBlock).toContain("onExecuteCommand={(commandId, ...args) => {");
    expect(propsBlock).toContain(
      'executeUiCommand(commandId, { source: "commandPalette" }, ...args);'
    );
    expect(propsBlock).toContain(
      "closeCommandPaletteAndRestoreMarkdownFocus();"
    );
    expect(propsBlock).toContain(
      "onClose={closeCommandPaletteAndRestoreMarkdownFocus}"
    );
  });

  it("reuses the existing IME composition guard instead of a new tracking mechanism", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);

    expect(propsBlock).toContain(
      "isComposing={imeCompositionSaveGuard.isComposing}"
    );
  });

  it("does not add new command.invoked emission points for the palette", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).not.toContain("command.invoked");
    expect(source).not.toContain("logRendererDebugEvent");
  });

  it("has no logging calls at all, so the search query cannot leak into debug logs", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).not.toContain("logRendererDebugEvent");
    expect(source).not.toContain("console.log");
    expect(source).not.toContain(".log(");
    expect(source).not.toContain("clipboard");
  });

  it("passes an eager command context snapshot down to the Palette", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);

    expect(propsBlock).toContain("commandContext={commandContext}");
  });

  it("wires a debug-only command.blocked emission for UI-level disabled blocks, distinct from command.ignored", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const componentIndex = source.indexOf("<CommandPalette");
    const closeIndex = source.indexOf("/>", componentIndex);
    const propsBlock = source.slice(componentIndex, closeIndex);
    const blockedStart = propsBlock.indexOf("onBlockedCommand={");
    const blockedBlock = propsBlock.slice(blockedStart);

    expect(blockedStart).toBeGreaterThan(-1);
    expect(blockedBlock).toContain('event: "command.blocked"');
    expect(blockedBlock).toContain('source: "commandPalette"');
    expect(blockedBlock).toContain('reason: "disabled_command"');
    expect(blockedBlock).toContain('level: "debug"');
    expect(blockedBlock).not.toContain("commandRegistry.execute");
    expect(blockedBlock).not.toContain("executeUiCommand(");
    expect(blockedBlock).not.toContain("inputValue");
    expect(blockedBlock).not.toContain("query");
    expect(blockedBlock).not.toContain("selection");
  });
});
