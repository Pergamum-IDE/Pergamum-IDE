import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import { t } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import {
  filterCommandPaletteEntries,
  listCommandPaletteEntries
} from "../../src/renderer/commandPaletteEntries";
import {
  createFileExplorerCommandTitles,
  fileExplorerCommandIds,
  registerFileExplorerCommands
} from "../../src/renderer/fileExplorerCommands";
import {
  createWorkspaceCommandTitles,
  registerWorkspaceCommands,
  workspaceCommandIds
} from "../../src/renderer/workspaceCommands";
import type { FileExplorerCreateKind } from "../../src/renderer/fileExplorerCreateMessages";

const executionOptions = { source: "commandPalette" } as const;

const titles = {
  createMarkdownFile: "Create New Markdown File",
  createMarkdownFileDescription:
    "Create a Markdown file at the current File Explorer selection.",
  createFolder: "Create New Folder",
  createFolderDescription:
    "Create a folder at the current File Explorer selection.",
  rename: "Rename",
  renameDescription: "Rename the selected File Explorer file or empty folder."
};

function registryWith(
  requestFileExplorerCreate: (kind: FileExplorerCreateKind) => void,
  requestRenameActiveEditorFile: () => void = () => undefined
): CommandRegistry {
  const registry = new CommandRegistry();
  registerFileExplorerCommands(
    registry,
    { requestFileExplorerCreate, requestRenameActiveEditorFile },
    titles
  );
  return registry;
}

const noProjectContext: CommandContext = {
  "project.isOpen": false,
  "project.access.readWrite": false
};
const readOnlyProjectContext: CommandContext = {
  "project.isOpen": true,
  "project.access.readOnly": true,
  "project.access.readWrite": false
};
const writableProjectContext: CommandContext = {
  "project.isOpen": true,
  "project.access.readWrite": true,
  // #318: the global Rename also requires an active editor backed by a
  // project file. Create commands ignore this key.
  "editor.document.projectFile": true
};
const writableProjectNoActiveFileContext: CommandContext = {
  "project.isOpen": true,
  "project.access.readWrite": true,
  "editor.document.projectFile": false
};

