import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry
} from "../../src/shared/commandRegistry";
import {
  createGlossaryCommandTitles,
  glossaryCommandIds,
  glossaryWriteCommandWhen,
  registerGlossaryCommands
} from "../../src/renderer/glossaryCommands";

const entryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const executionOptions = { source: "workspaceSidebar" } as const;

const allCommandTitles = {
  openEntry: "Open glossary entry",
  createEntry: "Create glossary entry",
  previousOccurrence: "Previous occurrence",
  nextOccurrence: "Next occurrence"
};

function registerAllGlossaryCommands(
  registry: CommandRegistry,
  overrides: Partial<{
    openGlossaryEntry: () => boolean | Promise<boolean>;
    createGlossaryEntry: () => boolean | Promise<boolean>;
    navigateToPreviousGlossaryOccurrence: (
      entryId: string
    ) => boolean | Promise<boolean>;
    navigateToNextGlossaryOccurrence: (
      entryId: string
    ) => boolean | Promise<boolean>;
  }> = {}
): void {
  registerGlossaryCommands(
    registry,
    {
      openGlossaryEntry: () => true,
      createGlossaryEntry: () => true,
      navigateToPreviousGlossaryOccurrence: () => true,
      navigateToNextGlossaryOccurrence: () => true,
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
  it("registers the Glossary entry open, create, and occurrence navigation commands", () => {
    const registry = new CommandRegistry();

    registerAllGlossaryCommands(registry);

    expect(registry.list().map((command) => command.id)).toEqual([
      "glossary.entry.open",
      "glossary.entry.create",
      "glossary.entry.occurrences.previous",
      "glossary.entry.occurrences.next"
    ]);
    expect(registry.get(glossaryCommandIds.openEntry)?.title).toBe(
      "Open glossary entry"
    );
    expect(registry.get(glossaryCommandIds.createEntry)?.title).toBe(
      "Create glossary entry"
    );
    expect(registry.get(glossaryCommandIds.createEntry)?.when).toEqual(
      glossaryWriteCommandWhen
    );
    expect(registry.get(glossaryCommandIds.previousOccurrence)?.title).toBe(
      "Previous occurrence"
    );
    expect(registry.get(glossaryCommandIds.nextOccurrence)?.title).toBe(
      "Next occurrence"
    );
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

  it("creates Glossary entries through a typed command argument", async () => {
    const registry = new CommandRegistry();
    const createGlossaryEntry = vi.fn(async () => true);
    const input = {
      description: "",
      atoms: [{ value: "王都", matchFlags: 0 }],
      tagIds: []
    };

    registerAllGlossaryCommands(registry, { createGlossaryEntry });

    await expect(
      registry.execute(glossaryCommandIds.createEntry, executionOptions, input)
    ).resolves.toBe(true);
    expect(createGlossaryEntry).toHaveBeenCalledWith(input);
  });

  it("disables Glossary entry create in read-only project sessions", async () => {
    const registry = new CommandRegistry();
    const createGlossaryEntry = vi.fn(async () => true);
    const input = {
      description: "",
      atoms: [{ value: "王都", matchFlags: 0 }],
      tagIds: []
    };

    registerAllGlossaryCommands(registry, { createGlossaryEntry });
    registry.setCommandContextProvider(() => ({
      "project.isOpen": true,
      "project.access.readWrite": false,
      "project.access.readOnly": true
    }));

    expect(
      registry.enablementForContext(glossaryCommandIds.createEntry, {
        "project.isOpen": true,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });
    await expect(
      registry.execute(glossaryCommandIds.createEntry, executionOptions, input)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(createGlossaryEntry).not.toHaveBeenCalled();
  });

  it("navigates to the previous Glossary occurrence through a typed entryId command argument", async () => {
    const registry = new CommandRegistry();
    const navigateToPreviousGlossaryOccurrence = vi.fn(async () => true);

    registerAllGlossaryCommands(registry, {
      navigateToPreviousGlossaryOccurrence
    });

    await expect(
      registry.execute(
        glossaryCommandIds.previousOccurrence,
        executionOptions,
        entryId
      )
    ).resolves.toBe(true);
    expect(navigateToPreviousGlossaryOccurrence).toHaveBeenCalledWith(
      entryId
    );
  });

  it("navigates to the next Glossary occurrence through a typed entryId command argument", async () => {
    const registry = new CommandRegistry();
    const navigateToNextGlossaryOccurrence = vi.fn(async () => true);

    registerAllGlossaryCommands(registry, {
      navigateToNextGlossaryOccurrence
    });

    await expect(
      registry.execute(
        glossaryCommandIds.nextOccurrence,
        executionOptions,
        entryId
      )
    ).resolves.toBe(true);
    expect(navigateToNextGlossaryOccurrence).toHaveBeenCalledWith(entryId);
  });

  it("creates localized command titles outside the registry", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createGlossaryCommandTitles(translate)).toEqual({
      openEntry: "translated:command.glossary.entry.open",
      createEntry: "translated:command.glossary.entry.create",
      previousOccurrence:
        "translated:command.glossary.entry.occurrences.previous",
      nextOccurrence: "translated:command.glossary.entry.occurrences.next"
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
