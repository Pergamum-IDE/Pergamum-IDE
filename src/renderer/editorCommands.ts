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
  indent(): void | Promise<void>;
  canIndent(): boolean;
  outdent(): void | Promise<void>;
  canOutdent(): boolean;
  togglePreview(): void | Promise<void>;
  canTogglePreview(): boolean;
  toggleInstantJapaneseLint?(): void | Promise<void>;
  canToggleInstantJapaneseLint?(): boolean;
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
  toggleInstantJapaneseLint?: string;
  toggleInstantJapaneseLintDescription?: string;
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
  indent: string;
  indentDescription: string;
  outdent: string;
  outdentDescription: string;
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
    toggleInstantJapaneseLint: translate(
      "command.editor.japaneseLint.toggleInstant"
    ),
    toggleInstantJapaneseLintDescription: translate(
      "command.editor.japaneseLint.toggleInstant.description"
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
    indent: translate("command.editor.indent"),
    indentDescription: translate("command.editor.indent.description"),
    outdent: translate("command.editor.outdent"),
    outdentDescription: translate("command.editor.outdent.description"),
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
  controller: EditorCommandController,
  order: number
): EditorCommand {
  return {
    id: commandId,
    title,
    description,
    category: "edit",
    paletteOrder: order,
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
      category: "file",
      paletteOrder: 40,
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
      category: "file",
      paletteOrder: 50,
      execute: () => controller.openMarkdownDocument()
    },
    {
      id: editorCommandIds.saveDocument,
      title: titles.saveDocument,
      description: titles.saveDocumentDescription,
      category: "file",
      paletteOrder: 60,
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
      category: "file",
      paletteOrder: 70,
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
      category: "file",
      paletteOrder: 80,
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
      category: "file",
      paletteOrder: 90,
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
      category: "formatting",
      paletteOrder: 120,
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
      category: "formatting",
      paletteOrder: 20,
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
      category: "view",
      paletteOrder: 20,
      execute: () => {
        if (!controller.canToggleSyntaxChecker()) {
          return;
        }

        return controller.toggleSyntaxChecker();
      },
      isEnabled: () => controller.canToggleSyntaxChecker()
    },
    {
      id: editorCommandIds.toggleInstantJapaneseLint,
      title:
        titles.toggleInstantJapaneseLint ??
        "Toggle Instant Japanese Style Check",
      description: titles.toggleInstantJapaneseLintDescription ?? "",
      category: "view",
      paletteOrder: 25,
      execute: () => {
        if (!controller.canToggleInstantJapaneseLint?.()) {
          return;
        }

        return controller.toggleInstantJapaneseLint?.();
      },
      isEnabled: () => controller.canToggleInstantJapaneseLint?.() ?? false
    },
    {
      id: editorCommandIds.bold,
      title: titles.bold,
      description: titles.boldDescription,
      category: "formatting",
      paletteOrder: 10,
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
      category: "formatting",
      paletteOrder: 15,
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
      category: "formatting",
      paletteOrder: 18,
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
      category: "formatting",
      paletteOrder: 40,
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
      category: "formatting",
      paletteOrder: 50,
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
      category: "formatting",
      paletteOrder: 60,
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
      category: "formatting",
      paletteOrder: 70,
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
      category: "formatting",
      paletteOrder: 80,
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
      category: "formatting",
      paletteOrder: 90,
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
      category: "formatting",
      paletteOrder: 100,
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
      category: "formatting",
      paletteOrder: 110,
      execute: () => {
        if (!controller.canInsertEmphasisMark()) {
          return;
        }

        return controller.insertEmphasisMark();
      },
      isEnabled: () => controller.canInsertEmphasisMark()
    },
    {
      id: editorCommandIds.indent,
      title: titles.indent,
      description: titles.indentDescription,
      category: "edit",
      paletteOrder: 70,
      execute: () => {
        if (!controller.canIndent()) {
          return;
        }

        return controller.indent();
      },
      isEnabled: () => controller.canIndent()
    },
    {
      id: editorCommandIds.outdent,
      title: titles.outdent,
      description: titles.outdentDescription,
      category: "edit",
      paletteOrder: 80,
      execute: () => {
        if (!controller.canOutdent()) {
          return;
        }

        return controller.outdent();
      },
      isEnabled: () => controller.canOutdent()
    },
    {
      id: editorCommandIds.togglePreview,
      title: titles.togglePreview,
      description: titles.togglePreviewDescription,
      category: "view",
      paletteOrder: 10,
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
      category: "edit",
      paletteOrder: 10,
      execute: () =>
        controller.delegateNativeEditCommand(editorCommandIds.undo),
      isEnabled: () =>
        controller.canDelegateNativeEditCommand(editorCommandIds.undo)
    },
    {
      id: editorCommandIds.redo,
      title: titles.redo,
      description: titles.redoDescription,
      category: "edit",
      paletteOrder: 20,
      execute: () =>
        controller.delegateNativeEditCommand(editorCommandIds.redo),
      isEnabled: () =>
        controller.canDelegateNativeEditCommand(editorCommandIds.redo)
    },
    editCommand(
      editCommandIds[0],
      titles.cutSelection,
      titles.cutSelectionDescription,
      controller,
      30
    ),
    editCommand(
      editCommandIds[1],
      titles.copySelection,
      titles.copySelectionDescription,
      controller,
      40
    ),
    editCommand(
      editCommandIds[2],
      titles.pasteSelection,
      titles.pasteSelectionDescription,
      controller,
      50
    ),
    editCommand(
      editCommandIds[3],
      titles.selectAllSelection,
      titles.selectAllSelectionDescription,
      controller,
      60
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
