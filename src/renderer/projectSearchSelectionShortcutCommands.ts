import type { Command, CommandRegistry } from "../shared/commandRegistry";
import { searchSelectionShortcutCommandIds as projectSearchSelectionShortcutCommandIds } from "../shared/commandIds";
import type { Translate } from "../shared/i18n";

export { projectSearchSelectionShortcutCommandIds };

/**
 * #457 — Ctrl+Shift+F / Ctrl+Shift+H: open Project Search / Project Replace
 * seeded from whatever text is currently selected anywhere in the Pergamum
 * UI (not just the active Markdown editor - see
 * `projectSearchSelectionResolver.ts`).
 *
 * Unlike Ctrl+F/H (`find/activeFindKeymapExtension.ts`) or Ctrl+G (#436,
 * `glossarySelectionShortcutExtension.ts`), these must fire regardless of
 * what currently has focus - a Glossary field, a preview pane, or nothing
 * at all - not just the active Markdown editor's own CodeMirror DOM. A
 * CodeMirror keymap extension (or any React "on key down" / app-wide
 * DOM-level keydown listener) cannot do that and is explicitly disallowed
 * for app-wide shortcuts by
 * `tests/renderer/editContextMenuSourceChecks.test.ts`. So these are wired
 * through the Electron application-menu accelerator instead (see
 * `src/main/menu.ts`, `CommandOrControl+Shift+F` / `+H`) - the same path
 * already used for e.g. Ctrl+Shift+O (open project). A menu accelerator
 * carries no payload, so each command resolves the current selection ITSELF
 * (via `projectSearchSelectionResolver.ts`) at execute time, inside the
 * renderer - not from the main process.
 */
export interface ProjectSearchSelectionShortcutCommandController {
  openProjectSearchFromSelection(): void;
  openProjectReplaceFromSelection(): void;
}

export interface ProjectSearchSelectionShortcutCommandTitles {
  readonly openProjectSearchFromSelection: string;
  readonly openProjectSearchFromSelectionDescription: string;
  readonly openProjectReplaceFromSelection: string;
  readonly openProjectReplaceFromSelectionDescription: string;
}

type OpenProjectSearchFromSelectionCommand = Command<readonly [], void>;
type OpenProjectReplaceFromSelectionCommand = Command<readonly [], void>;

export function createProjectSearchSelectionShortcutCommandTitles(
  translate: Translate
): ProjectSearchSelectionShortcutCommandTitles {
  return {
    openProjectSearchFromSelection: translate(
      "command.search.project.openFromSelection"
    ),
    openProjectSearchFromSelectionDescription: translate(
      "command.search.project.openFromSelection.description"
    ),
    openProjectReplaceFromSelection: translate(
      "command.search.project.replace.openFromSelection"
    ),
    openProjectReplaceFromSelectionDescription: translate(
      "command.search.project.replace.openFromSelection.description"
    )
  };
}

export function createProjectSearchSelectionShortcutCommands(
  controller: ProjectSearchSelectionShortcutCommandController,
  titles: ProjectSearchSelectionShortcutCommandTitles
): readonly [
  OpenProjectSearchFromSelectionCommand,
  OpenProjectReplaceFromSelectionCommand
] {
  return [
    {
      id: projectSearchSelectionShortcutCommandIds.openProjectSearchFromSelection,
      title: titles.openProjectSearchFromSelection,
      description: titles.openProjectSearchFromSelectionDescription,
      // Keybinding (application-menu accelerator) only for now - same
      // rationale as #436's Ctrl+G: depends on "whatever is selected right
      // now", which the Command Palette itself usually just cleared.
      palette: { visible: false },
      execute: () => controller.openProjectSearchFromSelection()
    },
    {
      id: projectSearchSelectionShortcutCommandIds.openProjectReplaceFromSelection,
      title: titles.openProjectReplaceFromSelection,
      description: titles.openProjectReplaceFromSelectionDescription,
      palette: { visible: false },
      execute: () => controller.openProjectReplaceFromSelection()
    }
  ];
}

export function registerProjectSearchSelectionShortcutCommands(
  registry: CommandRegistry,
  controller: ProjectSearchSelectionShortcutCommandController,
  titles: ProjectSearchSelectionShortcutCommandTitles
): void {
  for (const command of createProjectSearchSelectionShortcutCommands(
    controller,
    titles
  )) {
    registry.register(command);
  }
}
