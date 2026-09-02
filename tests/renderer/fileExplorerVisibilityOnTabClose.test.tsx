// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  closeOpenEditor,
  createInitialOpenDocumentsState,
  openOrActivateDocument,
  type OpenDocumentsState
} from "../../src/renderer/openDocuments";
import {
  shouldShowFullScreenWelcomeSurface,
  shouldShowWelcomeSurface
} from "../../src/renderer/welcomeSurface";
import { WorkspaceSidebar } from "../../src/renderer/WorkspaceSidebar";
import type { Translate } from "../../src/shared/i18n";
import type {
  ListFileExplorerChildrenResult,
  PergamumProject,
  ProjectDocument
} from "../../src/shared/api";
import type { ActiveProjectContext } from "../../src/shared/editorId";

const translate: Translate = (key) => key;

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

const projectDocument: ProjectDocument = {
  relativePath: "chapter-01.md",
  name: "chapter-01.md"
};

const project: PergamumProject = {
  rootPath: "C:\\Novel",
  activeProjectFilePath: "C:\\Novel\\Novel.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [projectDocument]
};

function zeroTabs(): OpenDocumentsState {
  return createInitialOpenDocumentsState();
}

function oneProjectTab(): OpenDocumentsState {
  return openOrActivateDocument(
    zeroTabs(),
    createProjectDocument(projectDocument, "body"),
    projectContext
  );
}

function closeLastTab(state: OpenDocumentsState): OpenDocumentsState {
  return closeOpenEditor(
    state,
    state.activeDocumentId as NonNullable<typeof state.activeDocumentId>
  );
}

