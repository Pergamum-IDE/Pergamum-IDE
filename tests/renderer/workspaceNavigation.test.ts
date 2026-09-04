import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type {
  FileExplorerEntry,
  PergamumProject
} from "../../src/shared/api";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import { t, type Translate } from "../../src/shared/i18n";
import { ActivityBar } from "../../src/renderer/ActivityBar";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  FileExplorerView,
  flattenVisibleFileExplorerEntryPaths
} from "../../src/renderer/FileExplorer";
import { GlossarySidebar } from "../../src/renderer/GlossarySidebar";
import {
  createOpenDocumentsStateWithDocument,
  documentTabs
} from "../../src/renderer/openDocuments";
import type { SidebarMode } from "../../src/renderer/sidebarMode";
import { selectSidebarMode } from "../../src/renderer/sidebarMode";
import {
  registerWorkspaceCommands,
  workspaceCommandIds,
  workspaceFocusCommandIdForMode
} from "../../src/renderer/workspaceCommands";
import { WorkspaceSidebar } from "../../src/renderer/WorkspaceSidebar";

const translate: Translate = (key) => key;

const project: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [
    {
      relativePath: "chapter-01.md",
      name: "chapter-01.md"
    },
    {
      relativePath: "chapter-02.md",
      name: "chapter-02.md"
    }
  ]
};

const projectContext: ActiveProjectContext = {
  rootPath: project.rootPath
};

const rootFileExplorerEntries: FileExplorerEntry[] = [
  {
    kind: "folder",
    name: "Drafts",
    relativePath: "Drafts"
  },
  {
    kind: "file",
    name: "chapter-01.md",
    relativePath: "chapter-01.md"
  },
  {
    kind: "file",
    name: "chapter-02.md",
    relativePath: "chapter-02.md"
  },
  {
    kind: "file",
    name: "notes.txt",
    relativePath: "notes.txt"
  }
];

const draftFileExplorerEntries: FileExplorerEntry[] = [
  {
    kind: "file",
    name: "draft.md",
    relativePath: "Drafts/draft.md"
  }
];

type FileExplorerViewProps = Parameters<typeof FileExplorerView>[0];

function fileExplorerViewProps(
  overrides: Partial<FileExplorerViewProps> = {}
): FileExplorerViewProps {
  const props: FileExplorerViewProps = {
    projectName: project.name,
    rootEntries: rootFileExplorerEntries,
    entriesByDirectoryPath: {
      "": rootFileExplorerEntries,
      Drafts: draftFileExplorerEntries
    },
    expandedDirectoryPaths: new Set(),
    loadingDirectoryPaths: new Set(),
    unavailableDirectoryPaths: new Set(),
    isRootSelected: false,
    selectedRelativePath: null,
    highlightedRelativePath: null,
    translate,
    onReload: () => undefined,
    onToggleDirectory: () => undefined,
    onSelectRoot: () => undefined,
    onSelectEntry: () => undefined,
    onActivateDocument: () => undefined,
    ...overrides
  };

  // #323: the container keeps `selectedRelativePath` (the primary/focused
  // entry) as a member of `selectedPaths`. Mirror that here unless a test
  // sets the multi-selection explicitly.
  if (props.selectedPaths === undefined) {
    props.selectedPaths = props.selectedRelativePath
      ? new Set([props.selectedRelativePath])
      : new Set();
  }
  if (props.visibleOrder === undefined) {
    props.visibleOrder = flattenVisibleFileExplorerEntryPaths({
      rootEntries: props.rootEntries,
      entriesByDirectoryPath: props.entriesByDirectoryPath,
      expandedDirectoryPaths: props.expandedDirectoryPaths
    });
  }

  return props;
}

const timestamp = "2026-01-01T00:00:00.000Z";

function glossaryEntry(
  id: string,
  canonicalSurface: string,
  alternateSurface: string
): GlossaryEntry {
  return {
    id,
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: [],
    atoms: [
      {
        id: `${id}-canonical-atom`,
        entryId: id,
        sortOrder: 0,
        value: canonicalSurface,
        matchFlags: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: `${id}-alternate-atom`,
        entryId: id,
        sortOrder: 1,
        value: alternateSurface,
        matchFlags: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]
  };
}

const glossaryEntries = [
  glossaryEntry("entry-alpha", "王都", "首都"),
  glossaryEntry("entry-beta", "魔導炉", "炉")
];

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<ElementProps>) => boolean
): React.ReactElement<ElementProps>[] {
  const elements: React.ReactElement<ElementProps>[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<ElementProps>(child)) {
      return;
    }

    if (predicate(child)) {
      elements.push(child);
    }

    elements.push(...collectElements(child.props.children, predicate));
  });

  return elements;
}

