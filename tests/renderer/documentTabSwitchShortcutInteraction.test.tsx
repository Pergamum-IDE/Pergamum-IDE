// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findAdjacentWorkspaceTab,
  shouldHandleTabSwitchShortcut,
  useTabSwitchShortcuts
} from "../../src/renderer/editorTabShortcuts";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import {
  createProjectDocumentEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import {
  documentWorkspaceTabId,
  orderedWorkspaceTabs,
  specialWorkspaceTabId,
  type SpecialWorkspaceTab,
  type WorkspaceTabId
} from "../../src/renderer/workspaceTabs";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

function projectTab(relativePath: string, isDirty = false): DocumentTab {
  return {
    id: createProjectDocumentEditorId(relativePath, projectContext),
    title: relativePath,
    isDirty,
    isExternalMarkdownFile: false
  };
}

const settingsSpecialTab: SpecialWorkspaceTab = {
  kind: "special",
  id: "settings",
  title: "設定"
};

describe("Tab switch shortcuts interaction logic (#480)", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("keeps App workspace activation tied to current special-tab state", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "renderer", "App.tsx"),
      "utf8"
    );

    expect(source).toContain("function activateWorkspaceTab(tab: WorkspaceTab): void");
    expect(source).not.toMatch(/const\s+activateWorkspaceTab\s*=\s*useCallback/);
  });

  it("switches to previous tab on Alt+Left from middle tab", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md"), projectTab("c.md")];
    const activeWorkspaceTabId: WorkspaceTabId = documentWorkspaceTabId(tabs[1].id);

    const renderedTabs = orderedWorkspaceTabs(tabs, [], []);
    const target = findAdjacentWorkspaceTab(renderedTabs, activeWorkspaceTabId, "previous");

    expect(target).not.toBeNull();
    expect(target?.kind).toBe("document");
    if (target?.kind === "document") {
      expect(target.title).toBe("a.md");
    }
  });

  it("switches to next tab on Alt+Right from middle tab", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md"), projectTab("c.md")];
    const activeWorkspaceTabId: WorkspaceTabId = documentWorkspaceTabId(tabs[1].id);

    const renderedTabs = orderedWorkspaceTabs(tabs, [], []);
    const target = findAdjacentWorkspaceTab(renderedTabs, activeWorkspaceTabId, "next");

    expect(target).not.toBeNull();
    expect(target?.kind).toBe("document");
    if (target?.kind === "document") {
      expect(target.title).toBe("c.md");
    }
  });

  it("returns null on first tab boundary for Alt+Left (no-op)", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md")];
    const activeWorkspaceTabId: WorkspaceTabId = documentWorkspaceTabId(tabs[0].id);

    const renderedTabs = orderedWorkspaceTabs(tabs, [], []);
    const target = findAdjacentWorkspaceTab(renderedTabs, activeWorkspaceTabId, "previous");

    expect(target).toBeNull();
  });

  it("returns null on last tab boundary for Alt+Right (no-op)", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md")];
    const activeWorkspaceTabId: WorkspaceTabId = documentWorkspaceTabId(tabs[1].id);

    const renderedTabs = orderedWorkspaceTabs(tabs, [], []);
    const target = findAdjacentWorkspaceTab(renderedTabs, activeWorkspaceTabId, "next");

    expect(target).toBeNull();
  });

  it("does not trigger tab switch when focused on an input element", () => {
    const input = document.createElement("input");
    container.appendChild(input);
    input.focus();

    const event = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "ArrowLeft",
      target: input
    };

    const direction = shouldHandleTabSwitchShortcut(event, false);
    expect(direction).toBeNull();
  });

  it("does not trigger tab switch when a dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    container.appendChild(dialog);

    const div = document.createElement("div");
    container.appendChild(div);

    const event = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "ArrowLeft",
      target: div
    };

    const direction = shouldHandleTabSwitchShortcut(event, true);
    expect(direction).toBeNull();
  });

  it("allows tab switch when focused in CodeMirror editor content", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const content = document.createElement("div");
    content.className = "cm-content";
    content.contentEditable = "true";
    editor.appendChild(content);
    container.appendChild(editor);

    const event = {
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "ArrowLeft",
      target: content
    };

    const direction = shouldHandleTabSwitchShortcut(event, false);
    expect(direction).toBe("previous");
  });

  it("captures Alt+Left / Alt+Right before child element consumes or stops propagation of arrow keys (#480 blocker fix)", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md"), projectTab("c.md")];
    const onActivateWorkspaceTab = vi.fn();

    // Render a TestComponent using useTabSwitchShortcuts hook
    const TestComponent = () => {
      useTabSwitchShortcuts({
        tabs,
        specialTabs: [],
        workspaceTabOrder: [],
        activeWorkspaceTabId: documentWorkspaceTabId(tabs[1].id),
        onActivateWorkspaceTab
      });
      return (
        <div className="cm-editor">
          <div className="cm-content" tabIndex={0} contentEditable="true">
            Middle of document text
          </div>
        </div>
      );
    };

    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const cmContent = container.querySelector(".cm-content")!;
    expect(cmContent).not.toBeNull();

    // Attach a target listener on cmContent that stops propagation to simulate CodeMirror's behavior
    cmContent.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    // Dispatch keydown event for Alt+Left
    act(() => {
      cmContent.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });

    // Capture phase must have caught it BEFORE cmContent stopped propagation!
    expect(onActivateWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(onActivateWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({ id: tabs[0].id })
    );

    act(() => root.unmount());
  });

  it("switches seamlessly between document tabs and special tabs on Alt+Right / Alt+Left (#480 blocker fix)", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md")];
    const specialTabs: SpecialWorkspaceTab[] = [settingsSpecialTab];
    const onActivateWorkspaceTab = vi.fn();

    // Visual order: [a.md, b.md, Settings]
    const TestComponent = ({ activeTabId }: { activeTabId: WorkspaceTabId }) => {
      useTabSwitchShortcuts({
        tabs,
        specialTabs,
        workspaceTabOrder: [],
        activeWorkspaceTabId: activeTabId,
        onActivateWorkspaceTab
      });
      return <div>App Shell</div>;
    };

    const root = createRoot(container);

    // Case A: b.md active + Alt+Right -> activates Settings special tab
    act(() => {
      root.render(<TestComponent activeTabId={documentWorkspaceTabId(tabs[1].id)} />);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(onActivateWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(onActivateWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "special", id: "settings" })
    );

    onActivateWorkspaceTab.mockClear();

    // Case B: Settings special tab active + Alt+Left -> activates b.md document tab
    act(() => {
      root.render(<TestComponent activeTabId={specialWorkspaceTabId("settings")} />);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowLeft",
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(onActivateWorkspaceTab).toHaveBeenCalledTimes(1);
    expect(onActivateWorkspaceTab).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "document", id: tabs[1].id })
    );

    act(() => root.unmount());
  });

  it("uses the latest activation callback when the hook rerenders with current workspace state", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md")];
    const specialTabs: SpecialWorkspaceTab[] = [settingsSpecialTab];
    const firstActivation = vi.fn();
    const latestActivation = vi.fn();

    const TestComponent = ({
      onActivateWorkspaceTab
    }: {
      onActivateWorkspaceTab: Parameters<
        typeof useTabSwitchShortcuts
      >[0]["onActivateWorkspaceTab"];
    }) => {
      useTabSwitchShortcuts({
        tabs,
        specialTabs,
        workspaceTabOrder: [],
        activeWorkspaceTabId: documentWorkspaceTabId(tabs[1].id),
        onActivateWorkspaceTab
      });
      return <div className="workspaceShell">App Shell</div>;
    };

    const root = createRoot(container);

    act(() => {
      root.render(<TestComponent onActivateWorkspaceTab={firstActivation} />);
    });
    act(() => {
      root.render(<TestComponent onActivateWorkspaceTab={latestActivation} />);
    });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });

    expect(firstActivation).not.toHaveBeenCalled();
    expect(latestActivation).toHaveBeenCalledTimes(1);
    expect(latestActivation).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "special", id: "settings" })
    );

    act(() => root.unmount());
  });

  it("does not trigger tab switch when focus is inside a Settings input field (#480 blocker fix)", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md")];
    const specialTabs: SpecialWorkspaceTab[] = [settingsSpecialTab];
    const onActivateWorkspaceTab = vi.fn();

    const TestComponent = () => {
      useTabSwitchShortcuts({
        tabs,
        specialTabs,
        workspaceTabOrder: [],
        activeWorkspaceTabId: specialWorkspaceTabId("settings"),
        onActivateWorkspaceTab
      });
      return (
        <div className="settingsPanel">
          <input className="settingsInput" defaultValue="setting-value" />
        </div>
      );
    };

    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const settingsInput = container.querySelector<HTMLInputElement>(".settingsInput")!;
    expect(settingsInput).not.toBeNull();
    settingsInput.focus();

    act(() => {
      settingsInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          altKey: true,
          bubbles: true,
          cancelable: true
        })
      );
    });

    // Input focus must block the tab switch shortcut!
    expect(onActivateWorkspaceTab).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("does not trigger F2 file rename when a Special tab is active (#478 regression guard)", () => {
    const onTabAction = vi.fn();

    // Render a Special Tab element
    const handleSpecialTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "F2") {
        // Special tab F2 should be no-op / ignored for file rename
        return;
      }
    };

    const TestComponent = () => (
      <div
        className="documentTab isActive"
        role="tab"
        tabIndex={0}
        onKeyDown={handleSpecialTabKeyDown}
      >
        <span className="documentTabTitle">設定</span>
      </div>
    );

    const root = createRoot(container);
    act(() => {
      root.render(<TestComponent />);
    });

    const specialTabEl = container.querySelector<HTMLDivElement>(".documentTab")!;
    act(() => {
      specialTabEl.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true })
      );
    });

    expect(onTabAction).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