describe("blocker: closing an editor tab must not break File Explorer visibility", () => {
  describe("shouldShowFullScreenWelcomeSurface", () => {
    it("never shows the whole-workbench Welcome (which hides the sidebar) while a project is open", () => {
      expect(
        shouldShowFullScreenWelcomeSurface({
          openDocumentsState: zeroTabs(),
          isSettingsTabOpen: false,
          projectIsOpen: true
        })
      ).toBe(false);
    });

    it("still shows the whole-workbench Welcome for the no-project zero-tab state", () => {
      expect(
        shouldShowFullScreenWelcomeSurface({
          openDocumentsState: zeroTabs(),
          isSettingsTabOpen: false,
          projectIsOpen: false
        })
      ).toBe(true);
    });

    it("closing the last document tab keeps the workbench (sidebar) mounted when a project is open", () => {
      const afterClose = closeLastTab(oneProjectTab());

      expect(afterClose.documents).toEqual([]);
      expect(afterClose.activeDocumentId).toBeNull();
      // The zero-tab Welcome is still the active surface...
      expect(
        shouldShowWelcomeSurface({
          openDocumentsState: afterClose,
          isSettingsTabOpen: false
        })
      ).toBe(true);
      // ...but only scoped to the editor area — never the full-screen swap,
      // so File Explorer / the sidebar stay mounted and side-nav controlled.
      expect(
        shouldShowFullScreenWelcomeSurface({
          openDocumentsState: afterClose,
          isSettingsTabOpen: false,
          projectIsOpen: true
        })
      ).toBe(false);
    });

    it("is unaffected by the Application Settings tab", () => {
      expect(
        shouldShowFullScreenWelcomeSurface({
          openDocumentsState: zeroTabs(),
          isSettingsTabOpen: true,
          projectIsOpen: false
        })
      ).toBe(false);
    });
  });

  describe("App wiring", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    it("gates the whole-workbench Welcome swap on the project-aware predicate, not the raw zero-tab one", () => {
      expect(appSource).toContain("{shouldShowFullScreenWelcome ? (");
      // The raw zero-tab predicate must never gate the whole mainArea (which
      // holds the sidebar) — that was the blocker.
      expect(appSource).not.toContain("{shouldShowWelcome ? (");
    });

    it("renders the File Explorer sidebar controlled only by the sidebar-collapsed state", () => {
      const mainAreaIndex = appSource.indexOf(
        '<section className="mainArea"'
      );
      const editorAreaIndex = appSource.indexOf(
        '<section className="editorArea"',
        mainAreaIndex
      );
      const sidebarBlock = appSource.slice(mainAreaIndex, editorAreaIndex);

      expect(mainAreaIndex).toBeGreaterThan(-1);
      expect(sidebarBlock).toContain("{!layout.sidebar.collapsed ? (");
      expect(sidebarBlock).toContain("<WorkspaceSidebar");
      // Sidebar visibility must not depend on tabs / active editor / Welcome.
      // (Passing an active-document-derived VALUE as a prop is fine — e.g.
      // #352's `activeOutlineDocumentKey={activeDocumentKey}`; a rendering
      // CONDITION on it is not.)
      expect(sidebarBlock).not.toContain("shouldShowWelcome");
      expect(sidebarBlock).not.toContain("shouldShowFullScreenWelcome");
      expect(sidebarBlock).not.toContain("activeDocument ?");
      expect(sidebarBlock).not.toContain("activeDocument &&");
    });

    it("passes a null active-document highlight (clears the highlight) instead of hiding File Explorer", () => {
      const sidebarStart = appSource.indexOf("<WorkspaceSidebar");
      const sidebarEnd = appSource.indexOf(
        "onCreateGlossaryEntry={",
        sidebarStart
      );
      const sidebarProps = appSource.slice(sidebarStart, sidebarEnd);

      expect(sidebarProps).toContain(
        "highlightedProjectDocumentRelativePath={"
      );
      expect(sidebarProps).toContain(": null");
    });

    it("keeps the editor-area zero-tab Welcome display-only — it never resets sidebar mode", () => {
      const welcomeBranchIndex = appSource.indexOf(
        ") : shouldShowWelcome ? ("
      );
      expect(welcomeBranchIndex).toBeGreaterThan(-1);

      const welcomeBranch = appSource.slice(
        welcomeBranchIndex,
        welcomeBranchIndex + 400
      );
      expect(welcomeBranch).toContain("welcomeScreen");
      expect(welcomeBranch).not.toContain("setSidebarMode");
    });
  });

  describe("WorkspaceSidebar render", () => {
    let container: HTMLDivElement | null = null;
    let root: Root | null = null;

    afterEach(() => {
      if (root) {
        act(() => root!.unmount());
        root = null;
      }
      container?.remove();
      container = null;
      delete (window as unknown as { pergamum?: unknown }).pergamum;
    });

    function mount(highlightedProjectDocumentRelativePath: string | null): void {
      const listFileExplorerChildren = vi.fn(
        async (): Promise<ListFileExplorerChildrenResult> => ({
          kind: "ok",
          directoryRelativePath: null,
          entries: [
            { kind: "file", name: "chapter-01.md", relativePath: "chapter-01.md" }
          ]
        })
      );
      Object.defineProperty(window, "pergamum", {
        configurable: true,
        value: { projects: { listFileExplorerChildren } }
      });

      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      act(() => {
        root!.render(
          React.createElement(WorkspaceSidebar, {
            mode: "files",
            project,
            highlightedProjectDocumentRelativePath,
            highlightedGlossaryEntryId: null,
            glossaryRefreshToken: 0,
            fileExplorerCreateEntryRequest: null,
            translate,
            onActivateProjectDocument: vi.fn(),
            onFileExplorerCreateEntryRequestHandled: vi.fn(),
            onActivateGlossaryEntry: vi.fn(),
            onCreateGlossaryEntry: vi.fn(async () => true),
            glossaryActiveDocumentContent: null,
            onNavigateGlossaryOccurrence: vi.fn(),
            onCreateGlossaryTag: vi.fn(async () => ({})),
            onUpdateGlossaryTag: vi.fn(async () => ({})),
            onDeleteGlossaryTag: vi.fn(async () => undefined)
          })
        );
      });
    }

    it("renders File Explorer for an open project when there is no active project document highlight", () => {
      mount(null);

      expect(
        container!.querySelector('[data-file-explorer-entry-kind="root"]')
      ).not.toBeNull();
      expect(container!.textContent).toContain("Novel");
      expect(
        container!.querySelector('button[aria-label="explorer.newFile"]')
      ).not.toBeNull();
      // No entry is marked as the active project document.
      expect(
        container!.querySelector('.fileExplorerItem.isActive')
      ).toBeNull();
    });

    it("still renders File Explorer when the highlight is cleared after being set", () => {
      mount("chapter-01.md");
      expect(
        container!.querySelector('[data-file-explorer-entry-kind="root"]')
      ).not.toBeNull();

      act(() => {
        root!.render(
          React.createElement(WorkspaceSidebar, {
            mode: "files",
            project,
            highlightedProjectDocumentRelativePath: null,
            highlightedGlossaryEntryId: null,
            glossaryRefreshToken: 0,
            fileExplorerCreateEntryRequest: null,
            translate,
            onActivateProjectDocument: vi.fn(),
            onFileExplorerCreateEntryRequestHandled: vi.fn(),
            onActivateGlossaryEntry: vi.fn(),
            onCreateGlossaryEntry: vi.fn(async () => true),
            glossaryActiveDocumentContent: null,
            onNavigateGlossaryOccurrence: vi.fn(),
            onCreateGlossaryTag: vi.fn(async () => ({})),
            onUpdateGlossaryTag: vi.fn(async () => ({})),
            onDeleteGlossaryTag: vi.fn(async () => undefined)
          })
        );
      });

      expect(
        container!.querySelector('[data-file-explorer-entry-kind="root"]')
      ).not.toBeNull();
      expect(container!.textContent).toContain("Novel");
    });
  });
});
