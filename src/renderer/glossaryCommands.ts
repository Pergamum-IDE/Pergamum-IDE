import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import { glossaryTabCommandIds } from "../shared/commandIds";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import type { GlossaryEntryId } from "../shared/glossary";
import type { Translate } from "../shared/i18n";

export const glossaryCommandIds = {
  // #436 Slice 5: `openEntry` no longer opens a `glossaryEntry` editor tab —
  // its App controller opens the bottom Glossary Entry Editor Pane in edit
  // mode. The old `createEntry` command was removed (the Glossary Entry
  // Editor Pane create flow replaces it).
  openEntry: defineCommandId<readonly [entryId: GlossaryEntryId], boolean>(
    "glossary.entry.open"
  ),
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
    previousOccurrenceCommand,
    nextOccurrenceCommand,
    manageTagsCommand,
    manageEntriesCommand
  ] = createGlossaryCommands(controller, titles);

  registry.register(openEntryCommand);
  registry.register(previousOccurrenceCommand);
  registry.register(nextOccurrenceCommand);
  registry.register(manageTagsCommand);
  registry.register(manageEntriesCommand);
}
