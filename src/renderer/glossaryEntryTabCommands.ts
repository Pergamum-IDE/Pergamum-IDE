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
 * #573 Slice 7: these commands open glossary Description tabs (a new,
 * unsaved entry tab for create; the entry's tab for edit). The pane-only
 * `closePane` command was removed.
 *
 * #574 Slice 5: the internal names follow the tab architecture; the command
 * id STRINGS (`glossary.openCreateEntryPane` / `glossary.openEditEntryPane`)
 * and their `command.glossary.*` title keys are legacy names kept for
 * compatibility (debug logs, command plumbing).
 */

/** Which UI asked to create / edit a glossary entry (kept for logging). */
export type GlossaryEntryOpenSource =
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

export interface OpenNewGlossaryEntryTabOptions {
  source: GlossaryEntryOpenSource;
  presetRepresentative?: string;
}

export interface OpenGlossaryEntryTabOptions {
  source: GlossaryEntryOpenSource;
  entryId: string;
}
export const glossaryEntryTabCommandIds = {
  // Command ids kept for compatibility; they open glossaryDescription tabs.
  openNewEntryTab: defineCommandId<
    readonly [options: OpenNewGlossaryEntryTabOptions],
    void
  >("glossary.openCreateEntryPane"),
  openEntryTab: defineCommandId<
    readonly [options: OpenGlossaryEntryTabOptions],
    void
  >("glossary.openEditEntryPane"),
  /**
   * #436 Slice 12: Ctrl+G. `selectedText` is the active Markdown editor's
   * RAW current selection (`""` when empty) — normalization and the
   * create-vs-edit-vs-ambiguous resolution both happen in the controller
   * (via `resolveGlossaryEntryTargetFromSelection`), not here.
   */
  openFromEditorSelection: defineCommandId<
    readonly [selectedText: string],
    void
  >("glossary.openFromEditorSelection")
} as const;

export interface GlossaryEntryTabCommandController {
  openNewGlossaryEntryTab(
    options: OpenNewGlossaryEntryTabOptions
  ): void | Promise<void>;
  openGlossaryEntryTab(
    options: OpenGlossaryEntryTabOptions
  ): void | Promise<void>;
  openGlossaryEntryTabFromSelection(
    selectedText: string
  ): void | Promise<void>;
}

export interface GlossaryEntryTabCommandTitles {
  openNewEntryTab: string;
  openNewEntryTabDescription: string;
  openEntryTab: string;
  openEntryTabDescription: string;
  openFromEditorSelection: string;
  openFromEditorSelectionDescription: string;
}

type OpenNewEntryTabCommand = Command<
  readonly [options: OpenNewGlossaryEntryTabOptions],
  void
>;

type OpenEntryTabCommand = Command<
  readonly [options: OpenGlossaryEntryTabOptions],
  void
>;

type OpenFromEditorSelectionCommand = Command<
  readonly [selectedText: string],
  void
>;

export function createGlossaryEntryTabCommandTitles(
  translate: Translate
): GlossaryEntryTabCommandTitles {
  return {
    openNewEntryTab: translate("command.glossary.openCreateEntryPane"),
    openNewEntryTabDescription: translate(
      "command.glossary.openCreateEntryPane.description"
    ),
    openEntryTab: translate("command.glossary.openEditEntryPane"),
    openEntryTabDescription: translate(
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

export function createGlossaryEntryTabCommands(
  controller: GlossaryEntryTabCommandController,
  titles: GlossaryEntryTabCommandTitles
): readonly [
  OpenNewEntryTabCommand,
  OpenEntryTabCommand,
  OpenFromEditorSelectionCommand
] {
  return [
    {
      id: glossaryEntryTabCommandIds.openNewEntryTab,
      title: titles.openNewEntryTab,
      description: titles.openNewEntryTabDescription,
      palette: { visible: false },
      execute: (options) => controller.openNewGlossaryEntryTab(options)
    },
    {
      id: glossaryEntryTabCommandIds.openEntryTab,
      title: titles.openEntryTab,
      description: titles.openEntryTabDescription,
      palette: { visible: false },
      execute: (options) => controller.openGlossaryEntryTab(options)
    },
    {
      id: glossaryEntryTabCommandIds.openFromEditorSelection,
      title: titles.openFromEditorSelection,
      description: titles.openFromEditorSelectionDescription,
      // #436 Slice 12: keybinding-only for now (Ctrl+G) — active Markdown
      // editor context makes little sense from the Command Palette (spec:
      // "まずは keybinding 用 command として実装するだけでもよい").
      palette: { visible: false },
      execute: (selectedText) =>
        controller.openGlossaryEntryTabFromSelection(selectedText)
    }
  ];
}

export function registerGlossaryEntryTabCommands(
  registry: CommandRegistry,
  controller: GlossaryEntryTabCommandController,
  titles: GlossaryEntryTabCommandTitles
): void {
  const [
    openNewEntryTabCommand,
    openEntryTabCommand,
    openFromEditorSelectionCommand
  ] = createGlossaryEntryTabCommands(controller, titles);

  registry.register(openNewEntryTabCommand);
  registry.register(openEntryTabCommand);
  registry.register(openFromEditorSelectionCommand);
}
