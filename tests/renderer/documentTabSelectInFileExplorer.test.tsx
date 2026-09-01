// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentTabBar } from "../../src/renderer/DocumentTabBar";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import { t, type Translate } from "../../src/shared/i18n";
import {
  createGlossaryEntryEditorId,
  createFileEditorIdForPath,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";

const translate: Translate = (key, values) => t("ja", key, values);
const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

function projectTab(relativePath: string): DocumentTab {
  return {
    id: createProjectDocumentEditorId(relativePath, projectContext),
    title: relativePath,
    isDirty: false,
    isExternalMarkdownFile: false
  };
}
const externalTab: DocumentTab = {
  id: createFileEditorIdForPath("C:/Outside/notes.md"),
  title: "notes.md",
  isDirty: false,
  isExternalMarkdownFile: true
};
const untitledTab: DocumentTab = {
  id: createUntitledEditorId(1),
  title: "Untitled-1",
  isDirty: false,
  isExternalMarkdownFile: false
};
const glossaryTab: DocumentTab = {
  id: createGlossaryEntryEditorId(
    "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
    projectContext
  ),
  title: "term",
  isDirty: false,
  isExternalMarkdownFile: false
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(
  tabs: DocumentTab[],
  onSelectInFileExplorer: (tab: DocumentTab) => void
): void {
  act(() => {
    root.render(
      React.createElement(DocumentTabBar, {
        tabs,
        activeDocumentId: tabs[0]?.id ?? null,
        translate,
        onSelectDocument: vi.fn(),
        onCloseDocument: vi.fn(),
        onSelectInFileExplorer,
        isUtilityWindowOpen: false,
        onToggleUtilityWindow: vi.fn()
      })
    );
  });
}

function tabEl(index: number): HTMLElement {
  return [...container.querySelectorAll<HTMLElement>('[role="tab"]')][index];
}
function rightClick(el: Element): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  });
}
function menuItem(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[data-document-tab-context-command="select-in-file-explorer"]'
  );
}

describe("DocumentTabBar — Select in File Explorer (#355 v1)", () => {
  it("enables the item for a project document tab", () => {
    render([projectTab("Drafts/ch1.md")], vi.fn());
    rightClick(tabEl(0));
    expect(menuItem()).not.toBeNull();
    expect(menuItem()!.textContent).toBe(
      t("ja", "tabs.contextMenu.selectInFileExplorer")
    );
    expect(menuItem()!.disabled).toBe(false);
  });

  it("disables the item for external / untitled / glossary tabs", () => {
    for (const tab of [externalTab, untitledTab, glossaryTab]) {
      render([tab], vi.fn());
      rightClick(tabEl(0));
      expect(menuItem()!.disabled).toBe(true);
      act(() => root.render(React.createElement("div")));
    }
  });

  it("calls onSelectInFileExplorer with the right-clicked tab", () => {
    const onSelect = vi.fn();
    render([projectTab("a.md"), projectTab("Drafts/b.md")], onSelect);
    rightClick(tabEl(1));
    act(() => menuItem()!.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].title).toBe("Drafts/b.md");
    // menu closes after the action
    expect(menuItem()).toBeNull();
  });

  it("does not call the handler when the disabled item is clicked", () => {
    const onSelect = vi.fn();
    render([externalTab], onSelect);
    rightClick(tabEl(0));
    act(() => menuItem()!.click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders no menu when onSelectInFileExplorer is not provided", () => {
    act(() => {
      root.render(
        React.createElement(DocumentTabBar, {
          tabs: [projectTab("a.md")],
          activeDocumentId: null,
          translate,
          onSelectDocument: vi.fn(),
          onCloseDocument: vi.fn(),
          isUtilityWindowOpen: false,
          onToggleUtilityWindow: vi.fn()
        })
      );
    });
    rightClick(tabEl(0));
    expect(menuItem()).toBeNull();
  });
});
