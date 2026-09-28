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

export const newFileCommandWhen: CommandEnablementExpression = {
  allOf: [{ key: "project.isOpen" }, { key: "project.access.readWrite" }]
};

export { editorCommandIds };

export interface EditorCommandController {
  newFile(): void | Promise<void>;
  canNewFile(): boolean;
  openMarkdownDocument(): void | Promise<void>;
  saveCurrentDocument(): void | Promise<void>;
  saveCurrentDocumentAs(): void | Promise<void>;
  saveAllDocuments(): void | Promise<void>;
  canSaveCurrentDocument(): boolean;
  canSaveCurrentDocumentAs(): boolean;
  canSaveAllDocuments(): boolean;
  closeEditor(editorId?: EditorId): void | Promise<void>;
  canCloseEditor(editorId?: EditorId): boolean;
  insertImage(): void | Promise<void>;
  canInsertImage(): boolean;
  insertBlockquote(): void | Promise<void>;
  canInsertBlockquote(): boolean;
  toggleSyntaxChecker(): void | Promise<void>;
  canToggleSyntaxChecker(): boolean;
  applyBold(): void | Promise<void>;
  canApplyBold(): boolean;
  applyItalic(): void | Promise<void>;
  canApplyItalic(): boolean;
  applyStrikethrough(): void | Promise<void>;
  canApplyStrikethrough(): boolean;
  insertHeading(): void | Promise<void>;
  canInsertHeading(): boolean;
  insertLink(): void | Promise<void>;
  canInsertLink(): boolean;
  insertHorizontalRule(): void | Promise<void>;
  canInsertHorizontalRule(): boolean;
  insertCodeBlock(): void | Promise<void>;
  canInsertCodeBlock(): boolean;
  insertTable(): void | Promise<void>;
  canInsertTable(): boolean;
  insertCallout(): void | Promise<void>;
  canInsertCallout(): boolean;
  insertRuby(): void | Promise<void>;
  canInsertRuby(): boolean;
  insertEmphasisMark(): void | Promise<void>;
  canInsertEmphasisMark(): boolean;
  togglePreview(): void | Promise<void>;
  canTogglePreview(): boolean;
  delegateNativeEditCommand(
    commandId: EditCommandId | string
  ): void | Promise<void>;
  canDelegateNativeEditCommand(commandId: EditCommandId | string): boolean;
}

export interface EditorCommandTitles {
  newFile: string;
  newFileDescription: string;
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
  insertImage: string;
  insertImageDescription: string;
  insertBlockquote: string;
  insertBlockquoteDescription: string;
  toggleSyntaxChecker: string;
  toggleSyntaxCheckerDescription: string;
  bold: string;
  boldDescription: string;
  italic: string;
  italicDescription: string;
  strikethrough: string;
  strikethroughDescription: string;
  heading: string;
  headingDescription: string;
  link: string;
  linkDescription: string;
  insertHorizontalRule: string;
  insertHorizontalRuleDescription: string;
  insertCodeBlock: string;
  insertCodeBlockDescription: string;
  insertTable: string;
  insertTableDescription: string;
  insertCallout: string;
  insertCalloutDescription: string;
  insertRuby: string;
  insertRubyDescription: string;
  insertEmphasisMark: string;
  insertEmphasisMarkDescription: string;
  togglePreview: string;
  togglePreviewDescription: string;
  cutSelection: string;
  cutSelectionDescription: string;
  copySelection: string;
  copySelectionDescription: string;
  pasteSelection: string;
  pasteSelectionDescription: string;
  selectAllSelection: string;
  selectAllSelectionDescription: string;
  undo: string;
  undoDescription: string;
  redo: string;
  redoDescription: string;
}

type EditorCommand = Command<readonly [], void>;

