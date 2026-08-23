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
  canSaveCurrentDocument(): boolean;
  canSaveCurrentDocumentAs(): boolean;
  closeEditor(editorId?: EditorId): void | Promise<void>;
  canCloseEditor(editorId?: EditorId): boolean;
  delegateNativeEditCommand(commandId: EditCommandId): void | Promise<void>;
  canDelegateNativeEditCommand(commandId: EditCommandId): boolean;
}

export interface EditorCommandTitles {
  openMarkdownDocument: string;
  saveDocument: string;
  saveAs: string;
  closeEditor: string;
  cutSelection: string;
  copySelection: string;
  pasteSelection: string;
  selectAllSelection: string;
}

type EditorCommand = Command<readonly [], void>;

export function createEditorCommandTitles(
  translate: Translate
): EditorCommandTitles {
  return {
    openMarkdownDocument: translate("command.editor.document.markdown.open"),
    saveDocument: translate("command.editor.document.save"),
    saveAs: translate("command.editor.saveAs"),
    closeEditor: translate("command.editor.document.close"),
    cutSelection: translate("command.editor.selection.cut"),
    copySelection: translate("command.editor.selection.copy"),
    pasteSelection: translate("command.editor.selection.paste"),
    selectAllSelection: translate("command.editor.selection.selectAll")
  };
}

function editCommand(
  commandId: EditCommandId,
  title: string,
  controller: EditorCommandController
): EditorCommand {
  return {
    id: commandId,
    title,
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
      execute: () => controller.openMarkdownDocument()
    },
    {
      id: editorCommandIds.saveDocument,
      title: titles.saveDocument,
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
      id: editorCommandIds.saveAs,
      title: titles.saveAs,
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
    editCommand(editCommandIds[0], titles.cutSelection, controller),
    editCommand(editCommandIds[1], titles.copySelection, controller),
    editCommand(editCommandIds[2], titles.pasteSelection, controller),
    editCommand(editCommandIds[3], titles.selectAllSelection, controller)
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
