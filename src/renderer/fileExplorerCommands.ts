import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import type { Translate } from "../shared/i18n";
import type { FileExplorerCreateKind } from "./fileExplorerCreateMessages";

/**
 * #311/#313: Command Palette entries for File Explorer create / rename
 * actions. They do not implement any filesystem logic of their
 * own — they reveal the File Explorer (never collapsing it) and open the same
 * reusable {@link NameInputDialog} the toolbar opens, so the #307 create
 * target resolution, read-only / no-project guards, operation-error handling,
 * technical-copy affordance, and parent-reload / selection / open behavior
 * are all reused unchanged.
 */
export const fileExplorerCommandIds = {
  createMarkdownFile: defineCommandId("workspace.files.createMarkdownFile"),
  createFolder: defineCommandId("workspace.files.createFolder"),
  rename: defineCommandId("workspace.files.rename")
} as const;

/**
 * Create / rename is available only for a writable open project — the same
 * gate as the File Explorer toolbar (#307). The main process stays the
 * source of truth for filesystem safety; this only hides actions that could
 * never succeed.
 */
export const fileExplorerCreateCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }, { key: "project.access.readWrite" }]
};

export interface FileExplorerCommandController {
  /**
   * Reveal the File Explorer if hidden (never collapse it) and open the
   * shared create dialog for `kind`. The dialog resolves its target from the
   * current File Explorer selection, or the project root when there is none.
   */
  requestFileExplorerCreate(kind: FileExplorerCreateKind): void;
  /**
   * Reveal the File Explorer if hidden and ask it to rename its current
   * selection. The File Explorer owns selection and dirty-editor preflight.
   */
  requestFileExplorerRename(): void;
}

export interface FileExplorerCommandTitles {
  createMarkdownFile: string;
  createMarkdownFileDescription: string;
  createFolder: string;
  createFolderDescription: string;
  rename: string;
  renameDescription: string;
}

type FileExplorerCommand = Command<readonly [], void>;

export function createFileExplorerCommandTitles(
  translate: Translate
): FileExplorerCommandTitles {
  return {
    createMarkdownFile: translate(
      "command.workspace.files.createMarkdownFile"
    ),
    createMarkdownFileDescription: translate(
      "command.workspace.files.createMarkdownFile.description"
    ),
    createFolder: translate("command.workspace.files.createFolder"),
    createFolderDescription: translate(
      "command.workspace.files.createFolder.description"
    ),
    rename: translate("command.workspace.files.rename"),
    renameDescription: translate("command.workspace.files.rename.description")
  };
}

export function createFileExplorerCommands(
  controller: FileExplorerCommandController,
  titles: FileExplorerCommandTitles
): readonly FileExplorerCommand[] {
  return [
    {
      id: fileExplorerCommandIds.createMarkdownFile,
      title: titles.createMarkdownFile,
      description: titles.createMarkdownFileDescription,
      when: fileExplorerCreateCommandWhen,
      execute: () => {
        controller.requestFileExplorerCreate("file");
      }
    },
    {
      id: fileExplorerCommandIds.createFolder,
      title: titles.createFolder,
      description: titles.createFolderDescription,
      when: fileExplorerCreateCommandWhen,
      execute: () => {
        controller.requestFileExplorerCreate("folder");
      }
    },
    {
      id: fileExplorerCommandIds.rename,
      title: titles.rename,
      description: titles.renameDescription,
      when: fileExplorerCreateCommandWhen,
      execute: () => {
        controller.requestFileExplorerRename();
      }
    }
  ];
}

export function registerFileExplorerCommands(
  registry: CommandRegistry,
  controller: FileExplorerCommandController,
  titles: FileExplorerCommandTitles
): void {
  for (const command of createFileExplorerCommands(controller, titles)) {
    registry.register(command);
  }
}
