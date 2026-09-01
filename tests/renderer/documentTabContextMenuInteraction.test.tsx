// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DocumentTabBar,
  TAB_REORDER_DND_MIME
} from "../../src/renderer/DocumentTabBar";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import {
  describeTabContextMenu,
  type TabContextMenuAction
} from "../../src/renderer/documentTabContextMenu";
import { t, type Translate } from "../../src/shared/i18n";
import {
  createFileEditorIdForPath,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  serializeEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../../src/shared/editorId";
import {
  specialWorkspaceTabId,
  type SpecialWorkspaceTab
} from "../../src/renderer/workspaceTabs";

const translate: Translate = (key, values) => t("ja", key, values);
const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

function projectTab(relativePath: string, isDirty = false): DocumentTab {
  return {
    id: createProjectDocumentEditorId(relativePath, projectContext),
    title: relativePath,
    isDirty,
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
const settingsSpecialTab: SpecialWorkspaceTab = {
  kind: "special",
  id: "settings",
  title: "設定"
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

interface RenderOverrides {
  tabs?: DocumentTab[];
  specialTabs?: SpecialWorkspaceTab[];
  activeDocumentId?: EditorId | null;
  onTabAction?: (action: TabContextMenuAction, tab: DocumentTab) => void;
  onReorderDocuments?: (movedEditorId: EditorId, targetIndex: number) => void;
  onSelectDocument?: (id: EditorId) => void;
  onCloseDocument?: (id: EditorId) => void;
  withMenu?: boolean;
  withReorder?: boolean;
}

function render(overrides: RenderOverrides = {}) {
  const tabs = overrides.tabs ?? [
    projectTab("a.md"),
    projectTab("Drafts/b.md"),
    projectTab("c.md")
  ];
  const onTabAction = overrides.onTabAction ?? vi.fn();
  const onReorderDocuments = overrides.onReorderDocuments ?? vi.fn();
  const onSelectDocument = overrides.onSelectDocument ?? vi.fn();
  const onCloseDocument = overrides.onCloseDocument ?? vi.fn();

  act(() => {
    root.render(
      React.createElement(DocumentTabBar, {
        tabs,
        activeDocumentId:
          overrides.activeDocumentId === undefined
            ? (tabs[0]?.id ?? null)
            : overrides.activeDocumentId,
        specialTabs: overrides.specialTabs ?? [],
        translate,
        onSelectDocument,
        onCloseDocument,
        onTabAction: (overrides.withMenu ?? true) ? onTabAction : undefined,
        describeTabContextMenu: (overrides.withMenu ?? true)
          ? (tab: DocumentTab) =>
              describeTabContextMenu(tab, {
                allTabs: tabs,
                projectAccess: { kind: "readWrite" }
              })
          : undefined,
        onReorderDocuments: (overrides.withReorder ?? true)
          ? onReorderDocuments
          : undefined,
        isUtilityWindowOpen: false,
        onToggleUtilityWindow: vi.fn()
      })
    );
  });

  return { tabs, onTabAction, onReorderDocuments, onSelectDocument, onCloseDocument };
}

function documentTabEls(): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>('[data-document-tab="true"]')
  ];
}
function allTabEls(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
}
function rightClick(el: Element, clientX = 0): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX })
    );
  });
}
function menu(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="menu"]');
}
function menuItem(command: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    `[data-document-tab-context-command="${command}"]`
  );
}
function menuCommands(): string[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "[data-document-tab-context-command]"
    )
  ].map((el) => el.dataset.documentTabContextCommand ?? "");
}
function backdrop(): HTMLElement {
  return container.querySelector<HTMLElement>(
    ".documentTabContextMenuBackdrop"
  )!;
}

