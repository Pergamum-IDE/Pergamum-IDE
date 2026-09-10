import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";
import type {
  OpenGlossaryEntryCreatePaneOptions,
  OpenGlossaryEntryEditPaneOptions
} from "./glossaryEntryEditorPaneState";

/**
 * #436 Phase 8-0 PoC — Slice 2.
 *
 * Command ids + controller + builders for the Glossary Entry Editor Pane,
 * prepared so a later slice can register them (Slice 3) and attach keybindings.
 *
 * NOT registered in the app yet and NOT keybound. The Ctrl+G command
 * `glossary.createEntryFromSelection` is deliberately absent — Slice 8.
 */
export const glossaryEntryEditorPaneCommandIds = {
  openCreatePane: defineCommandId<
    readonly [options: OpenGlossaryEntryCreatePaneOptions],
    void
  >("glossary.openCreateEntryPane"),
  openEditPane: defineCommandId<
    readonly [options: OpenGlossaryEntryEditPaneOptions],
    void
  >("glossary.openEditEntryPane"),
  closePane: defineCommandId<readonly [], void>(
    "glossary.closeEntryEditorPane"
  )
} as const;

export interface GlossaryEntryEditorPaneCommandController {
  openGlossaryEntryCreatePane(
    options: OpenGlossaryEntryCreatePaneOptions
  ): void;
  openGlossaryEntryEditPane(options: OpenGlossaryEntryEditPaneOptions): void;
  closeGlossaryEntryEditorPane(): void;
}

export interface GlossaryEntryEditorPaneCommandTitles {
  openCreatePane: string;
  openCreatePaneDescription: string;
  openEditPane: string;
  openEditPaneDescription: string;
  closePane: string;
  closePaneDescription: string;
}

type OpenCreatePaneCommand = Command<
  readonly [options: OpenGlossaryEntryCreatePaneOptions],
  void
>;

type OpenEditPaneCommand = Command<
  readonly [options: OpenGlossaryEntryEditPaneOptions],
  void
>;

type ClosePaneCommand = Command<readonly [], void>;

export function createGlossaryEntryEditorPaneCommandTitles(
  translate: Translate
): GlossaryEntryEditorPaneCommandTitles {
  return {
    openCreatePane: translate("command.glossary.openCreateEntryPane"),
    openCreatePaneDescription: translate(
      "command.glossary.openCreateEntryPane.description"
    ),
    openEditPane: translate("command.glossary.openEditEntryPane"),
    openEditPaneDescription: translate(
      "command.glossary.openEditEntryPane.description"
    ),
    closePane: translate("command.glossary.closeEntryEditorPane"),
    closePaneDescription: translate(
      "command.glossary.closeEntryEditorPane.description"
    )
  };
}

export function createGlossaryEntryEditorPaneCommands(
  controller: GlossaryEntryEditorPaneCommandController,
  titles: GlossaryEntryEditorPaneCommandTitles
): readonly [OpenCreatePaneCommand, OpenEditPaneCommand, ClosePaneCommand] {
  return [
    {
      id: glossaryEntryEditorPaneCommandIds.openCreatePane,
      title: titles.openCreatePane,
      description: titles.openCreatePaneDescription,
      palette: { visible: false },
      execute: (options) => controller.openGlossaryEntryCreatePane(options)
    },
    {
      id: glossaryEntryEditorPaneCommandIds.openEditPane,
      title: titles.openEditPane,
      description: titles.openEditPaneDescription,
      palette: { visible: false },
      execute: (options) => controller.openGlossaryEntryEditPane(options)
    },
    {
      id: glossaryEntryEditorPaneCommandIds.closePane,
      title: titles.closePane,
      description: titles.closePaneDescription,
      palette: { visible: false },
      execute: () => controller.closeGlossaryEntryEditorPane()
    }
  ];
}

export function registerGlossaryEntryEditorPaneCommands(
  registry: CommandRegistry,
  controller: GlossaryEntryEditorPaneCommandController,
  titles: GlossaryEntryEditorPaneCommandTitles
): void {
  const [openCreatePaneCommand, openEditPaneCommand, closePaneCommand] =
    createGlossaryEntryEditorPaneCommands(controller, titles);

  registry.register(openCreatePaneCommand);
  registry.register(openEditPaneCommand);
  registry.register(closePaneCommand);
}
