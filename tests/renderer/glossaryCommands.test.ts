import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  createGlossaryCommandTitles,
  glossaryCommandIds,
  glossaryTagManagerCommandWhen,
  registerGlossaryCommands
} from "../../src/renderer/glossaryCommands";

const entryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const executionOptions = { source: "workspaceSidebar" } as const;

const allCommandTitles = {
  openEntry: "Open glossary entry",
  manageTags: "Glossary: Manage Tags",
  manageTagsDescription: "Open the glossary tag manager tab.",
  manageEntries: "Glossary: Manage Entries",
  manageEntriesDescription: "Open the glossary management tab."
};

function registerAllGlossaryCommands(
  registry: CommandRegistry,
  overrides: Partial<{
    openGlossaryEntry: () => boolean | Promise<boolean>;
    openGlossaryTagManager: () => boolean | Promise<boolean>;
    openGlossaryEntryManager: () => boolean | Promise<boolean>;
  }> = {}
): void {
  registerGlossaryCommands(
    registry,
    {
      openGlossaryEntry: () => true,
      openGlossaryTagManager: () => true,
      openGlossaryEntryManager: () => true,
      ...overrides
    },
    allCommandTitles
  );

  registry.setCommandContextProvider(() => ({
    "project.isOpen": true,
    "project.access.readWrite": true,
    "project.access.readOnly": false
  }));
}

describe("glossary commands", () => {
  it("registers entry open, tag manager, and entry manager commands", () => {
    const registry = new CommandRegistry();

    registerAllGlossaryCommands(registry);

    // #436 Slice 5: the `glossary.entry.create` command was removed (the
    // Glossary Entry Editor Pane create flow replaces it).
    expect(registry.list().map((command) => command.id)).toEqual([
      "glossary.entry.open",
      "glossary.tag.manage",
      "glossary.entry.manage"
    ]);
    expect(registry.get(glossaryCommandIds.openEntry)?.title).toBe(
      "Open glossary entry"
    );
    expect(registry.get(glossaryCommandIds.manageTags)?.title).toBe(
      "Glossary: Manage Tags"
    );
    expect(registry.get(glossaryCommandIds.manageTags)?.when).toEqual(
      glossaryTagManagerCommandWhen
    );
    // Palette-visible (unlike the entry / occurrence commands).
    expect(registry.get(glossaryCommandIds.manageTags)?.palette).toBeUndefined();
  });

  it("opens the Glossary Tag Manager tab through the tag manage command", async () => {
    const registry = new CommandRegistry();
    const openGlossaryTagManager = vi.fn(() => true);

    registerAllGlossaryCommands(registry, { openGlossaryTagManager });

    await expect(
      registry.execute(glossaryCommandIds.manageTags, executionOptions)
    ).resolves.toBe(true);
    expect(openGlossaryTagManager).toHaveBeenCalledTimes(1);
  });

  it("disables the tag manage command when no project is open", () => {
    const registry = new CommandRegistry();

    registerAllGlossaryCommands(registry);

    expect(
      registry.enablementForContext(glossaryCommandIds.manageTags, {
        "project.isOpen": false,
        "project.access.readWrite": false,
        "project.access.readOnly": false
      }).enabled
    ).toBe(false);
  });

  it("opens Glossary entries through a typed command argument", async () => {
    const registry = new CommandRegistry();
    const openGlossaryEntry = vi.fn(async () => true);

    registerAllGlossaryCommands(registry, { openGlossaryEntry });

    await expect(
      registry.execute(glossaryCommandIds.openEntry, executionOptions, entryId)
    ).resolves.toBe(true);
    expect(openGlossaryEntry).toHaveBeenCalledWith(entryId);
  });

  it("creates localized command titles outside the registry", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createGlossaryCommandTitles(translate)).toEqual({
      openEntry: "translated:command.glossary.entry.open",
      manageTags: "translated:command.glossary.tag.manage",
      manageTagsDescription:
        "translated:command.glossary.tag.manage.description",
      manageEntries: "translated:command.glossary.entry.manage",
      manageEntriesDescription:
        "translated:command.glossary.entry.manage.description"
    });
  });

  it("keeps Glossary command definitions independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/glossaryCommands.ts", "utf8");

    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });
});