function activityBarButtons(
  activeMode: SidebarMode,
  onSelectMode: (mode: SidebarMode) => void
): React.ReactElement<ElementProps>[] {
  const element = ActivityBar({
    activeMode,
    isApplicationSettingsActive: false,
    translate,
    onSelectMode,
    onOpenApplicationSettings: () => undefined
  });

  return collectElements(
    element,
    (child) => child.type === "button"
  );
}

function stubGlossaryApi(
  entries: GlossaryEntry[] = glossaryEntries
): {
  create: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const glossaryApi = {
    create: vi.fn(),
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue(entries),
    update: vi.fn(),
    delete: vi.fn()
  };

  vi.stubGlobal("window", {
    pergamum: {
      glossary: glossaryApi
    }
  });

  return glossaryApi;
}

describe("workspace navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Activity Bar with File Explorer, Search, and Glossary modes", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "files",
        isApplicationSettingsActive: false,
        translate,
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined
      })
    );

    expect(markup).toContain("activity.label");
    expect(markup).toContain("activity.files");
    expect(markup).toContain("activity.searchReplace");
    expect(markup).toContain("activity.glossary");
    expect(markup).toContain("activity.textMap");
    expect(markup).toContain("activity.documentNavigation");
    expect(markup).toContain("activity.applicationSettings");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).not.toContain("disabled");
  });

  it("localizes the Activity Bar File Explorer tooltip label", () => {
    const japaneseMarkup = renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "files",
        isApplicationSettingsActive: false,
        translate: (key, values) => t("ja", key, values),
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined
      })
    );
    const englishMarkup = renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "files",
        isApplicationSettingsActive: false,
        translate: (key, values) => t("en", key, values),
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined
      })
    );

    expect(japaneseMarkup).toContain('aria-label="ファイルエクスプローラー"');
    expect(japaneseMarkup).toContain('title="ファイルエクスプローラー"');
    expect(englishMarkup).toContain('aria-label="File Explorer"');
    expect(englishMarkup).toContain('title="File Explorer"');
  });

  it("treats File Explorer, Search, and Glossary as Sidebar mode selectors", () => {
    const onSelectMode = vi.fn<(mode: SidebarMode) => void>();
    const buttons = activityBarButtons("files", onSelectMode);

    const modeLabels = [
      ["activity.files", "files"],
      ["activity.searchReplace", "search"],
      ["activity.glossary", "glossary"],
      ["activity.textMap", "textMap"],
      ["activity.documentNavigation", "documentNavigation"]
    ] as const;

    for (const [label, mode] of modeLabels) {
      const button = buttons.find(
        (candidate) => candidate.props["aria-label"] === label
      );
      expect(button).toBeDefined();
      expect(button?.props.disabled).toBeUndefined();

      const onClick = button?.props.onClick;
      expect(typeof onClick).toBe("function");
      (onClick as () => void)();
      expect(onSelectMode).toHaveBeenLastCalledWith(mode);
    }
  });

  it("routes Activity Bar Workspace operations through commands", async () => {
    const registry = new CommandRegistry();
    const selectedModes: SidebarMode[] = [];
    let didOpenApplicationSettings = false;

    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: (mode) => {
          selectedModes.push(mode);
        },
        openApplicationSettings: () => {
          didOpenApplicationSettings = true;
        }
      },
      {
        toggleFiles: "Focus File Explorer",
        focusSearch: "Focus Search",
        focusGlossary: "Focus Glossary",
        openApplicationSettings: "Open Application Settings"
      }
    );

    const element = ActivityBar({
      activeMode: "files",
      isApplicationSettingsActive: didOpenApplicationSettings,
      translate,
      onSelectMode: (mode) => {
        void registry.execute(workspaceFocusCommandIdForMode(mode), {
          source: "activityBar"
        });
      },
      onOpenApplicationSettings: () => {
        void registry.execute(workspaceCommandIds.openApplicationSettings, {
          source: "activityBar"
        });
      }
    });
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const searchButton = buttons.find(
      (button) => button.props["aria-label"] === "activity.searchReplace"
    );
    const filesButton = buttons.find(
      (button) => button.props["aria-label"] === "activity.files"
    );
    const glossaryButton = buttons.find(
      (button) => button.props["aria-label"] === "activity.glossary"
    );
    const settingsButton = buttons.find(
      (button) => button.props["aria-label"] === "activity.applicationSettings"
    );

    expect(filesButton).toBeDefined();
    expect(searchButton).toBeDefined();
    expect(glossaryButton).toBeDefined();
    expect(settingsButton).toBeDefined();

    (filesButton?.props.onClick as () => void)();
    (searchButton?.props.onClick as () => void)();
    (glossaryButton?.props.onClick as () => void)();
    await Promise.resolve();

    expect(selectedModes).toEqual(["files", "search", "glossary"]);

    (settingsButton?.props.onClick as () => void)();
    await Promise.resolve();

    expect(didOpenApplicationSettings).toBe(true);
  });

  it("connects Activity Bar mode selection through Workspace focus commands", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain("workspaceFocusCommandIdForMode(mode)");
    expect(source).toContain(
      'executeUiCommand(workspaceFocusCommandIdForMode(mode), {\n      source: "activityBar"\n    });'
    );
    expect(source).toContain("onSelectMode={handleActivityBarModeClick}");
  });

  it("positions Application Settings in the secondary Activity Bar group", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "search",
        isApplicationSettingsActive: true,
        translate,
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined
      })
    );

    const secondaryGroupIndex = markup.indexOf("activityBarSecondary");
    const applicationSettingsIndex = markup.indexOf(
      "activity.applicationSettings"
    );

    expect(secondaryGroupIndex).toBeGreaterThan(-1);
    expect(applicationSettingsIndex).toBeGreaterThan(secondaryGroupIndex);
  });

  it("renders the File Explorer root and toolbar in Files mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorkspaceSidebar, {
        mode: "files",
        project,
        highlightedProjectDocumentRelativePath: "chapter-02.md",
        highlightedGlossaryEntryId: null,
        translate,
        onActivateProjectDocument: () => undefined,
        onActivateGlossaryEntry: () => undefined
      })
    );

    expect(markup).toContain("explorer.projectFiles");
    expect(markup).toContain("Novel");
    expect(markup).toContain("explorer.reload");
    expect(markup).toContain("explorer.newFile");
    expect(markup).toContain("explorer.newFolder");
    expect(markup).toContain("explorer.loading");
    expect(markup).not.toContain("Project Explorer");
  });

  it("localizes the File Explorer pane heading", () => {
    const japaneseMarkup = renderToStaticMarkup(
      React.createElement(FileExplorerView, fileExplorerViewProps({
        translate: (key, values) => t("ja", key, values)
      }))
    );
    const englishMarkup = renderToStaticMarkup(
      React.createElement(FileExplorerView, fileExplorerViewProps({
        translate: (key, values) => t("en", key, values)
      }))
    );

    expect(japaneseMarkup).toContain("ファイルエクスプローラー");
    expect(englishMarkup).toContain("File Explorer");
  });

  it("renders File Explorer toolbar placeholders as disabled controls", () => {
    const element = FileExplorerView(fileExplorerViewProps());
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const reloadButton = buttons.find(
      (button) => button.props["aria-label"] === "explorer.reload"
    );
    const newFileButton = buttons.find(
      (button) => button.props["aria-label"] === "explorer.newFile"
    );
    const newFolderButton = buttons.find(
      (button) => button.props["aria-label"] === "explorer.newFolder"
    );

    expect(reloadButton?.props.disabled).toBe(false);
    expect(typeof reloadButton?.props.onClick).toBe("function");
    expect(newFileButton?.props.disabled).toBe(true);
    expect(newFileButton?.props.onClick).toBeUndefined();
    expect(newFolderButton?.props.disabled).toBe(true);
    expect(newFolderButton?.props.onClick).toBeUndefined();
  });

  it("uses bundled File Explorer icon assets without raw SVG strings", () => {
    const source = readFileSync("src/renderer/FileExplorer.tsx", "utf8");

    expect(source).toContain(
      "assets/icons/file-associations/pergamum/pergamum-scroll-file-icon.svg?url"
    );
    expect(source).toContain(
      "assets/icons/ionicons/explorer/folder-open-outline.svg?url"
    );
    expect(source).toContain(
      "assets/icons/ionicons/explorer/folder-outline.svg?url"
    );
    expect(source).toContain(
      "assets/icons/ionicons/explorer/document-text-outline.svg?url"
    );
    expect(source).toContain(
      "assets/icons/feather/explorer/folder-plus.svg?url"
    );
    expect(source).toContain(
      "assets/icons/feather/explorer/file-plus.svg?url"
    );
    expect(source).toContain(
      "assets/icons/ionicons/explorer/refresh-outline.svg?url"
    );
    expect(source).not.toContain("?raw");
    expect(source).not.toContain("ProjectExplorer");
  });

  it("uses the Pergamum project icon for the File Explorer root node", () => {
    const element = FileExplorerView(fileExplorerViewProps({
      expandedDirectoryPaths: new Set(["Drafts"])
    }));
    const images = collectElements(
      element,
      (child) => child.type === "img"
    );
    const rootIcon = images.find(
      (image) => image.props["data-file-explorer-icon"] === "pergamum-project"
    );
    const openFolderIcon = images.find(
      (image) => image.props["data-file-explorer-icon"] === "folder-open"
    );

    expect(rootIcon).toBeDefined();
    expect(rootIcon?.props.alt).toBe("");
    expect(rootIcon?.props["aria-hidden"]).toBe("true");
    expect(rootIcon?.props.className).toContain("fileExplorerProjectIcon");
    expect(openFolderIcon).toBeDefined();
  });

  it("sizes only the File Explorer project root icon larger than regular icons", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");

    expect(styles).toContain(
      ".fileExplorerIcon {\n  inline-size: 16px;\n  block-size: 16px;"
    );
    expect(styles).toContain(
      ".fileExplorerProjectIcon {\n  inline-size: 20px;\n  block-size: 20px;"
    );
  });

  it("renders File Explorer selection independently from Active Editor highlight", () => {
    const element = FileExplorerView(fileExplorerViewProps({
      selectedRelativePath: "chapter-01.md",
      highlightedRelativePath: "chapter-02.md",
    }));
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const selectedButton = buttons.find(
      (button) => button.props.title === "chapter-01.md"
    );
    const highlightedButton = buttons.find(
      (button) => button.props.title === "chapter-02.md"
    );

    expect(selectedButton?.props.className).toContain("isSelected");
    expect(selectedButton?.props.className).not.toContain("isActive");
    expect(selectedButton?.props["data-selected"]).toBe("true");
    expect(selectedButton?.props["aria-current"]).toBeUndefined();

    expect(highlightedButton?.props.className).toContain("isActive");
    expect(highlightedButton?.props.className).not.toContain("isSelected");
    expect(highlightedButton?.props["aria-current"]).toBe("page");
    expect(highlightedButton?.props["data-selected"]).toBeUndefined();
  });

  it("does not activate an Editor when File Explorer selection changes without user activation", () => {
    const onSelectEntry = vi.fn();
    const onActivateDocument = vi.fn();

    renderToStaticMarkup(
      React.createElement(FileExplorerView, fileExplorerViewProps({
        selectedRelativePath: "chapter-01.md",
        onSelectEntry,
        onActivateDocument
      }))
    );
    renderToStaticMarkup(
      React.createElement(FileExplorerView, fileExplorerViewProps({
        selectedRelativePath: "chapter-02.md",
        onSelectEntry,
        onActivateDocument
      }))
    );

    expect(onSelectEntry).not.toHaveBeenCalled();
    expect(onActivateDocument).not.toHaveBeenCalled();
  });

  it("uses activation callbacks only for user-initiated Project document opening", () => {
    const onSelectEntry = vi.fn();
    const onActivateDocument = vi.fn();
    const element = FileExplorerView(fileExplorerViewProps({
      onSelectEntry,
      onActivateDocument
    }));
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const firstDocumentButton = buttons.find(
      (button) => button.props.title === "chapter-01.md"
    );

    expect(firstDocumentButton).toBeDefined();

    const onClick = firstDocumentButton?.props.onClick;
    expect(typeof onClick).toBe("function");
    (onClick as () => void)();

    expect(onSelectEntry).toHaveBeenCalledWith("chapter-01.md");
    expect(onActivateDocument).toHaveBeenCalledWith("chapter-01.md");
  });

  it("toggles folders without activating an Editor document", () => {
    const onSelectEntry = vi.fn();
    const onToggleDirectory = vi.fn();
    const onActivateDocument = vi.fn();
    const element = FileExplorerView(fileExplorerViewProps({
      onSelectEntry,
      onToggleDirectory,
      onActivateDocument
    }));
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const folderButton = buttons.find(
      (button) => button.props.title === "Drafts"
    );

    expect(folderButton).toBeDefined();
    const onClick = folderButton?.props.onClick;
    expect(typeof onClick).toBe("function");
    (onClick as () => void)();

    expect(onSelectEntry).toHaveBeenCalledWith("Drafts");
    expect(onToggleDirectory).toHaveBeenCalledWith("Drafts");
    expect(onActivateDocument).not.toHaveBeenCalled();
  });

  it("selects non-Markdown files without using the Project document activation path", () => {
    const onSelectEntry = vi.fn();
    const onActivateDocument = vi.fn();
    const element = FileExplorerView(fileExplorerViewProps({
      onSelectEntry,
      onActivateDocument
    }));
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const nonProjectFileButton = buttons.find(
      (button) => button.props.title === "notes.txt"
    );

    expect(nonProjectFileButton).toBeDefined();
    const onClick = nonProjectFileButton?.props.onClick;
    expect(typeof onClick).toBe("function");
    (onClick as () => void)();

    expect(onSelectEntry).toHaveBeenCalledWith("notes.txt");
    expect(onActivateDocument).not.toHaveBeenCalled();
  });

  it("connects Project document activation to the shared openEditor path", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "async function activateProjectDocument(relativePath: string)"
    );
    // Routed through the shared #152 instrumented-open wrapper rather than
    // awaited directly, but it still calls openEditorFromExplicitActivation.
    expect(source).toContain("openEditorFromExplicitActivation(documentId");
    expect(source).toContain("onActivateProjectDocument={(relativePath) => {");
  });

  it("connects Glossary activation through command execution", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain("registerGlossaryCommands(");
    expect(source).toContain("createGlossaryEntryEditorId(");
    expect(source).toContain(
      "return await openEditorFromExplicitActivation(editorId);"
    );
    expect(source).toContain(
      'executeUiCommand(\n                          glossaryCommandIds.openEntry,\n                          { source: "workspaceSidebar" },\n                          entryId\n                        );'
    );
  });

  it("binds File Explorer selection lifetime to Project identity", () => {
    const projectA: PergamumProject = {
      ...project,
      rootPath: "C:\\ProjectA",
      activeProjectFilePath: "C:\\ProjectA\\ProjectA.pergamum",
      name: "ProjectA",
      documents: [
        {
          relativePath: "chapter-01.md",
          name: "chapter-01.md"
        }
      ]
    };
    const projectB: PergamumProject = {
      ...project,
      rootPath: "C:\\ProjectB",
      activeProjectFilePath: "C:\\ProjectB\\ProjectB.pergamum",
      name: "ProjectB",
      documents: [
        {
          relativePath: "chapter-01.md",
          name: "chapter-01.md"
        }
      ]
    };

    const sidebarForProjectA = WorkspaceSidebar({
      mode: "files",
      project: projectA,
      highlightedProjectDocumentRelativePath: null,
      highlightedGlossaryEntryId: null,
      translate,
      onActivateProjectDocument: () => undefined,
      onActivateGlossaryEntry: () => undefined
    });
    const sidebarForProjectB = WorkspaceSidebar({
      mode: "files",
      project: projectB,
      highlightedProjectDocumentRelativePath: null,
      highlightedGlossaryEntryId: null,
      translate,
      onActivateProjectDocument: () => undefined,
      onActivateGlossaryEntry: () => undefined
    });

    expect(React.isValidElement(sidebarForProjectA)).toBe(true);
    expect(React.isValidElement(sidebarForProjectB)).toBe(true);
    expect(sidebarForProjectA.key).toBe(projectA.rootPath);
    expect(sidebarForProjectB.key).toBe(projectB.rootPath);
    expect(sidebarForProjectB.key).not.toBe(sidebarForProjectA.key);
  });

  it("does not activate an Editor when Active Editor highlight changes", () => {
    const onActivateProjectDocument = vi.fn();

    renderToStaticMarkup(
      React.createElement(WorkspaceSidebar, {
        mode: "files",
        project,
        highlightedProjectDocumentRelativePath: "chapter-01.md",
        highlightedGlossaryEntryId: null,
        translate,
        onActivateProjectDocument,
        onActivateGlossaryEntry: () => undefined
      })
    );
    renderToStaticMarkup(
      React.createElement(WorkspaceSidebar, {
        mode: "files",
        project,
        highlightedProjectDocumentRelativePath: "chapter-02.md",
        highlightedGlossaryEntryId: null,
        translate,
        onActivateProjectDocument,
        onActivateGlossaryEntry: () => undefined
      })
    );

    expect(onActivateProjectDocument).not.toHaveBeenCalled();
  });

  it("does not create a feedback loop across repeated highlight renders", () => {
    const onSelectEntry = vi.fn();
    const onActivateDocument = vi.fn();

    for (const highlightedRelativePath of [
      "chapter-01.md",
      "chapter-02.md",
      "chapter-01.md"
    ]) {
      renderToStaticMarkup(
        React.createElement(FileExplorerView, fileExplorerViewProps({
          highlightedRelativePath,
          onSelectEntry,
          onActivateDocument
        }))
      );
    }

    expect(onSelectEntry).not.toHaveBeenCalled();
    expect(onActivateDocument).not.toHaveBeenCalled();
  });

  it("switches Sidebar content to the Search placeholder", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorkspaceSidebar, {
        mode: "search",
        project,
        highlightedProjectDocumentRelativePath: "chapter-02.md",
        highlightedGlossaryEntryId: null,
        translate,
        onActivateProjectDocument: () => undefined,
        onActivateGlossaryEntry: () => undefined
      })
    );

    expect(markup).toContain("search.sidebarTitle");
    expect(markup).toContain("search.notImplemented");
    expect(markup).not.toContain("chapter-01.md");
  });

  it("switches Sidebar content to the Glossary loading state", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorkspaceSidebar, {
        mode: "glossary",
        project,
        highlightedProjectDocumentRelativePath: "chapter-02.md",
        highlightedGlossaryEntryId: null,
        translate,
        onActivateProjectDocument: () => undefined,
        onActivateGlossaryEntry: () => undefined
      })
    );

    expect(markup).toContain("glossary.sidebarTitle");
    expect(markup).toContain("glossary.loading");
    expect(markup).toContain("glossary.addEntry");
    expect(markup).not.toContain("chapter-01.md");
  });

  it("passes read-only project access mode to the Glossary create UI", () => {
    const readOnlyProject: PergamumProject = {
      ...project,
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      }
    };
    const sidebar = WorkspaceSidebar({
      mode: "glossary",
      project: readOnlyProject,
      highlightedProjectDocumentRelativePath: null,
      highlightedGlossaryEntryId: null,
      glossaryRefreshToken: 0,
      translate,
      onActivateProjectDocument: () => undefined,
      onActivateGlossaryEntry: () => undefined,
      onCreateGlossaryEntry: async () => false
    });

    expect(React.isValidElement(sidebar)).toBe(true);
    expect(sidebar.type).toBe(GlossarySidebar);
    expect(sidebar.props.readOnly).toBe(true);
  });

  it("does not call glossary APIs when no project is open", () => {
    const glossaryApi = stubGlossaryApi();

    const markup = renderToStaticMarkup(
      React.createElement(GlossarySidebar, {
        projectRootPath: null,
        highlightedEntryId: null,
        translate,
        onActivateEntry: () => undefined
      })
    );

    expect(markup).toContain("glossary.noProject");
    expect(glossaryApi.list).not.toHaveBeenCalled();
  });

  it("keeps Sidebar mode switching independent from open document tabs", () => {
    const document = createProjectDocument(project.documents[0], "content");
    const openDocumentsState = createOpenDocumentsStateWithDocument(
      document,
      projectContext
    );
    const tabsBeforeSwitch = documentTabs(openDocumentsState);

    const searchMode = selectSidebarMode("search");
    const glossaryMode = selectSidebarMode("glossary");
    const tabsAfterSwitch = documentTabs(openDocumentsState);

    expect(searchMode).toBe("search");
    expect(glossaryMode).toBe("glossary");
    expect(tabsAfterSwitch).toEqual(tabsBeforeSwitch);
    expect(
      editorIdEquals(
        openDocumentsState.activeDocumentId,
        createProjectDocumentEditorId("chapter-01.md", projectContext)
      )
    ).toBe(true);
  });

  it("keeps renderer glossary code isolated from SQLite and main process persistence modules", () => {
    const rendererFiles = [
      "src/renderer/GlossaryEditor.tsx",
      "src/renderer/GlossarySidebar.tsx",
      "src/renderer/WorkspaceSidebar.tsx",
      "src/renderer/glossaryCommands.ts",
      "src/renderer/resolveCurrentEditor.ts",
      "src/renderer/glossarySidebarState.ts"
    ];

    for (const filePath of rendererFiles) {
      const source = readFileSync(filePath, "utf8");

      expect(source).not.toContain("better-sqlite3");
      expect(source).not.toContain("projectDatabase");
      expect(source).not.toContain("glossaryStore");
      expect(source).not.toContain("../main/");
    }
  });
});
