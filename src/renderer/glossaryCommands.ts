import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import { glossaryTabCommandIds } from "../shared/commandIds";
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
  >("glossary.entry.occurrences.next"),
  /** #375: opens the dedicated Glossary Tag Manager special tab. */
  manageTags: defineCommandId<readonly [], boolean>(
    glossaryTabCommandIds.manageTags
  ),
  /** #375: opens the dedicated Glossary (entry) Management special tab. */
  manageEntries: defineCommandId<readonly [], boolean>(
    glossaryTabCommandIds.manageEntries
  )
} as const;

export const glossaryWriteCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }, { key: "project.access.readWrite" }]
};

/** #375: opening the Tag Manager tab only needs a project (Tag CRUD IPC
 *  guards its own writes). */
export const glossaryTagManagerCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }]
};

/** #375: opening the Glossary Management tab only needs a project (the reorder
 *  / delete IPC guards its own writes). */
export const glossaryEntryManagerCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }]
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
  openGlossaryTagManager(): boolean | Promise<boolean>;
  openGlossaryEntryManager(): boolean | Promise<boolean>;
}

export interface GlossaryCommandTitles {
  openEntry: string;
  createEntry: string;
  previousOccurrence: string;
  nextOccurrence: string;
  manageTags: string;
  manageTagsDescription: string;
  manageEntries: string;
  manageEntriesDescription: string;
}

type OpenGlossaryEntryCommand = Command<
  readonly [entryId: GlossaryEntryId],
  boolean
>;

type CreateGlossaryEntryCommand = Command<
  readonly [input: CreateGlossaryEntryInput],
  boolean
>;

type GlossaryOccurrenceCommand = Command<
  readonly [entryId: GlossaryEntryId],
  boolean
>;

type ManageGlossaryTagsCommand = Command<readonly [], boolean>;

type ManageGlossaryEntriesCommand = Command<readonly [], boolean>;

export function createGlossaryCommandTitles(
  translate: Translate
): GlossaryCommandTitles {
  return {
    openEntry: translate("command.glossary.entry.open"),
    createEntry: translate("command.glossary.entry.create"),
    previousOccurrence: translate("command.glossary.entry.occurrences.previous"),
    nextOccurrence: translate("command.glossary.entry.occurrences.next"),
    manageTags: translate("command.glossary.tag.manage"),
    manageTagsDescription: translate("command.glossary.tag.manage.description"),
    manageEntries: translate("command.glossary.entry.manage"),
    manageEntriesDescription: translate(
      "command.glossary.entry.manage.description"
    )
  };
}

export function createGlossaryCommands(
  controller: GlossaryCommandController,
  titles: GlossaryCommandTitles
): readonly [
  OpenGlossaryEntryCommand,
  CreateGlossaryEntryCommand,
  GlossaryOccurrenceCommand,
  GlossaryOccurrenceCommand,
  ManageGlossaryTagsCommand,
  ManageGlossaryEntriesCommand
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
    },
    {
      id: glossaryCommandIds.manageTags,
      title: titles.manageTags,
      description: titles.manageTagsDescription,
      when: glossaryTagManagerCommandWhen,
      execute: () => controller.openGlossaryTagManager()
    },
    {
      id: glossaryCommandIds.manageEntries,
      title: titles.manageEntries,
      description: titles.manageEntriesDescription,
      when: glossaryEntryManagerCommandWhen,
      execute: () => controller.openGlossaryEntryManager()
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
    nextOccurrenceCommand,
    manageTagsCommand,
    manageEntriesCommand
  ] = createGlossaryCommands(controller, titles);

  registry.register(openEntryCommand);
  registry.register(createEntryCommand);
  registry.register(previousOccurrenceCommand);
  registry.register(nextOccurrenceCommand);
  registry.register(manageTagsCommand);
  registry.register(manageEntriesCommand);
}