export function createEditorCommandTitles(
  translate: Translate
): EditorCommandTitles {
  return {
    newFile: translate("command.editor.file.new"),
    newFileDescription: translate("command.editor.file.new.description"),
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
    insertImage: translate("command.editor.image.insert"),
    insertImageDescription: translate(
      "command.editor.image.insert.description"
    ),
    insertBlockquote: translate("command.editor.markdown.insertBlockquote"),
    insertBlockquoteDescription: translate(
      "command.editor.markdown.insertBlockquote.description"
    ),
    toggleSyntaxChecker: translate(
      "command.editor.markdown.toggleSyntaxChecker"
    ),
    toggleSyntaxCheckerDescription: translate(
      "command.editor.markdown.toggleSyntaxChecker.description"
    ),
    bold: translate("command.editor.markdown.bold"),
    boldDescription: translate("command.editor.markdown.bold.description"),
    italic: translate("command.editor.markdown.italic"),
    italicDescription: translate("command.editor.markdown.italic.description"),
    strikethrough: translate("command.editor.markdown.strikethrough"),
    strikethroughDescription: translate(
      "command.editor.markdown.strikethrough.description"
    ),
    heading: translate("command.editor.markdown.heading"),
    headingDescription: translate("command.editor.markdown.heading.description"),
    link: translate("command.editor.markdown.link"),
    linkDescription: translate("command.editor.markdown.link.description"),
    insertHorizontalRule: translate(
      "command.editor.markdown.insertHorizontalRule"
    ),
    insertHorizontalRuleDescription: translate(
      "command.editor.markdown.insertHorizontalRule.description"
    ),
    insertCodeBlock: translate("command.editor.markdown.insertCodeBlock"),
    insertCodeBlockDescription: translate(
      "command.editor.markdown.insertCodeBlock.description"
    ),
    insertTable: translate("command.editor.markdown.insertTable"),
    insertTableDescription: translate(
      "command.editor.markdown.insertTable.description"
    ),
    insertCallout: translate("command.editor.markdown.insertCallout"),
    insertCalloutDescription: translate(
      "command.editor.markdown.insertCallout.description"
    ),
    insertRuby: translate("command.editor.markdown.insertRuby"),
    insertRubyDescription: translate(
      "command.editor.markdown.insertRuby.description"
    ),
    insertEmphasisMark: translate(
      "command.editor.markdown.insertEmphasisMark"
    ),
    insertEmphasisMarkDescription: translate(
      "command.editor.markdown.insertEmphasisMark.description"
    ),
    togglePreview: translate("command.editor.preview.toggle"),
    togglePreviewDescription: translate(
      "command.editor.preview.toggle.description"
    ),
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
    ),
    undo: translate("command.editor.undo"),
    undoDescription: translate("command.editor.undo.description"),
    redo: translate("command.editor.redo"),
    redoDescription: translate("command.editor.redo.description")
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
      id: editorCommandIds.newFile,
      title: titles.newFile,
      description: titles.newFileDescription,
      execute: () => {
        if (!controller.canNewFile()) {
          return;
        }

        return controller.newFile();
      },
      isEnabled: () => controller.canNewFile(),
      when: newFileCommandWhen
    },
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
    {
      id: editorCommandIds.insertImage,
      title: titles.insertImage,
      description: titles.insertImageDescription,
      execute: () => {
        if (!controller.canInsertImage()) {
          return;
        }

        return controller.insertImage();
      },
      isEnabled: () => controller.canInsertImage()
    },
    {
      id: editorCommandIds.insertBlockquote,
      title: titles.insertBlockquote,
      description: titles.insertBlockquoteDescription,
      execute: () => {
        if (!controller.canInsertBlockquote()) {
          return;
        }

        return controller.insertBlockquote();
      },
      isEnabled: () => controller.canInsertBlockquote()
    },
    {
      id: editorCommandIds.toggleSyntaxChecker,
      title: titles.toggleSyntaxChecker,
      description: titles.toggleSyntaxCheckerDescription,
      execute: () => {
        if (!controller.canToggleSyntaxChecker()) {
          return;
        }

        return controller.toggleSyntaxChecker();
      },
      isEnabled: () => controller.canToggleSyntaxChecker()
    },
    {
      id: editorCommandIds.bold,
      title: titles.bold,
      description: titles.boldDescription,
      execute: () => {
        if (!controller.canApplyBold()) {
          return;
        }

        return controller.applyBold();
      },
      isEnabled: () => controller.canApplyBold()
    },
    {
      id: editorCommandIds.italic,
      title: titles.italic,
      description: titles.italicDescription,
      execute: () => {
        if (!controller.canApplyItalic()) {
          return;
        }

        return controller.applyItalic();
      },
      isEnabled: () => controller.canApplyItalic()
    },
    {
      id: editorCommandIds.strikethrough,
      title: titles.strikethrough,
      description: titles.strikethroughDescription,
      execute: () => {
        if (!controller.canApplyStrikethrough()) {
          return;
        }

        return controller.applyStrikethrough();
      },
      isEnabled: () => controller.canApplyStrikethrough()
    },
    {
      id: editorCommandIds.heading,
      title: titles.heading,
      description: titles.headingDescription,
      execute: () => {
        if (!controller.canInsertHeading()) {
          return;
        }

        return controller.insertHeading();
      },
      isEnabled: () => controller.canInsertHeading()
    },
    {
      id: editorCommandIds.link,
      title: titles.link,
      description: titles.linkDescription,
      execute: () => {
        if (!controller.canInsertLink()) {
          return;
        }

        return controller.insertLink();
      },
      isEnabled: () => controller.canInsertLink()
    },
    {
      id: editorCommandIds.insertHorizontalRule,
      title: titles.insertHorizontalRule,
      description: titles.insertHorizontalRuleDescription,
      execute: () => {
        if (!controller.canInsertHorizontalRule()) {
          return;
        }

        return controller.insertHorizontalRule();
      },
      isEnabled: () => controller.canInsertHorizontalRule()
    },
    {
      id: editorCommandIds.insertCodeBlock,
      title: titles.insertCodeBlock,
      description: titles.insertCodeBlockDescription,
      execute: () => {
        if (!controller.canInsertCodeBlock()) {
          return;
        }

        return controller.insertCodeBlock();
      },
      isEnabled: () => controller.canInsertCodeBlock()
    },
    {
      id: editorCommandIds.insertTable,
      title: titles.insertTable,
      description: titles.insertTableDescription,
      execute: () => {
        if (!controller.canInsertTable()) {
          return;
        }

        return controller.insertTable();
      },
      isEnabled: () => controller.canInsertTable()
    },
    {
      id: editorCommandIds.insertCallout,
      title: titles.insertCallout,
      description: titles.insertCalloutDescription,
      execute: () => {
        if (!controller.canInsertCallout()) {
          return;
        }

        return controller.insertCallout();
      },
      isEnabled: () => controller.canInsertCallout()
    },
    {
      id: editorCommandIds.insertRuby,
      title: titles.insertRuby,
      description: titles.insertRubyDescription,
      execute: () => {
        if (!controller.canInsertRuby()) {
          return;
        }

        return controller.insertRuby();
      },
      isEnabled: () => controller.canInsertRuby()
    },
    {
      id: editorCommandIds.insertEmphasisMark,
      title: titles.insertEmphasisMark,
      description: titles.insertEmphasisMarkDescription,
      execute: () => {
        if (!controller.canInsertEmphasisMark()) {
          return;
        }

        return controller.insertEmphasisMark();
      },
      isEnabled: () => controller.canInsertEmphasisMark()
    },
    {
      id: editorCommandIds.togglePreview,
      title: titles.togglePreview,
      description: titles.togglePreviewDescription,
      execute: () => {
        if (!controller.canTogglePreview()) {
          return;
        }

        return controller.togglePreview();
      },
      isEnabled: () => controller.canTogglePreview()
    },
    {
      id: editorCommandIds.undo,
      title: titles.undo,
      description: titles.undoDescription,
      execute: () =>
        controller.delegateNativeEditCommand(editorCommandIds.undo),
      isEnabled: () =>
        controller.canDelegateNativeEditCommand(editorCommandIds.undo)
    },
    {
      id: editorCommandIds.redo,
      title: titles.redo,
      description: titles.redoDescription,
      execute: () =>
        controller.delegateNativeEditCommand(editorCommandIds.redo),
      isEnabled: () =>
        controller.canDelegateNativeEditCommand(editorCommandIds.redo)
    },
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
