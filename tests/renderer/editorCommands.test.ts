import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommandDisabledError,
  CommandRegistry
} from "../../src/shared/commandRegistry";
import { editCommandIds } from "../../src/shared/commandIds";
import {
  createEditorCommandTitles,
  editorCommandIds,
  projectOwnedWriteAllowedCommandWhen,
  registerEditorCommands,
  saveAsCommandWhen,
  saveDocumentCommandWhen
} from "../../src/renderer/editorCommands";
import {
  createProjectDocumentEditorId,
  type EditorId
} from "../../src/shared/editorId";

const titles = {
  openMarkdownDocument: "Open Markdown file",
  openMarkdownDocumentDescription:
    "Open a Markdown file outside the current project.",
  saveDocument: "Save Current Document",
  saveDocumentDescription:
    "Save the current document and overwrite the existing file.",
  saveAs: "Save current document as",
  saveAsDescription:
    "Save the current document with a different name and location.",
  closeEditor: "Close Current Document",
  closeEditorDescription:
    "Close the current document. Check for unsaved changes before closing.",
  cutSelection: "Cut",
  cutSelectionDescription: "Cut the selected text in the current editor.",
  copySelection: "Copy",
  copySelectionDescription: "Copy the selected text in the current editor.",
  pasteSelection: "Paste",
  pasteSelectionDescription:
    "Paste text at the current cursor position in the editor.",
  selectAllSelection: "Select All",
  selectAllSelectionDescription: "Select all text in the current editor."
};
const executionOptions = { source: "toolbar" } as const;
const someEditorId: EditorId = createProjectDocumentEditorId("chapter-01.md", {
  rootPath: "C:\\Novel"
});

function registerEditorCommandSet(
  registry: CommandRegistry,
  overrides: Partial<{
    openMarkdownDocument: () => void | Promise<void>;
    saveCurrentDocument: () => void | Promise<void>;
    saveCurrentDocumentAs: () => void | Promise<void>;
    canSaveCurrentDocument: () => boolean;
    canSaveCurrentDocumentAs: () => boolean;
    closeEditor: (editorId?: EditorId) => void | Promise<void>;
    canCloseEditor: (editorId?: EditorId) => boolean;
    delegateNativeEditCommand: (
      commandId: (typeof editCommandIds)[number]
    ) => void | Promise<void>;
    canDelegateNativeEditCommand: (
      commandId: (typeof editCommandIds)[number]
    ) => boolean;
  }> = {}
): void {
  registerEditorCommands(
    registry,
    {
      openMarkdownDocument: () => undefined,
      saveCurrentDocument: () => undefined,
      saveCurrentDocumentAs: () => undefined,
      canSaveCurrentDocument: () => true,
      canSaveCurrentDocumentAs: () => true,
      closeEditor: () => undefined,
      canCloseEditor: () => true,
      delegateNativeEditCommand: () => undefined,
      canDelegateNativeEditCommand: () => true,
      ...overrides
    },
    titles
  );

  // `editor.document.save` now also carries a `when` (#128); tests in this
  // file exercise the pre-existing Command.isEnabled/controller wiring, so
  // default the live context to permissive unless a test overrides it.
  registry.setCommandContextProvider(() => ({
    "editor.hasDocument": true,
    "editor.isDirty": true,
    "editor.kind.markdown": true
  }));
}