describe("File Explorer create commands (#311)", () => {
  it("registers Create New Markdown File and Create New Folder with stable IDs", () => {
    const registry = registryWith(() => undefined);

    expect(registry.list().map((command) => String(command.id))).toEqual([
      "workspace.files.createMarkdownFile",
      "workspace.files.createFolder",
      "workspace.files.rename"
    ]);
  });

  it("routes each create command to the shared File Explorer create request", async () => {
    const kinds: FileExplorerCreateKind[] = [];
    const registry = registryWith((kind) => kinds.push(kind));
    registry.setCommandContextProvider(() => writableProjectContext);

    await registry.execute(
      fileExplorerCommandIds.createMarkdownFile,
      executionOptions
    );
    await registry.execute(
      fileExplorerCommandIds.createFolder,
      executionOptions
    );

    expect(kinds).toEqual(["file", "folder"]);
  });

  it("routes rename to the active-editor rename request (#318)", async () => {
    const rename = vi.fn();
    const registry = registryWith(() => undefined, rename);
    registry.setCommandContextProvider(() => writableProjectContext);

    await registry.execute(fileExplorerCommandIds.rename, executionOptions);

    expect(rename).toHaveBeenCalledTimes(1);
  });

  it("is unavailable without an active project-file editor (#318)", () => {
    const registry = registryWith(() => undefined);

    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.rename,
        writableProjectNoActiveFileContext
      )
    ).toBe(false);
    // Create commands never depend on the active editor.
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createMarkdownFile,
        writableProjectNoActiveFileContext
      )
    ).toBe(true);
  });

  it("does not run the rename request when the command is disabled (#318)", async () => {
    const rename = vi.fn();
    const registry = registryWith(() => undefined, rename);
    registry.setCommandContextProvider(
      () => writableProjectNoActiveFileContext
    );

    await expect(
      registry.execute(fileExplorerCommandIds.rename, executionOptions)
    ).rejects.toThrow();

    expect(rename).not.toHaveBeenCalled();
  });

  it("is unavailable when the active project file is dirty (#318)", async () => {
    const rename = vi.fn();
    const registry = registryWith(() => undefined, rename);
    const dirtyContext: CommandContext = {
      ...writableProjectContext,
      "editor.isDirty": true
    };

    expect(
      registry.isEnabledForContext(fileExplorerCommandIds.rename, dirtyContext)
    ).toBe(false);

    registry.setCommandContextProvider(() => dirtyContext);
    await expect(
      registry.execute(fileExplorerCommandIds.rename, executionOptions)
    ).rejects.toThrow();
    expect(rename).not.toHaveBeenCalled();
  });

  it("is available only for a writable open project with a clean active project file (#318)", () => {
    const registry = registryWith(() => undefined);

    // editor tab 0 / untitled / external / project-outside / another
    // project's file all resolve to editor.document.projectFile = false in
    // App (see activeProjectDocumentRelativePath in openDocuments.test.ts),
    // which this single gate case represents.
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.rename,
        writableProjectContext
      )
    ).toBe(true);
    for (const context of [
      writableProjectNoActiveFileContext,
      { ...writableProjectContext, "editor.isDirty": true },
      { ...writableProjectContext, "project.isOpen": false },
      readOnlyProjectContext,
      noProjectContext
    ] satisfies CommandContext[]) {
      expect(
        registry.isEnabledForContext(fileExplorerCommandIds.rename, context)
      ).toBe(false);
    }
  });

  it("is unavailable when no project is open", () => {
    const registry = registryWith(() => undefined);

    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createMarkdownFile,
        noProjectContext
      )
    ).toBe(false);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createFolder,
        noProjectContext
      )
    ).toBe(false);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.rename,
        noProjectContext
      )
    ).toBe(false);
  });

  it("is unavailable in a read-only project", () => {
    const registry = registryWith(() => undefined);

    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createMarkdownFile,
        readOnlyProjectContext
      )
    ).toBe(false);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createFolder,
        readOnlyProjectContext
      )
    ).toBe(false);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.rename,
        readOnlyProjectContext
      )
    ).toBe(false);
  });

  it("is available for a writable open project", () => {
    const registry = registryWith(() => undefined);

    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createMarkdownFile,
        writableProjectContext
      )
    ).toBe(true);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.createFolder,
        writableProjectContext
      )
    ).toBe(true);
    expect(
      registry.isEnabledForContext(
        fileExplorerCommandIds.rename,
        writableProjectContext
      )
    ).toBe(true);
  });

  it("does not run the create request when the command is disabled", async () => {
    const kinds: FileExplorerCreateKind[] = [];
    const registry = registryWith((kind) => kinds.push(kind));
    registry.setCommandContextProvider(() => readOnlyProjectContext);

    await expect(
      registry.execute(
        fileExplorerCommandIds.createMarkdownFile,
        executionOptions
      )
    ).rejects.toThrow();

    expect(kinds).toEqual([]);
  });

  it("localizes titles from the command-id key stems", () => {
    const translate = vi.fn((key: string) => `t:${key}`);

    expect(createFileExplorerCommandTitles(translate)).toEqual({
      createMarkdownFile: "t:command.workspace.files.createMarkdownFile",
      createMarkdownFileDescription:
        "t:command.workspace.files.createMarkdownFile.description",
      createFolder: "t:command.workspace.files.createFolder",
      createFolderDescription:
        "t:command.workspace.files.createFolder.description",
      rename: "t:command.workspace.files.rename",
      renameDescription: "t:command.workspace.files.rename.description"
    });
  });

  it("labels Rename with the active editor target file name when given one (#318)", () => {
    const translate = vi.fn(
      (key: string, values?: Record<string, unknown>) =>
        values ? `t:${key}:${JSON.stringify(values)}` : `t:${key}`
    );

    expect(
      createFileExplorerCommandTitles(translate, "chapter-01.md").rename
    ).toBe(
      't:command.workspace.files.rename.withTarget:{"name":"chapter-01.md"}'
    );
    // No target → the plain label.
    expect(createFileExplorerCommandTitles(translate, null).rename).toBe(
      "t:command.workspace.files.rename"
    );
  });

  it("shows the target file name in the Command Palette Rename entry (#318)", () => {
    const registry = new CommandRegistry();
    registerFileExplorerCommands(
      registry,
      {
        requestFileExplorerCreate: () => undefined,
        requestRenameActiveEditorFile: () => undefined
      },
      createFileExplorerCommandTitles(
        (key, values) => t("en", key, values),
        "chapter-01.md"
      )
    );

    const renameEntry = listCommandPaletteEntries(registry).find(
      (entry) => String(entry.id) === "workspace.files.rename"
    );

    expect(renameEntry?.title).toBe(
      "Rename Active Editor File: chapter-01.md"
    );
  });

  it("defines Japanese and English labels/descriptions", () => {
    expect(jaTranslations["command.workspace.files.createMarkdownFile"]).toBe(
      "新規 Markdown ファイルを作成"
    );
    expect(
      jaTranslations["command.workspace.files.createMarkdownFile.description"]
    ).toBe(
      "ファイルエクスプローラーの選択位置に Markdown ファイルを作成します。"
    );
    expect(jaTranslations["command.workspace.files.createFolder"]).toBe(
      "新規フォルダを作成"
    );
    expect(enTranslations["command.workspace.files.createMarkdownFile"]).toBe(
      "Create New Markdown File"
    );
    expect(enTranslations["command.workspace.files.createFolder"]).toBe(
      "Create New Folder"
    );
    expect(jaTranslations["command.workspace.files.rename"]).toBe(
      "アクティブなファイル名を変更"
    );
    expect(enTranslations["command.workspace.files.rename"]).toBe(
      "Rename Active Editor File"
    );
    expect(jaTranslations["command.workspace.files.rename.withTarget"]).toBe(
      "アクティブなファイル名を変更: {name}"
    );
    expect(enTranslations["command.workspace.files.rename.withTarget"]).toBe(
      "Rename Active Editor File: {name}"
    );
  });

  it("keeps the command module free of React and DOM APIs", () => {
    const source = readFileSync(
      "src/renderer/fileExplorerCommands.ts",
      "utf8"
    );

    expect(source).not.toContain('from "react"');
    expect(source).not.toContain("window.");
    // Real DOM access only — the `editor.document.projectFile` enablement key
    // (#318) is a plain string, not a `document` global reference.
    expect(source).not.toMatch(
      /\bdocument\.(getElementById|querySelector|createElement|body|addEventListener|documentElement)/
    );
  });
});

