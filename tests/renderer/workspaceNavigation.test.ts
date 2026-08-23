import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import type { PergamumProject } from "../../src/shared/api";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import type { Translate } from "../../src/shared/i18n";
import { ActivityBar } from "../../src/renderer/ActivityBar";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { FileExplorerView } from "../../src/renderer/FileExplorer";
import {
  GlossarySidebar,
  GlossarySidebarView,
  initialGlossaryCreateFormState
} from "../../src/renderer/GlossarySidebar";
import {
  canonicalGlossarySurface,
  createErrorGlossarySidebarState,
  createLoadedGlossarySidebarState,
  createLoadingGlossarySidebarState,
  createNoProjectGlossarySidebarState,
  loadGlossaryEntries,
  shouldApplyGlossaryLoadResult
} from "../../src/renderer/glossarySidebarState";
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
  activeProjectFilePath: "C:\\Novel\\pergamum.db",
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

const timestamp = "2026-01-01T00:00:00.000Z";

function glossaryEntry(
  id: string,
  canonicalSurface: string,
  alternateSurface: string
): GlossaryEntry {
  return {
    id,
    kind: "term",
    description: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    forms: [
      {
        id: `${id}-alternate-form`,
        entryId: id,
        surface: alternateSurface,
        relation: "alias",
        warningPolicy: "default",
        isCanonical: false,
        createdAt: timestamp,
        updatedAt: timestamp
      },
      {
        id: `${id}-canonical-form`,
        entryId: id,
        surface: canonicalSurface,
        relation: null,
        warningPolicy: null,
        isCanonical: true,
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
  lookupSurface: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  const glossaryApi = {
    create: vi.fn(),
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue(entries),
    lookupSurface: vi.fn(),
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

const noopGlossaryCreateFormProps = {
  canCreateEntry: true,
  searchQuery: "",
  createForm: initialGlossaryCreateFormState,
  onChangeSearchQuery: () => undefined,
  onToggleCreateForm: () => undefined,
  onChangeCreateSurface: () => undefined,
  onChangeCreateKind: () => undefined,
  onSubmitCreateForm: () => undefined
};

describe("workspace navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Activity Bar with Files, Search, and Glossary modes", () => {
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
    expect(markup).toContain("activity.applicationSettings");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).not.toContain("disabled");
  });

  it("treats Files, Search, and Glossary as Sidebar mode selectors", () => {
    const onSelectMode = vi.fn<(mode: SidebarMode) => void>();
    const buttons = activityBarButtons("files", onSelectMode);

    const modeLabels = [
      ["activity.files", "files"],
      ["activity.searchReplace", "search"],
      ["activity.glossary", "glossary"]
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
        focusFiles: "Focus Files",
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

  it("renders the existing File Explorer in Files mode", () => {
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
    expect(markup).toContain("chapter-01.md");
    expect(markup).toContain("chapter-02.md");
    expect(markup).toContain("aria-current=\"page\"");
  });

  it("renders Navigator selection independently from Active Editor highlight", () => {
    const element = FileExplorerView({
      documents: project.documents,
      selectedRelativePath: "chapter-01.md",
      highlightedRelativePath: "chapter-02.md",
      translate,
      onSelectDocument: () => undefined,
      onActivateDocument: () => undefined
    });
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

  it("does not activate an Editor when Navigator selection changes without user activation", () => {
    const onSelectDocument = vi.fn();
    const onActivateDocument = vi.fn();

    renderToStaticMarkup(
      React.createElement(FileExplorerView, {
        documents: project.documents,
        selectedRelativePath: "chapter-01.md",
        highlightedRelativePath: null,
        translate,
        onSelectDocument,
        onActivateDocument
      })
    );
    renderToStaticMarkup(
      React.createElement(FileExplorerView, {
        documents: project.documents,
        selectedRelativePath: "chapter-02.md",
        highlightedRelativePath: null,
        translate,
        onSelectDocument,
        onActivateDocument
      })
    );

    expect(onSelectDocument).not.toHaveBeenCalled();
    expect(onActivateDocument).not.toHaveBeenCalled();
  });

  it("uses activation callbacks only for user-initiated Project document opening", () => {
    const onSelectDocument = vi.fn();
    const onActivateDocument = vi.fn();
    const element = FileExplorerView({
      documents: project.documents,
      selectedRelativePath: null,
      highlightedRelativePath: null,
      translate,
      onSelectDocument,
      onActivateDocument
    });
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

    expect(onSelectDocument).toHaveBeenCalledWith("chapter-01.md");
    expect(onActivateDocument).toHaveBeenCalledWith("chapter-01.md");
  });

  it("connects Project document activation to the shared openEditor path", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");

    expect(source).toContain(
      "async function activateProjectDocument(relativePath: string)"
    );
    // Routed through the shared #152 instrumented-open wrapper rather than
    // awaited directly, but it still calls openEditorFromExplicitActivation.
    expect(source).toContain(
      "() => openEditorFromExplicitActivation(documentId)"
    );
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

  it("binds Project document Navigator selection lifetime to Project identity", () => {
    const projectA: PergamumProject = {
      ...project,
      rootPath: "C:\\ProjectA",
      activeProjectFilePath: "C:\\ProjectA\\pergamum.db",
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
      activeProjectFilePath: "C:\\ProjectB\\pergamum.db",
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
    const onSelectDocument = vi.fn();
    const onActivateDocument = vi.fn();

    for (const highlightedRelativePath of [
      "chapter-01.md",
      "chapter-02.md",
      "chapter-01.md"
    ]) {
      renderToStaticMarkup(
        React.createElement(FileExplorerView, {
          documents: project.documents,
          selectedRelativePath: null,
          highlightedRelativePath,
          translate,
          onSelectDocument,
          onActivateDocument
        })
      );
    }

    expect(onSelectDocument).not.toHaveBeenCalled();
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
    expect(markup).toContain("glossary.add");
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

  it("loads glossary entries through the renderer-facing API", async () => {
    const glossaryApi = stubGlossaryApi();

    await expect(loadGlossaryEntries()).resolves.toBe(glossaryEntries);

    expect(glossaryApi.list).toHaveBeenCalledTimes(1);
    expect(glossaryApi.create).not.toHaveBeenCalled();
    expect(glossaryApi.update).not.toHaveBeenCalled();
    expect(glossaryApi.delete).not.toHaveBeenCalled();
  });

  it("identifies the canonical surface by isCanonical", () => {
    expect(canonicalGlossarySurface(glossaryEntries[0])).toBe("王都");

    const markup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadedGlossarySidebarState(glossaryEntries, null),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );

    expect(markup).toContain("王都");
    expect(markup).not.toContain("首都");
  });

  it("renders glossary entries in API result order", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadedGlossarySidebarState(glossaryEntries, null),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );

    expect(markup.indexOf("王都")).toBeLessThan(markup.indexOf("魔導炉"));
  });

  it("tracks glossary selection by persistent entry ID", () => {
    const onSelectEntry = vi.fn();
    const onActivateEntry = vi.fn();
    const element = GlossarySidebarView({
      state: createLoadedGlossarySidebarState(glossaryEntries, null),
      highlightedEntryId: null,
      translate,
      onSelectEntry,
      onActivateEntry,
      ...noopGlossaryCreateFormProps
    });
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const secondEntryButton = buttons.find(
      (button) => button.props.title === "魔導炉"
    );

    expect(secondEntryButton).toBeDefined();

    const onClick = secondEntryButton?.props.onClick;
    expect(typeof onClick).toBe("function");
    (onClick as () => void)();

    expect(onSelectEntry).toHaveBeenCalledWith("entry-beta");
    expect(onActivateEntry).toHaveBeenCalledWith("entry-beta");
  });

  it("renders Glossary selection independently from Active Editor highlight", () => {
    const element = GlossarySidebarView({
      state: createLoadedGlossarySidebarState(glossaryEntries, "entry-alpha"),
      highlightedEntryId: "entry-beta",
      translate,
      onSelectEntry: () => undefined,
      onActivateEntry: () => undefined,
      ...noopGlossaryCreateFormProps
    });
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const selectedButton = buttons.find(
      (button) => button.props.title === "王都"
    );
    const highlightedButton = buttons.find(
      (button) => button.props.title === "魔導炉"
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

  it("does not activate a Glossary Editor when highlight changes", () => {
    const onSelectEntry = vi.fn();
    const onActivateEntry = vi.fn();

    renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadedGlossarySidebarState(glossaryEntries, null),
        highlightedEntryId: "entry-alpha",
        translate,
        onSelectEntry,
        onActivateEntry,
        ...noopGlossaryCreateFormProps
      })
    );
    renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadedGlossarySidebarState(glossaryEntries, null),
        highlightedEntryId: "entry-beta",
        translate,
        onSelectEntry,
        onActivateEntry,
        ...noopGlossaryCreateFormProps
      })
    );

    expect(onSelectEntry).not.toHaveBeenCalled();
    expect(onActivateEntry).not.toHaveBeenCalled();
  });

  it("preserves selection across reload when the entry still exists", () => {
    const state = createLoadedGlossarySidebarState(
      glossaryEntries,
      "entry-beta"
    );

    expect(state.selectedEntryId).toBe("entry-beta");
  });

  it("clears stale glossary selection when loaded entries change", () => {
    const state = createLoadedGlossarySidebarState(
      [glossaryEntries[0]],
      "entry-beta"
    );

    expect(state.selectedEntryId).toBeNull();
  });

  it("clears stale glossary selection when project identity changes", () => {
    const loadingState = createLoadingGlossarySidebarState(null);

    expect(loadingState.selectedEntryId).toBeNull();
  });

  it("does not apply stale async load results from previous requests", () => {
    expect(shouldApplyGlossaryLoadResult(2, 1)).toBe(false);
    expect(shouldApplyGlossaryLoadResult(2, 2)).toBe(true);
  });

  it("renders glossary loading, empty, and error states", () => {
    const loadingMarkup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadingGlossarySidebarState(null),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );
    const emptyMarkup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createLoadedGlossarySidebarState([], null),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );
    const errorMarkup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createErrorGlossarySidebarState(null),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );
    const noProjectMarkup = renderToStaticMarkup(
      React.createElement(GlossarySidebarView, {
        state: createNoProjectGlossarySidebarState(),
        highlightedEntryId: null,
        translate,
        onSelectEntry: () => undefined,
        onActivateEntry: () => undefined,
        ...noopGlossaryCreateFormProps
      })
    );

    expect(loadingMarkup).toContain("glossary.loading");
    expect(emptyMarkup).toContain("glossary.empty");
    expect(errorMarkup).toContain("glossary.loadError");
    expect(noProjectMarkup).toContain("glossary.noProject");
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

  it("keeps glossary selection independent from open document tabs", () => {
    const document = createProjectDocument(project.documents[0], "content");
    const openDocumentsState = createOpenDocumentsStateWithDocument(
      document,
      projectContext
    );
    const tabsBeforeSelection = documentTabs(openDocumentsState);
    const onSelectEntry = vi.fn();
    const onActivateEntry = vi.fn();
    const element = GlossarySidebarView({
      state: createLoadedGlossarySidebarState(glossaryEntries, null),
      highlightedEntryId: null,
      translate,
      onSelectEntry,
      onActivateEntry,
      ...noopGlossaryCreateFormProps
    });
    const buttons = collectElements(
      element,
      (child) => child.type === "button"
    );
    const entryButton = buttons.find(
      (button) => button.props.title === "王都"
    );

    const onClick = entryButton?.props.onClick;
    expect(typeof onClick).toBe("function");
    (onClick as () => void)();

    expect(onSelectEntry).toHaveBeenCalledWith("entry-alpha");
    expect(onActivateEntry).toHaveBeenCalledWith("entry-alpha");
    expect(documentTabs(openDocumentsState)).toEqual(tabsBeforeSelection);
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