describe("editor commands", () => {
  it("registers markdown open and current editor save commands", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(registry.list().map((command) => command.id)).toEqual([
      "editor.document.markdown.open",
      "editor.document.save",
      "editor.saveAs",
      "editor.close",
      "editor.selection.cut",
      "editor.selection.copy",
      "editor.selection.paste",
      "editor.selection.selectAll"
    ]);
  });

  it("adds exactly the four Edit selection command IDs", () => {
    expect([...editCommandIds]).toEqual([
      "editor.selection.cut",
      "editor.selection.copy",
      "editor.selection.paste",
      "editor.selection.selectAll"
    ]);
    expect([...editCommandIds]).not.toContain("editor.rightClick.cut");
    expect([...editCommandIds].join("\n")).not.toContain("shortcut");
  });

  it("routes editor commands to their controller methods", async () => {
    const registry = new CommandRegistry();
    const openMarkdownDocument = vi.fn();
    const saveCurrentDocument = vi.fn();
    const saveCurrentDocumentAs = vi.fn();

    registerEditorCommandSet(registry, {
      openMarkdownDocument,
      saveCurrentDocument,
      saveCurrentDocumentAs
    });

    await registry.execute(
      editorCommandIds.openMarkdownDocument,
      executionOptions
    );
    await registry.execute(editorCommandIds.saveDocument, executionOptions);
    await registry.execute(editorCommandIds.saveAs, executionOptions);

    expect(openMarkdownDocument).toHaveBeenCalledTimes(1);
    expect(saveCurrentDocument).toHaveBeenCalledTimes(1);
    expect(saveCurrentDocumentAs).toHaveBeenCalledTimes(1);
  });

  it("routes Edit commands to native edit delegation through the controller", async () => {
    const registry = new CommandRegistry();
    const delegateNativeEditCommand = vi.fn();

    registerEditorCommandSet(registry, {
      delegateNativeEditCommand
    });

    for (const commandId of editCommandIds) {
      await registry.execute(commandId, executionOptions);
    }

    expect(delegateNativeEditCommand.mock.calls.map((call) => call[0])).toEqual(
      [...editCommandIds]
    );
  });

  it("reports save enablement from the current editor save state", () => {
    const registry = new CommandRegistry();
    const canSaveCurrentDocument = vi.fn(() => false);

    registerEditorCommandSet(registry, { canSaveCurrentDocument });

    expect(registry.isEnabled(editorCommandIds.openMarkdownDocument)).toBe(true);
    expect(registry.isEnabled(editorCommandIds.saveDocument)).toBe(false);
    expect(registry.isEnabled(editorCommandIds.saveAs)).toBe(true);
    expect(canSaveCurrentDocument).toHaveBeenCalledTimes(1);
  });

  it("reports Edit command enablement through Command.isEnabled", () => {
    const registry = new CommandRegistry();
    const canDelegateNativeEditCommand = vi.fn(
      (commandId: (typeof editCommandIds)[number]) =>
        commandId !== editorCommandIds.pasteSelection
    );

    registerEditorCommandSet(registry, { canDelegateNativeEditCommand });

    expect(registry.isEnabled(editorCommandIds.cutSelection)).toBe(true);
    expect(registry.isEnabled(editorCommandIds.copySelection)).toBe(true);
    expect(registry.isEnabled(editorCommandIds.pasteSelection)).toBe(false);
    expect(registry.isEnabled(editorCommandIds.selectAllSelection)).toBe(true);
    expect(canDelegateNativeEditCommand).toHaveBeenCalledTimes(4);
  });

  it("does not run save when the current editor cannot be saved", async () => {
    // Since the #128 follow-up, CommandRegistry.execute enforces
    // Command.isEnabled itself, so this is now rejected at the registry
    // boundary (CommandDisabledError) rather than by the command body's own
    // internal early-return.
    const registry = new CommandRegistry();
    const saveCurrentDocument = vi.fn();

    registerEditorCommandSet(registry, {
      saveCurrentDocument,
      canSaveCurrentDocument: () => false
    });

    await expect(
      registry.execute(editorCommandIds.saveDocument, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);

    expect(saveCurrentDocument).not.toHaveBeenCalled();
  });

  it("declares editor.document.save's when as hasDocument and isDirty", () => {
    expect(saveDocumentCommandWhen).toEqual({
      allOf: [
        { key: "editor.hasDocument" },
        { key: "editor.isDirty" },
        {
          not: {
            key: "activeEditor.saveBlockedByReadOnlyProjectRootForUi"
          }
        },
        projectOwnedWriteAllowedCommandWhen
      ]
    });
  });

  it("disables Save when UI containment blocks the active editor path", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(
      registry.enablementForContext(editorCommandIds.saveDocument, {
        "editor.hasDocument": true,
        "editor.isDirty": true,
        "editor.document.projectOwned": false,
        "activeEditor.saveBlockedByReadOnlyProjectRootForUi": true,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });
  });

  it("disables project document Save in read-only project sessions", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(
      registry.enablementForContext(editorCommandIds.saveDocument, {
        "editor.hasDocument": true,
        "editor.isDirty": true,
        "editor.document.projectOwned": true,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: false,
      disabledReason: "readOnlyProject"
    });
  });

  it("keeps project document Save enabled in readWrite project sessions", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(
      registry.enablementForContext(editorCommandIds.saveDocument, {
        "editor.hasDocument": true,
        "editor.isDirty": true,
        "editor.document.projectOwned": true,
        "project.access.readWrite": true,
        "project.access.readOnly": false
      })
    ).toEqual({
      enabled: true,
      disabledReason: null
    });
  });

  it("does not disable standalone Save because a project session is read-only", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(
      registry.enablementForContext(editorCommandIds.saveDocument, {
        "editor.hasDocument": true,
        "editor.isDirty": true,
        "editor.document.projectOwned": false,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: true,
      disabledReason: null
    });
  });

  it("keeps Save As independent from read-only project write gating", () => {
    const registry = new CommandRegistry();

    registerEditorCommandSet(registry);

    expect(saveAsCommandWhen).toEqual({
      allOf: [{ key: "editor.hasDocument" }, { key: "editor.kind.markdown" }]
    });
    expect(
      registry.enablementForContext(editorCommandIds.saveAs, {
        "editor.hasDocument": true,
        "editor.kind.markdown": true,
        "editor.document.projectOwned": true,
        "activeEditor.saveBlockedByReadOnlyProjectRootForUi": true,
        "project.access.readWrite": false,
        "project.access.readOnly": true
      })
    ).toEqual({
      enabled: true,
      disabledReason: null
    });
  });

  it("blocks save execution via the registry when the live context is not dirty, even though Command.isEnabled allows it", async () => {
    const registry = new CommandRegistry();
    const saveCurrentDocument = vi.fn();

    registerEditorCommandSet(registry, {
      saveCurrentDocument,
      canSaveCurrentDocument: () => true
    });
    registry.setCommandContextProvider(() => ({
      "editor.hasDocument": true,
      "editor.isDirty": false
    }));

    await expect(
      registry.execute(editorCommandIds.saveDocument, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(saveCurrentDocument).not.toHaveBeenCalled();
  });

  it("allows save execution once the live context reports hasDocument and isDirty", async () => {
    const registry = new CommandRegistry();
    const saveCurrentDocument = vi.fn();

    registerEditorCommandSet(registry, {
      saveCurrentDocument,
      canSaveCurrentDocument: () => true
    });
    registry.setCommandContextProvider(() => ({
      "editor.hasDocument": true,
      "editor.isDirty": true
    }));

    await registry.execute(editorCommandIds.saveDocument, executionOptions);

    expect(saveCurrentDocument).toHaveBeenCalledTimes(1);
  });

  it("creates localized command titles from command i18n keys", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createEditorCommandTitles(translate)).toEqual({
      openMarkdownDocument: "translated:command.editor.document.markdown.open",
      openMarkdownDocumentDescription:
        "translated:command.editor.document.markdown.open.description",
      saveDocument: "translated:command.editor.document.save",
      saveDocumentDescription:
        "translated:command.editor.document.save.description",
      saveAs: "translated:command.editor.saveAs",
      saveAsDescription: "translated:command.editor.saveAs.description",
      closeEditor: "translated:command.editor.document.close",
      closeEditorDescription:
        "translated:command.editor.document.close.description",
      cutSelection: "translated:command.editor.selection.cut",
      cutSelectionDescription:
        "translated:command.editor.selection.cut.description",
      copySelection: "translated:command.editor.selection.copy",
      copySelectionDescription:
        "translated:command.editor.selection.copy.description",
      pasteSelection: "translated:command.editor.selection.paste",
      pasteSelectionDescription:
        "translated:command.editor.selection.paste.description",
      selectAllSelection: "translated:command.editor.selection.selectAll",
      selectAllSelectionDescription:
        "translated:command.editor.selection.selectAll.description"
    });
  });

  it("editor.close forwards an explicit editorId to the controller (#184)", async () => {
    const registry = new CommandRegistry();
    const closeEditor = vi.fn();

    registerEditorCommandSet(registry, { closeEditor });

    await registry.execute(editorCommandIds.close, executionOptions, {
      editorId: someEditorId
    });

    expect(closeEditor).toHaveBeenCalledWith(someEditorId);
    expect(closeEditor).toHaveBeenCalledTimes(1);
  });

  it("editor.close without editorId (and without any args, e.g. from Ctrl+W) passes undefined so the controller defaults to the active editor (#184)", async () => {
    const registry = new CommandRegistry();
    const closeEditor = vi.fn();

    registerEditorCommandSet(registry, { closeEditor });

    await registry.execute(editorCommandIds.close, executionOptions);

    expect(closeEditor).toHaveBeenCalledWith(undefined);
    expect(closeEditor).toHaveBeenCalledTimes(1);
  });

  it("editor.close reports enablement from the controller's canCloseEditor, per-editorId", () => {
    const registry = new CommandRegistry();
    const canCloseEditor = vi.fn(
      (editorId?: EditorId) => editorId === undefined
    );

    registerEditorCommandSet(registry, { canCloseEditor });

    expect(
      registry.isEnabled(editorCommandIds.close, { editorId: someEditorId })
    ).toBe(false);
    expect(registry.isEnabled(editorCommandIds.close)).toBe(true);
  });

  it("editor.close execution is blocked (command.ignored policy, via CommandDisabledError) when canCloseEditor reports no resolvable target", async () => {
    const registry = new CommandRegistry();
    const closeEditor = vi.fn();

    registerEditorCommandSet(registry, {
      closeEditor,
      canCloseEditor: () => false
    });

    await expect(
      registry.execute(editorCommandIds.close, executionOptions)
    ).rejects.toBeInstanceOf(CommandDisabledError);
    expect(closeEditor).not.toHaveBeenCalled();
  });

  it("does not introduce toolbar-prefixed Command IDs", () => {
    expect(Object.values(editorCommandIds).join("\n")).not.toContain("toolbar.");
  });

  it("keeps editor command definitions independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/editorCommands.ts", "utf8");

    expect(source).toContain("../shared/commandIds");
    expect(source).not.toContain("defineCommandId(");
    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });
});
