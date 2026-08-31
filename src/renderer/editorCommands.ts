import type { Command, CommandRegistry } from "../shared/commandRegistry";
import {
  editCommandIds,
  editorCommandIds,
  type EditCommandId
} from "../shared/commandIds";
import type { CommandEnablementExpression } from "../shared/commandEnablement";
import type { Translate } from "../shared/i18n";
import type { EditorId } from "../shared/editorId";

export const projectOwnedWriteAllowedCommandWhen: CommandEnablementExpression = {
  anyOf: [
    { not: { key: "editor.document.projectOwned" } },
    { key: "project.access.readWrite" }
  ]
};

export const saveDocumentCommandWhen: CommandEnablementExpression = {
  allOf: [
    { key: "editor.hasDocument" },
    { key: "editor.isDirty" },
    { not: { key: "activeEditor.saveBlockedByReadOnlyProjectRootForUi" } },
    projectOwnedWriteAllowedCommandWhen
  ]
};

export const saveAsCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "editor.hasDocument" }, { key: "editor.kind.markdown" }]
};

export { editorCommandIds };

export interface EditorCommandController {
  openMarkdownDocument(): void | Promise<void>;
  saveCurrentDocument(): void | Promise<void>;
  saveCurrentDocumentAs(): void | Promise<void>;
  saveAllDocuments(): void | Promise<void>;
  canSaveCurrentDocument(): boolean;
  canSaveCurrentDocumentAs(): boolean;
  canSaveAllDocuments(): boolean;
  closeEditor(editorId?: EditorId): void | Promise<void>;
  canCloseEditor(editorId?: EditorId): boolean;
  delegateNativeEditCommand(commandId: EditCommandId): void | Promise<void>;
  canDelegateNativeEditCommand(commandId: EditCommandId): boolean;
}

export interface EditorCommandTitles {
  openMarkdownDocument: string;
  openMarkdownDocumentDescription: string;
  saveDocument: string;
  saveDocumentDescription: string;
  saveAll: string;
  saveAllDescription: string;
  saveAs: string;
  saveAsDescription: string;
  closeEditor: string;
  closeEditorDescription: string;
  cutSelection: string;
  cutSelectionDescription: string;
  copySelection: string;
  copySelectionDescription: string;
  pasteSelection: string;
  pasteSelectionDescription: string;
  selectAllSelection: string;
  selectAllSelectionDescription: string;
}

type EditorCommand = Command<readonly [], void>;

export function createEditorCommandTitles(
  translate: Translate
): EditorCommandTitles {
  return {
    openMarkdownDocument: translate("command.editor.document.markdown.open"),
    openMarkdownDocumentDescription: translate(
      "command.editor.document.markdown.open.description"
    ),
    saveDocument: translate("command.editor.document.save"),
    saveDocumentDescription: translate(
      "command.editor.document.save.description"
    ),
    saveAll: translate("command.editor.saveAll"),
    saveAllDescription: translate("command.editor.saveAll.description"),
    saveAs: translate("command.editor.saveAs"),
    saveAsDescription: translate("command.editor.saveAs.description"),
    closeEditor: translate("command.editor.document.close"),
    closeEditorDescription: translate("command.editor.document.close.description"),
    cutSelection: translate("command.editor.selection.cut"),
    cutSelectionDescription: translate(
      "command.editor.selection.cut.description"
    ),
    copySelection: translate("command.editor.selection.copy"),
    copySelectionDescription: translate(
      "command.editor.selection.copy.description"
    ),
    pasteSelection: translate("command.editor.selection.paste"),
    pasteSelectionDescription: translate(
      "command.editor.selection.paste.description"
    ),
    selectAllSelection: translate("command.editor.selection.selectAll"),
    selectAllSelectionDescription: translate(
      "command.editor.selection.selectAll.description"
    )
  };
}

function editCommand(
  commandId: EditCommandId,
  title: string,
  description: string,
  controller: EditorCommandController
): EditorCommand {
  return {
    id: commandId,
    title,
    description,
    execute: () => controller.delegateNativeEditCommand(commandId),
    isEnabled: () => controller.canDelegateNativeEditCommand(commandId)
  };
}

export function createEditorCommands(
  controller: EditorCommandController,
  titles: EditorCommandTitles
): readonly EditorCommand[] {
  return [
    {
      id: editorCommandIds.openMarkdownDocument,
      title: titles.openMarkdownDocument,
      description: titles.openMarkdownDocumentDescription,
      execute: () => controller.openMarkdownDocument()
    },
    {
      id: editorCommandIds.saveDocument,
      title: titles.saveDocument,
      description: titles.saveDocumentDescription,
      execute: () => {
        if (!controller.canSaveCurrentDocument()) {
          return;
        }

        return controller.saveCurrentDocument();
      },
      isEnabled: () => controller.canSaveCurrentDocument(),
      when: saveDocumentCommandWhen
    },
    {
      id: editorCommandIds.saveAll,
      title: titles.saveAll,
      description: titles.saveAllDescription,
      execute: () => {
        if (!controller.canSaveAllDocuments()) {
          return;
        }

        return controller.saveAllDocuments();
      },
      isEnabled: () => controller.canSaveAllDocuments()
    },
    {
      id: editorCommandIds.saveAs,
      title: titles.saveAs,
      description: titles.saveAsDescription,
      execute: () => {
        if (!controller.canSaveCurrentDocumentAs()) {
          return;
        }

        return controller.saveCurrentDocumentAs();
      },
      isEnabled: () => controller.canSaveCurrentDocumentAs(),
      when: saveAsCommandWhen
    },
    {
      id: editorCommandIds.close,
      title: titles.closeEditor,
      description: titles.closeEditorDescription,
      execute: (options?: { editorId?: EditorId }) =>
        controller.closeEditor(options?.editorId),
      isEnabled: (options?: { editorId?: EditorId }) =>
        controller.canCloseEditor(options?.editorId)
      // `close` takes an optional `{ editorId? }` arg, unlike the other
      // zero-arg `EditorCommand`s in this array — cast the same way
      // CommandRegistry itself stores heterogeneous commands (see
      // `RegisteredCommand` in commandRegistry.ts). `registry.execute`
      // still infers the real arg type from `editorCommandIds.close`
      // itself, not from this array's element type, so this is safe.
    } as unknown as EditorCommand,
    editCommand(
      editCommandIds[0],
      titles.cutSelection,
      titles.cutSelectionDescription,
      controller
    ),
    editCommand(
      editCommandIds[1],
      titles.copySelection,
      titles.copySelectionDescription,
      controller
    ),
    editCommand(
      editCommandIds[2],
      titles.pasteSelection,
      titles.pasteSelectionDescription,
      controller
    ),
    editCommand(
      editCommandIds[3],
      titles.selectAllSelection,
      titles.selectAllSelectionDescription,
      controller
    )
  ];
}

export function registerEditorCommands(
  registry: CommandRegistry,
  controller: EditorCommandController,
  titles: EditorCommandTitles
): void {
  for (const command of createEditorCommands(controller, titles)) {
    registry.register(command);
  }
}
