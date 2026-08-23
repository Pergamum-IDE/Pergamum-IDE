import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import type { Translate } from "../shared/i18n";

export const glossaryOccurrenceTrackingCommandWhen: CommandEnablementExpression =
  { key: "glossary.occurrences.tracking.active" };

export const glossaryOccurrencesCommandIds = {
  previous: defineCommandId<readonly [], boolean>(
    "glossary.occurrences.previous"
  ),
  next: defineCommandId<readonly [], boolean>("glossary.occurrences.next"),
  openEntry: defineCommandId<readonly [], boolean>(
    "glossary.occurrences.entry.open"
  ),
  closeTracking: defineCommandId<readonly [], boolean>(
    "glossary.occurrences.tracking.close"
  )
} as const;

export interface GlossaryOccurrencesCommandController {
  navigateToPreviousOccurrence(): boolean | Promise<boolean>;
  navigateToNextOccurrence(): boolean | Promise<boolean>;
  openTrackedGlossaryEntry(): boolean | Promise<boolean>;
  closeGlossaryOccurrenceTracking(): boolean | Promise<boolean>;
}

export interface GlossaryOccurrencesCommandTitles {
  previous: string;
  previousDescription: string;
  next: string;
  nextDescription: string;
  openEntry: string;
  openEntryDescription: string;
  closeTracking: string;
  closeTrackingDescription: string;
}

type GlossaryOccurrencesCommand = Command<readonly [], boolean>;

export function createGlossaryOccurrencesCommandTitles(
  translate: Translate
): GlossaryOccurrencesCommandTitles {
  return {
    previous: translate("command.glossary.occurrences.previous"),
    previousDescription: translate(
      "command.glossary.occurrences.previous.description"
    ),
    next: translate("command.glossary.occurrences.next"),
    nextDescription: translate("command.glossary.occurrences.next.description"),
    openEntry: translate("command.glossary.occurrences.entry.open"),
    openEntryDescription: translate(
      "command.glossary.occurrences.entry.open.description"
    ),
    closeTracking: translate("command.glossary.occurrences.tracking.close"),
    closeTrackingDescription: translate(
      "command.glossary.occurrences.tracking.close.description"
    )
  };
}

export function createGlossaryOccurrencesCommands(
  controller: GlossaryOccurrencesCommandController,
  titles: GlossaryOccurrencesCommandTitles
): readonly GlossaryOccurrencesCommand[] {
  return [
    {
      id: glossaryOccurrencesCommandIds.previous,
      title: titles.previous,
      description: titles.previousDescription,
      execute: () => controller.navigateToPreviousOccurrence(),
      when: glossaryOccurrenceTrackingCommandWhen
    },
    {
      id: glossaryOccurrencesCommandIds.next,
      title: titles.next,
      description: titles.nextDescription,
      execute: () => controller.navigateToNextOccurrence(),
      when: glossaryOccurrenceTrackingCommandWhen
    },
    {
      id: glossaryOccurrencesCommandIds.openEntry,
      title: titles.openEntry,
      description: titles.openEntryDescription,
      execute: () => controller.openTrackedGlossaryEntry()
    },
    {
      id: glossaryOccurrencesCommandIds.closeTracking,
      title: titles.closeTracking,
      description: titles.closeTrackingDescription,
      execute: () => controller.closeGlossaryOccurrenceTracking(),
      when: glossaryOccurrenceTrackingCommandWhen
    }
  ];
}

export function registerGlossaryOccurrencesCommands(
  registry: CommandRegistry,
  controller: GlossaryOccurrencesCommandController,
  titles: GlossaryOccurrencesCommandTitles
): void {
  for (const command of createGlossaryOccurrencesCommands(
    controller,
    titles
  )) {
    registry.register(command);
  }
}