function makeDataTransfer(): DataTransfer {
  return new window.DataTransfer();
}
function fireDrag(
  type: string,
  target: Element,
  dataTransfer: DataTransfer,
  clientX = 0
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientX", { value: clientX });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("DocumentTabBar context menu (#354)", () => {
  it("shows the full menu with every command in issue order on a document tab", () => {
    render();
    rightClick(documentTabEls()[1]);
    expect(menu()).not.toBeNull();
    expect(menuCommands()).toEqual([
      "close",
      "close-others",
      "close-left",
      "close-right",
      "select-in-file-explorer",
      "rename-file",
      "save-as",
      "copy-absolute-path",
      "copy-relative-path",
      "copy-file-name"
    ]);
    // separators before select / rename / copy groups
    expect(
      container.querySelectorAll(".documentTabContextMenuSeparator")
    ).toHaveLength(3);
  });

  it("does not show a menu for a special tab", () => {
    render({ specialTabs: [settingsSpecialTab] });
    const special = allTabEls().find((el) => el.textContent?.includes("設定"))!;
    rightClick(special);
    expect(menu()).toBeNull();
  });

  it("does not render a menu when tab-action props are omitted", () => {
    render({ withMenu: false });
    rightClick(documentTabEls()[0]);
    expect(menu()).toBeNull();
  });

  it("each enabled item calls onTabAction with the RIGHT-CLICKED tab", () => {
    const onTabAction = vi.fn();
    const { tabs } = render({ onTabAction });
    rightClick(documentTabEls()[1]); // Drafts/b.md
    act(() => menuItem("copy-absolute-path")!.click());
    expect(onTabAction).toHaveBeenCalledWith("copyAbsolutePath", tabs[1]);
    // menu closed after the action
    expect(menu()).toBeNull();
  });

  it("Select in File Explorer keeps its #355 data attribute and dispatches", () => {
    const onTabAction = vi.fn();
    const { tabs } = render({ onTabAction });
    rightClick(documentTabEls()[0]);
    const item = menuItem("select-in-file-explorer");
    expect(item).not.toBeNull();
    expect(item!.disabled).toBe(false);
    act(() => item!.click());
    expect(onTabAction).toHaveBeenCalledWith("selectInFileExplorer", tabs[0]);
  });

  it("Select in File Explorer on a NON-active tab targets the right-clicked tab, not the active one (BLOCKER 2)", () => {
    const onTabAction = vi.fn();
    const tabs = [
      projectTab("a.md"),
      projectTab("Drafts/b.md"),
      projectTab("c.md")
    ];
    render({ tabs, onTabAction, activeDocumentId: tabs[0].id }); // active = a.md
    rightClick(documentTabEls()[1]); // right-click b.md (not active)
    act(() => menuItem("select-in-file-explorer")!.click());
    expect(onTabAction).toHaveBeenCalledTimes(1);
    expect(onTabAction).toHaveBeenCalledWith("selectInFileExplorer", tabs[1]);
  });

  it("close / save-as / copy items never dispatch selectInFileExplorer (BLOCKER 1)", () => {
    const onTabAction = vi.fn();
    const { tabs } = render({ onTabAction });
    for (const command of [
      "close",
      "close-others",
      "save-as",
      "copy-absolute-path",
      "copy-relative-path",
      "copy-file-name"
    ]) {
      rightClick(documentTabEls()[1]);
      act(() => menuItem(command)!.click());
    }
    const actions = onTabAction.mock.calls.map((call) => call[0]);
    expect(actions).not.toContain("selectInFileExplorer");
    expect(onTabAction).toHaveBeenCalledWith("close", tabs[1]);
    expect(onTabAction).toHaveBeenCalledWith("saveAs", tabs[1]);
  });

  it("a disabled item does not call onTabAction", () => {
    const onTabAction = vi.fn();
    render({ tabs: [externalTab], onTabAction });
    rightClick(documentTabEls()[0]);
    const rename = menuItem("rename-file")!;
    expect(rename.disabled).toBe(true);
    act(() => rename.click());
    expect(onTabAction).not.toHaveBeenCalled();
  });

  it("Escape closes the menu", () => {
    render();
    rightClick(documentTabEls()[0]);
    expect(menu()).not.toBeNull();
    act(() => {
      menu()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(menu()).toBeNull();
  });

  it("backdrop click closes the menu", () => {
    render();
    rightClick(documentTabEls()[0]);
    act(() => backdrop().dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(menu()).toBeNull();
  });

  it("focus returns to the opener tab after the menu closes", () => {
    render();
    const opener = documentTabEls()[2];
    rightClick(opener);
    act(() => menuItem("close")!.click());
    expect(document.activeElement).toBe(opener);
  });
});

describe("DocumentTabBar horizontal reorder (#354)", () => {
  function stubRects(): void {
    // Each document tab is 100px wide at x = index * 100 — derived from its
    // own `data-tab-index` so repeated getBoundingClientRect sweeps are stable.
    vi.spyOn(
      window.HTMLElement.prototype,
      "getBoundingClientRect"
    ).mockImplementation(function (this: HTMLElement) {
      const rect = {
        left: 0,
        right: 0,
        x: 0,
        y: 0,
        top: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({})
      };
      if (this.dataset.documentTab === "true") {
        const index = Number(this.dataset.tabIndex ?? "0");
        rect.left = index * 100;
        rect.x = index * 100;
        rect.right = index * 100 + 100;
        rect.bottom = 30;
        rect.width = 100;
        rect.height = 30;
      }
      return rect as DOMRect;
    });
  }

  it("dragstart on a tab body, drop past a later tab emits onReorderDocuments", () => {
    const onReorderDocuments = vi.fn();
    const { tabs } = render({ onReorderDocuments });
    stubRects();
    const dt = makeDataTransfer();

    fireDrag("dragstart", documentTabEls()[0], dt);
    // drag over C's right half (x ~ 260 with 100px tabs) then drop
    fireDrag("dragover", documentTabEls()[2], dt, 260);
    fireDrag("drop", documentTabEls()[2], dt, 260);

    expect(onReorderDocuments).toHaveBeenCalledTimes(1);
    expect(onReorderDocuments).toHaveBeenCalledWith(tabs[0].id, 2);
  });

  it("carries the dedicated tab reorder MIME, not the File Explorer one", () => {
    render();
    stubRects();
    const dt = makeDataTransfer();
    fireDrag("dragstart", documentTabEls()[0], dt);
    expect(Array.from(dt.types)).toContain(TAB_REORDER_DND_MIME);
    expect(dt.getData(TAB_REORDER_DND_MIME)).toBe(
      serializeEditorId(projectTab("a.md").id)
    );
  });

  it("ignores a drag whose DataTransfer lacks the tab reorder MIME (File Explorer drag)", () => {
    const onReorderDocuments = vi.fn();
    render({ onReorderDocuments });
    stubRects();
    const foreignDt = makeDataTransfer();
    foreignDt.setData("application/x-pergamum-file-explorer-move", "x");

    // no dragstart on a tab -> tabDrag stays null; dragover/drop are ignored
    const over = fireDrag("dragover", documentTabEls()[1], foreignDt, 150);
    fireDrag("drop", documentTabEls()[1], foreignDt, 150);

    expect(over.defaultPrevented).toBe(false);
    expect(onReorderDocuments).not.toHaveBeenCalled();
  });

  it("a drop outside any tab (dragend only) does not reorder", () => {
    const onReorderDocuments = vi.fn();
    render({ onReorderDocuments });
    stubRects();
    const dt = makeDataTransfer();
    fireDrag("dragstart", documentTabEls()[0], dt);
    fireDrag("dragend", documentTabEls()[0], dt);
    expect(onReorderDocuments).not.toHaveBeenCalled();
  });

  it("the close button is not a drag handle", () => {
    const onReorderDocuments = vi.fn();
    render({
      onReorderDocuments,
      activeDocumentId: projectTab("a.md").id // makes tab 0 show its close button
    });
    stubRects();
    const closeButton = documentTabEls()[0].querySelector(
      ".documentTabCloseButton"
    )!;
    const dt = makeDataTransfer();
    const started = fireDrag("dragstart", closeButton, dt);
    expect(started.defaultPrevented).toBe(true);
    expect(Array.from(dt.types)).not.toContain(TAB_REORDER_DND_MIME);
  });

  it("normal click still activates, middle-click still closes", () => {
    const onSelectDocument = vi.fn();
    const onCloseDocument = vi.fn();
    const { tabs } = render({ onSelectDocument, onCloseDocument });
    act(() => documentTabEls()[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelectDocument).toHaveBeenCalledWith(tabs[1].id);
    act(() =>
      documentTabEls()[2].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 1 })
      )
    );
    expect(onCloseDocument).toHaveBeenCalledWith(tabs[2].id);
  });

  it("tabs are not draggable when onReorderDocuments is omitted", () => {
    render({ withReorder: false });
    expect(documentTabEls()[0].getAttribute("draggable")).toBeNull();
  });
});
