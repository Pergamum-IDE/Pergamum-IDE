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
 * Command ids + controller + builders for the Glossary Entry Editor Pane.
 * Registered in App.tsx since Slice 3; Ctrl+G's `openFromEditorSelection`
 * (Slice 12) is the first keybound member — the other three stay
 * palette-hidden and un-keybound.
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
  ),
  /**
   * #436 Slice 12: Ctrl+G. `selectedText` is the active Markdown editor's
   * RAW current selection (`""` when empty) — normalization and the
   * create-vs-edit-vs-ambiguous resolution both happen in the controller
   * (via `resolveGlossaryEntryEditorPaneTargetFromSelection`), not here.
   */
  openFromEditorSelection: defineCommandId<
    readonly [selectedText: string],
    void
  >("glossary.openFromEditorSelection")
} as const;

export interface GlossaryEntryEditorPaneCommandController {
  openGlossaryEntryCreatePane(
    options: OpenGlossaryEntryCreatePaneOptions
  ): void | Promise<void>;
  openGlossaryEntryEditPane(
    options: OpenGlossaryEntryEditPaneOptions
  ): void | Promise<void>;
  closeGlossaryEntryEditorPane(): void | Promise<void>;
  openGlossaryEntryEditorPaneFromSelection(
    selectedText: string
  ): void | Promise<void>;
}

export interface GlossaryEntryEditorPaneCommandTitles {
  openCreatePane: string;
  openCreatePaneDescription: string;
  openEditPane: string;
  openEditPaneDescription: string;
  closePane: string;
  closePaneDescription: string;
  openFromEditorSelection: string;
  openFromEditorSelectionDescription: string;
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

type OpenFromEditorSelectionCommand = Command<
  readonly [selectedText: string],
  void
>;

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
    ),
    openFromEditorSelection: translate(
      "command.glossary.openFromEditorSelection"
    ),
    openFromEditorSelectionDescription: translate(
      "command.glossary.openFromEditorSelection.description"
    )
  };
}

export function createGlossaryEntryEditorPaneCommands(
  controller: GlossaryEntryEditorPaneCommandController,
  titles: GlossaryEntryEditorPaneCommandTitles
): readonly [
  OpenCreatePaneCommand,
  OpenEditPaneCommand,
  ClosePaneCommand,
  OpenFromEditorSelectionCommand
] {
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
    },
    {
      id: glossaryEntryEditorPaneCommandIds.openFromEditorSelection,
      title: titles.openFromEditorSelection,
      description: titles.openFromEditorSelectionDescription,
      // #436 Slice 12: keybinding-only for now (Ctrl+G) — active Markdown
      // editor context makes little sense from the Command Palette (spec:
      // "まずは keybinding 用 command として実装するだけでもよい").
      palette: { visible: false },
      execute: (selectedText) =>
        controller.openGlossaryEntryEditorPaneFromSelection(selectedText)
    }
  ];
}

export function registerGlossaryEntryEditorPaneCommands(
  registry: CommandRegistry,
  controller: GlossaryEntryEditorPaneCommandController,
  titles: GlossaryEntryEditorPaneCommandTitles
): void {
  const [
    openCreatePaneCommand,
    openEditPaneCommand,
    closePaneCommand,
    openFromEditorSelectionCommand
  ] = createGlossaryEntryEditorPaneCommands(controller, titles);

  registry.register(openCreatePaneCommand);
  registry.register(openEditPaneCommand);
  registry.register(closePaneCommand);
  registry.register(openFromEditorSelectionCommand);
}