describe("Toggle File Explorer command wording (#311)", () => {
  it("labels and describes the command as a visibility toggle", () => {
    expect(jaTranslations["command.workspace.files.toggle"]).toBe(
      "ファイルエクスプローラーの表示を切り替え"
    );
    expect(jaTranslations["command.workspace.files.toggle.description"]).toBe(
      "ファイルエクスプローラーを表示または非表示にします。"
    );
    expect(enTranslations["command.workspace.files.toggle"]).toBe(
      "Toggle File Explorer"
    );
    expect(enTranslations["command.workspace.files.toggle.description"]).toBe(
      "Show or hide the File Explorer."
    );
  });

  it("keeps the command ID stable while the wording changes", () => {
    expect(String(workspaceCommandIds.toggleFiles)).toBe(
      "workspace.files.toggle"
    );
  });

  function workspacePaletteEntries(language: "en" | "ja") {
    const registry = new CommandRegistry();
    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: () => undefined,
        openApplicationSettings: () => undefined
      },
      createWorkspaceCommandTitles((key, values) => t(language, key, values))
    );
    return listCommandPaletteEntries(registry);
  }

  it("Command Palette search finds it by the new toggle wording", () => {
    expect(
      filterCommandPaletteEntries(
        workspacePaletteEntries("en"),
        "Toggle File Explorer"
      ).map((entry) => String(entry.id))
    ).toContain(String(workspaceCommandIds.toggleFiles));

    expect(
      filterCommandPaletteEntries(
        workspacePaletteEntries("ja"),
        "表示を切り替え"
      ).map((entry) => String(entry.id))
    ).toContain(String(workspaceCommandIds.toggleFiles));
  });
});

