/**
 * #542: Toolbar Command Box unit tests.
 *
 * Tests the mode cycle logic, placeholder mapping, and initialPrefix values.
 * These are pure logic tests that do not require a DOM or React renderer.
 */

import { describe, expect, it } from "vitest";
import {
  TOOLBAR_COMMAND_BOX_DEFAULT_INDEX,
  TOOLBAR_COMMAND_BOX_MODES,
  nextToolbarCommandBoxModeIndex,
  resolveToolbarCommandBoxModeEntry,
  type ToolbarCommandBoxMode
} from "../../src/renderer/toolbarCommandBoxModes";

describe("TOOLBAR_COMMAND_BOX_MODES", () => {
  it("has 6 modes in the cycle", () => {
    expect(TOOLBAR_COMMAND_BOX_MODES).toHaveLength(6);
  });

  it("starts with commands mode (initial index is 0)", () => {
    expect(TOOLBAR_COMMAND_BOX_DEFAULT_INDEX).toBe(0);
    expect(TOOLBAR_COMMAND_BOX_MODES[0].mode).toBe("commands");
  });

  it("has the correct cycle order: commands → projectFiles → headings → glossary → lineJump → projectSearch", () => {
    const expectedOrder: ToolbarCommandBoxMode[] = [
      "commands",
      "projectFiles",
      "headings",
      "glossary",
      "lineJump",
      "projectSearch"
    ];

    const actualOrder = TOOLBAR_COMMAND_BOX_MODES.map((entry) => entry.mode);

    expect(actualOrder).toEqual(expectedOrder);
  });

  it("maps each mode to the correct initialPrefix", () => {
    const prefixes = TOOLBAR_COMMAND_BOX_MODES.map((entry) => ({
      mode: entry.mode,
      prefix: entry.initialPrefix
    }));

    expect(prefixes).toEqual([
      { mode: "commands", prefix: ">" },
      { mode: "projectFiles", prefix: "" },
      { mode: "headings", prefix: "#" },
      { mode: "glossary", prefix: "@" },
      { mode: "lineJump", prefix: ":" },
      { mode: "projectSearch", prefix: "%" }
    ]);
  });

  it("uses '' (empty string) for projectFiles prefix, not '>'", () => {
    const fileMode = TOOLBAR_COMMAND_BOX_MODES.find(
      (e) => e.mode === "projectFiles"
    );

    expect(fileMode).toBeDefined();
    expect(fileMode!.initialPrefix).toBe("");
    expect(fileMode!.initialPrefix).not.toBe(">");
  });

  it("maps each mode to the correct placeholder i18n key", () => {
    const keys = TOOLBAR_COMMAND_BOX_MODES.map((entry) => ({
      mode: entry.mode,
      key: entry.placeholderKey
    }));

    expect(keys).toEqual([
      {
        mode: "commands",
        key: "toolbar.commandBox.placeholder.commands"
      },
      {
        mode: "projectFiles",
        key: "toolbar.commandBox.placeholder.projectFiles"
      },
      {
        mode: "headings",
        key: "toolbar.commandBox.placeholder.headings"
      },
      {
        mode: "glossary",
        key: "toolbar.commandBox.placeholder.glossary"
      },
      {
        mode: "lineJump",
        key: "toolbar.commandBox.placeholder.lineJump"
      },
      {
        mode: "projectSearch",
        key: "toolbar.commandBox.placeholder.projectSearch"
      }
    ]);
  });

  it("maps each mode to the correct launcher aria-label i18n key", () => {
    const keys = TOOLBAR_COMMAND_BOX_MODES.map((entry) => ({
      mode: entry.mode,
      key: entry.launcherLabelKey
    }));

    expect(keys).toEqual([
      { mode: "commands", key: "toolbar.commandBox.open.commands" },
      { mode: "projectFiles", key: "toolbar.commandBox.open.projectFiles" },
      { mode: "headings", key: "toolbar.commandBox.open.headings" },
      { mode: "glossary", key: "toolbar.commandBox.open.glossary" },
      { mode: "lineJump", key: "toolbar.commandBox.open.lineJump" },
      { mode: "projectSearch", key: "toolbar.commandBox.open.projectSearch" }
    ]);
  });
});

