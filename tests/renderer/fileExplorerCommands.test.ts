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
    "Create a folder at the current File Explorer selection."
};

function registryWith(
  requestFileExplorerCreate: (kind: FileExplorerCreateKind) => void
): CommandRegistry {
  const registry = new CommandRegistry();
  registerFileExplorerCommands(registry, { requestFileExplorerCreate }, titles);
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
  "project.access.readWrite": true
};

describe("File Explorer create commands (#311)", () => {
  it("registers Create New Markdown File and Create New Folder with stable IDs", () => {
    const registry = registryWith(() => undefined);

    expect(registry.list().map((command) => String(command.id))).toEqual([
      "workspace.files.createMarkdownFile",
      "workspace.files.createFolder"
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
        "t:command.workspace.files.createFolder.description"
    });
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
  });

  it("keeps the command module free of React and DOM APIs", () => {
    const source = readFileSync(
      "src/renderer/fileExplorerCommands.ts",
      "utf8"
    );

    expect(source).not.toContain('from "react"');
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
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

  it("registers the File Explorer create commands", () => {
    expect(appSource).toContain("registerFileExplorerCommands(");
    expect(appSource).toContain("createFileExplorerCommandTitles(translate)");
  });

  it("reveals the File Explorer without collapsing it, then hands over a create request", () => {
    const start = appSource.indexOf("requestFileExplorerCreate: (kind) => {");
    expect(start).toBeGreaterThan(-1);
    const handler = appSource.slice(start, start + 1200);

    expect(handler).toContain('setSidebarMode("files");');
    // Non-toggling reveal: only ever uncollapses.
    expect(handler).toContain("collapsed: false");
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
});