describe("App wiring for File Explorer create commands (#311)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("registers the File Explorer create and rename commands", () => {
    expect(appSource).toContain("registerFileExplorerCommands(");
    expect(appSource).toContain("createFileExplorerCommandTitles(");
  });

  it("passes the active editor target file name into the Rename command label (#318)", () => {
    expect(appSource).toContain(
      "createFileExplorerCommandTitles(\n        translate,\n        renameActiveEditorTargetName\n      )"
    );
    // The label name is derived from the active project document, not the
    // File Explorer selection, and is independent of dirtiness.
    expect(appSource).toContain(
      "const renameActiveEditorTargetRelativePath = isEditorAreaSpecialTabActive"
    );
    expect(appSource).toContain(
      "activeProjectDocumentRelativePath(openDocumentsState)"
    );
    expect(appSource).toContain(
      "renameActiveEditorTargetName,\n    sidebarMode,"
    );
    // The `when` gate key and the label name share one source of truth.
    expect(appSource).toContain(
      "editorDocumentProjectFile:\n          renameActiveEditorTargetRelativePath !== null"
    );
  });

  it("reveals the File Explorer without collapsing it, then hands over a create request", () => {
    const start = appSource.indexOf("requestFileExplorerCreate: (kind) => {");
    expect(start).toBeGreaterThan(-1);
    const handler = appSource.slice(start, start + 1200);

    expect(handler).toContain("revealFileExplorer();");
    // Non-toggling reveal stays centralized and never uses the toggle helper.
    expect(appSource).toContain('setSidebarMode("files");');
    expect(appSource).toContain("collapsed: false");
    expect(handler).not.toContain("resolveSidebarToggle");
    expect(handler).toContain("fileExplorerCreateRequestSeqRef.current += 1;");
    expect(handler).toContain("setFileExplorerCreateEntryRequest({");
    expect(handler).toContain(
      "token: fileExplorerCreateRequestSeqRef.current"
    );
  });

  it("uses a session-monotonic request token that is never reused", () => {
    // The seq ref only ever increments; the request state is separately
    // cleared to null once consumed, so a later remount cannot replay it.
    expect(appSource).toContain("const fileExplorerCreateRequestSeqRef = useRef(0)");
    expect(appSource).not.toContain(
      "token: (previous?.token ?? 0) + 1"
    );
  });

  it("passes the create request and its consumed callback to the File Explorer sidebar", () => {
    expect(appSource).toContain(
      "fileExplorerCreateEntryRequest={\n                        fileExplorerCreateEntryRequest\n                      }"
    );
    expect(appSource).toContain(
      "onFileExplorerCreateEntryRequestHandled={() => {\n                        setFileExplorerCreateEntryRequest(null);\n                      }}"
    );
  });

  it("targets the active editor's project file for a global rename (#318)", () => {
    const start = appSource.indexOf(
      "requestRenameActiveEditorFile: () => {"
    );
    expect(start).toBeGreaterThan(-1);
    const handler = appSource.slice(start, start + 900);

    // Resolve the target from the active editor — never the File Explorer
    // selection — and do nothing when there is no such target.
    expect(handler).toContain(
      "activeProjectDocumentRelativePath(\n            openDocumentsStateRef.current\n          )"
    );
    expect(handler).toContain("if (relativePath === null) {");
    expect(handler.indexOf("if (relativePath === null) {")).toBeLessThan(
      handler.indexOf("revealFileExplorer();")
    );

    expect(handler).toContain("revealFileExplorer();");
    expect(handler).toContain("fileExplorerRenameRequestSeqRef.current += 1;");
    expect(handler).toContain("setFileExplorerRenameEntryRequest({");
    expect(handler).toContain(
      "token: fileExplorerRenameRequestSeqRef.current"
    );
    expect(handler).toContain("target: { relativePath }");
  });
});