describe("nextToolbarCommandBoxModeIndex", () => {
  it("advances from commands (0) to projectFiles (1)", () => {
    expect(nextToolbarCommandBoxModeIndex(0)).toBe(1);
  });

  it("advances from projectFiles (1) to headings (2)", () => {
    expect(nextToolbarCommandBoxModeIndex(1)).toBe(2);
  });

  it("advances from headings (2) to glossary (3)", () => {
    expect(nextToolbarCommandBoxModeIndex(2)).toBe(3);
  });

  it("advances from glossary (3) to lineJump (4)", () => {
    expect(nextToolbarCommandBoxModeIndex(3)).toBe(4);
  });

  it("advances from lineJump (4) to projectSearch (5)", () => {
    expect(nextToolbarCommandBoxModeIndex(4)).toBe(5);
  });

  it("wraps from projectSearch (5) back to commands (0)", () => {
    expect(nextToolbarCommandBoxModeIndex(5)).toBe(0);
  });

  it("performs a full cycle back to the start", () => {
    const total = TOOLBAR_COMMAND_BOX_MODES.length;
    let index = TOOLBAR_COMMAND_BOX_DEFAULT_INDEX;

    for (let i = 0; i < total; i++) {
      index = nextToolbarCommandBoxModeIndex(index);
    }

    expect(index).toBe(TOOLBAR_COMMAND_BOX_DEFAULT_INDEX);
  });

  it("prefix cycle corresponds to: > → '' → # → @ → : → %", () => {
    const expectedPrefixes = [">", "", "#", "@", ":", "%"];
    let index = 0;

    for (const expectedPrefix of expectedPrefixes) {
      expect(TOOLBAR_COMMAND_BOX_MODES[index].initialPrefix).toBe(
        expectedPrefix
      );
      index = nextToolbarCommandBoxModeIndex(index);
    }

    // After full cycle, back at start
    expect(index).toBe(0);
  });
});

describe("resolveToolbarCommandBoxModeEntry", () => {
  it("resolves the default entry at index 0", () => {
    const entry = resolveToolbarCommandBoxModeEntry(0);
    expect(entry.mode).toBe("commands");
    expect(entry.initialPrefix).toBe(">");
  });

  it("resolves the projectFiles entry at index 1", () => {
    const entry = resolveToolbarCommandBoxModeEntry(1);
    expect(entry.mode).toBe("projectFiles");
    expect(entry.initialPrefix).toBe("");
  });

  it("resolves the headings entry at index 2", () => {
    const entry = resolveToolbarCommandBoxModeEntry(2);
    expect(entry.mode).toBe("headings");
    expect(entry.initialPrefix).toBe("#");
  });

  it("resolves the glossary entry at index 3", () => {
    const entry = resolveToolbarCommandBoxModeEntry(3);
    expect(entry.mode).toBe("glossary");
    expect(entry.initialPrefix).toBe("@");
  });

  it("resolves the lineJump entry at index 4", () => {
    const entry = resolveToolbarCommandBoxModeEntry(4);
    expect(entry.mode).toBe("lineJump");
    expect(entry.initialPrefix).toBe(":");
  });

  it("resolves the projectSearch entry at index 5", () => {
    const entry = resolveToolbarCommandBoxModeEntry(5);
    expect(entry.mode).toBe("projectSearch");
    expect(entry.initialPrefix).toBe("%");
  });

  it("falls back to the default entry for an out-of-range index", () => {
    const entry = resolveToolbarCommandBoxModeEntry(999);
    expect(entry.mode).toBe("commands");
    expect(entry.initialPrefix).toBe(">");
  });
});

describe("Command Box App.tsx wiring (source-level assertions)", () => {
  it("Ctrl+P (#554) command handler explicitly sets initialInputValue to '>'", () => {
    const { readFileSync } = require("node:fs");
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    // Find the openCommandPalette command registration block
    const registrationStart = source.indexOf("openCommandPalette: () => {");
    const registrationEnd = source.indexOf(
      "createCommandPaletteCommandTitles",
      registrationStart
    );

    expect(registrationStart).toBeGreaterThan(-1);
    expect(registrationEnd).toBeGreaterThan(registrationStart);

    const block = source.slice(registrationStart, registrationEnd);

    expect(block).toContain('setCommandPaletteInitialInputValue(">")');
    expect(block).toContain("setIsCommandPaletteOpen");
  });

  it("openCommandPaletteWithPrefix function does not collapse empty string to '>'", () => {
    const { readFileSync } = require("node:fs");
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    const funcStart = source.indexOf("function openCommandPaletteWithPrefix(");
    const funcEnd = source.indexOf("\n  }", funcStart);

    expect(funcStart).toBeGreaterThan(-1);
    expect(funcEnd).toBeGreaterThan(funcStart);

    const funcBody = source.slice(funcStart, funcEnd);

    // Must NOT use || which would collapse empty string
    expect(funcBody).not.toContain('initialPrefix || ">"');
    expect(funcBody).not.toContain("initialPrefix || '>'");
    // setCommandPaletteInitialInputValue must be called with the raw prefix
    expect(funcBody).toContain(
      "setCommandPaletteInitialInputValue(initialPrefix)"
    );
  });

  it("CommandPalette JSX receives initialInputValue from commandPaletteInitialInputValue state", () => {
    const { readFileSync } = require("node:fs");
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "initialInputValue={commandPaletteInitialInputValue}"
    );
  });

  it("EditorToolbar receives onOpenCommandPalette={openCommandPaletteWithPrefix}", () => {
    const { readFileSync } = require("node:fs");
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "onOpenCommandPalette={openCommandPaletteWithPrefix}"
    );
  });
});
