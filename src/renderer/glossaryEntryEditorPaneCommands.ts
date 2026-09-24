import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";

/**
 * #436 Phase 8-0 PoC — Slice 2.
 *
 * Command ids + controller + builders for the glossary entry create / edit
 * entry points. Ctrl+G's `openFromEditorSelection` (Slice 12) is the only
 * keybound member; the others stay palette-hidden and un-keybound.
 *
 * #573 Slice 7: the bottom Glossary Entry Editor Pane these commands were
 * named after is gone — they now open glossary Description tabs (a new,
 * unsaved entry tab for create; the entry's tab for edit). The command ids
 * are kept stable; the pane-only `closePane` command was removed.
 */

/** Which UI asked to create / edit a glossary entry (kept for logging). */
export type GlossaryEntryEditorPaneSource =
  | "glossary-pane"
  | "glossary-settings"
  | "editor-selection"
  | "editor-context-menu"
  | "developer";

/**
 * Fallback representative surface pre-filled into a new entry when the
 * caller passes no `presetRepresentative` (e.g. the Glossary side pane's
 * "語彙を追加", which has no editor selection to seed from).
 */
export const DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE = "新しい語彙";

export function presetRepresentativeOrDefault(
  presetRepresentative: string | undefined
): string {
  return presetRepresentative !== undefined && presetRepresentative.length > 0
    ? presetRepresentative
    : DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE;
}

export interface OpenGlossaryEntryCreatePaneOptions {
  source: GlossaryEntryEditorPaneSource;
  presetRepresentative?: string;
}

export interface OpenGlossaryEntryEditPaneOptions {
  source: GlossaryEntryEditorPaneSource;
  entryId: string;
}
export const glossaryEntryEditorPaneCommandIds = {
  openCreatePane: defineCommandId<
    readonly [options: OpenGlossaryEntryCreatePaneOptions],
    void
  >("glossary.openCreateEntryPane"),
  openEditPane: defineCommandId<
    readonly [options: OpenGlossaryEntryEditPaneOptions],
    void
  >("glossary.openEditEntryPane"),
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
  openGlossaryEntryEditorPaneFromSelection(
    selectedText: string
  ): void | Promise<void>;
}

export interface GlossaryEntryEditorPaneCommandTitles {
  openCreatePane: string;
  openCreatePaneDescription: string;
  openEditPane: string;
  openEditPaneDescription: string;
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
    openFromEditorSelectionCommand
  ] = createGlossaryEntryEditorPaneCommands(controller, titles);

  registry.register(openCreatePaneCommand);
  registry.register(openEditPaneCommand);
  registry.register(openFromEditorSelectionCommand);
}
