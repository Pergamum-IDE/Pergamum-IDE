import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntryId
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";

export const glossaryCommandIds = {
  openEntry: defineCommandId<readonly [entryId: GlossaryEntryId], boolean>(
    "glossary.entry.open"
  ),
  createEntry: defineCommandId<
    readonly [input: CreateGlossaryEntryInput],
    boolean
  >("glossary.entry.create"),
  previousOccurrence: defineCommandId<
    readonly [entryId: GlossaryEntryId],
    boolean
  >("glossary.entry.occurrences.previous"),
  nextOccurrence: defineCommandId<
    readonly [entryId: GlossaryEntryId],
    boolean
  >("glossary.entry.occurrences.next")
} as const;

export const glossaryWriteCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }, { key: "project.access.readWrite" }]
};

export interface GlossaryCommandController {
  openGlossaryEntry(entryId: GlossaryEntryId): boolean | Promise<boolean>;
  createGlossaryEntry(
    input: CreateGlossaryEntryInput
  ): boolean | Promise<boolean>;
  navigateToPreviousGlossaryOccurrence(
    entryId: GlossaryEntryId
  ): boolean | Promise<boolean>;
  navigateToNextGlossaryOccurrence(
    entryId: GlossaryEntryId
  ): boolean | Promise<boolean>;
}

export interface GlossaryCommandTitles {
  openEntry: string;
  createEntry: string;
  previousOccurrence: string;
  nextOccurrence: string;
}

type OpenGlossaryEntryCommand = Command<
  readonly [entryId: GlossaryEntryId],
  boolean
>;

type CreateGlossaryEntryCommand = Command<
  readonly [input: CreateGlossaryEntryInput],
  boolean
>;

type PreviousGlossaryOccurrenceCommand = Command<
  readonly [entryId: GlossaryEntryId],
  boolean
>;

type NextGlossaryOccurrenceCommand = Command<
  readonly [entryId: GlossaryEntryId],
  boolean
>;

export function createGlossaryCommandTitles(
  translate: Translate
): GlossaryCommandTitles {
  return {
    openEntry: translate("command.glossary.entry.open"),
    createEntry: translate("command.glossary.entry.create"),
    previousOccurrence: translate("command.glossary.entry.occurrences.previous"),
    nextOccurrence: translate("command.glossary.entry.occurrences.next")
  };
}

export function createGlossaryCommands(
  controller: GlossaryCommandController,
  titles: GlossaryCommandTitles
): readonly [
  OpenGlossaryEntryCommand,
  CreateGlossaryEntryCommand,
  PreviousGlossaryOccurrenceCommand,
  NextGlossaryOccurrenceCommand
] {
  return [
    {
      id: glossaryCommandIds.openEntry,
      title: titles.openEntry,
      palette: { visible: false },
      execute: (entryId) => controller.openGlossaryEntry(entryId)
    },
    {
      id: glossaryCommandIds.createEntry,
      title: titles.createEntry,
      palette: { visible: false },
      when: glossaryWriteCommandWhen,
      execute: (input) => controller.createGlossaryEntry(input)
    },
    {
      id: glossaryCommandIds.previousOccurrence,
      title: titles.previousOccurrence,
      palette: { visible: false },
      execute: (entryId) =>
        controller.navigateToPreviousGlossaryOccurrence(entryId)
    },
    {
      id: glossaryCommandIds.nextOccurrence,
      title: titles.nextOccurrence,
      palette: { visible: false },
      execute: (entryId) =>
        controller.navigateToNextGlossaryOccurrence(entryId)
    }
  ];
}

export function registerGlossaryCommands(
  registry: CommandRegistry,
  controller: GlossaryCommandController,
  titles: GlossaryCommandTitles
): void {
  const [
    openEntryCommand,
    createEntryCommand,
    previousOccurrenceCommand,
    nextOccurrenceCommand
  ] = createGlossaryCommands(controller, titles);

  registry.register(openEntryCommand);
  registry.register(createEntryCommand);
  registry.register(previousOccurrenceCommand);
  registry.register(nextOccurrenceCommand);
}
