// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  findAdjacentWorkspaceTab,
  isEditableTextInputTarget,
  isModalOrDialogActive,
  shouldHandleTabSwitchShortcut
} from "../../src/renderer/editorTabShortcuts";
import {
  documentWorkspaceTabId,
  specialWorkspaceTabId,
  type WorkspaceTab
} from "../../src/renderer/workspaceTabs";
import { createProjectDocumentEditorId } from "../../src/shared/editorId";

const projectContext = { rootPath: "C:\\Novel" };
const docIdA = createProjectDocumentEditorId("a.md", projectContext);
const docIdB = createProjectDocumentEditorId("b.md", projectContext);
const docIdC = createProjectDocumentEditorId("c.md", projectContext);

const tabA: WorkspaceTab = {
  kind: "document",
  id: docIdA,
  title: "a.md",
  isDirty: false,
  isExternalMarkdownFile: false
};
const tabB: WorkspaceTab = {
  kind: "document",
  id: docIdB,
  title: "b.md",
  isDirty: false,
  isExternalMarkdownFile: false
};
const tabC: WorkspaceTab = {
  kind: "document",
  id: docIdC,
  title: "c.md",
  isDirty: false,
  isExternalMarkdownFile: false
};
const specialTabSettings: WorkspaceTab = {
  kind: "special",
  id: "settings",
  title: "設定"
};

const tabs = [tabA, tabB, specialTabSettings, tabC];

describe("editorTabShortcuts - findAdjacentWorkspaceTab", () => {
  it("navigates to previous tab from middle tab", () => {
    const prev = findAdjacentWorkspaceTab(tabs, documentWorkspaceTabId(docIdB), "previous");
    expect(prev).toBe(tabA);
  });

  it("navigates to next tab from middle tab", () => {
    const next = findAdjacentWorkspaceTab(tabs, documentWorkspaceTabId(docIdB), "next");
    expect(next).toBe(specialTabSettings);
  });

  it("navigates across special and document tabs seamlessly", () => {
    const nextFromSpecial = findAdjacentWorkspaceTab(
      tabs,
      specialWorkspaceTabId("settings"),
      "next"
    );
    expect(nextFromSpecial).toBe(tabC);
  });

  it("returns null at first tab boundary for Alt+Left", () => {
    const boundary = findAdjacentWorkspaceTab(tabs, documentWorkspaceTabId(docIdA), "previous");
    expect(boundary).toBeNull();
  });

  it("returns null at last tab boundary for Alt+Right", () => {
    const boundary = findAdjacentWorkspaceTab(tabs, documentWorkspaceTabId(docIdC), "next");
    expect(boundary).toBeNull();
  });

  it("returns null when only single tab is open", () => {
    expect(findAdjacentWorkspaceTab([tabA], documentWorkspaceTabId(docIdA), "previous")).toBeNull();
    expect(findAdjacentWorkspaceTab([tabA], documentWorkspaceTabId(docIdA), "next")).toBeNull();
  });

  it("returns null when active tab is not in list", () => {
    const unknownId = createProjectDocumentEditorId("unknown.md", projectContext);
    expect(
      findAdjacentWorkspaceTab(tabs, documentWorkspaceTabId(unknownId), "previous")
    ).toBeNull();
  });

  it("handles seamless switching across multiple document and special tabs (#480 blocker fix)", () => {
    const specialGlossary: WorkspaceTab = { kind: "special", id: "glossaryEntryManager", title: "語彙管理設定" };
    const specialTag: WorkspaceTab = { kind: "special", id: "glossaryTagManager", title: "タグ管理設定" };
    const specialApp: WorkspaceTab = { kind: "special", id: "settings", title: "アプリケーション設定" };
    const specialProject: WorkspaceTab = { kind: "special", id: "projectSettings", title: "プロジェクト設定" };

    const fullTabs = [tabA, tabB, tabC, specialGlossary, specialTag, specialApp, specialProject];

    // C.md active + next -> 語彙管理設定
    expect(
      findAdjacentWorkspaceTab(fullTabs, documentWorkspaceTabId(docIdC), "next")
    ).toBe(specialGlossary);

    // 語彙管理設定 active + previous -> C.md
    expect(
      findAdjacentWorkspaceTab(fullTabs, specialWorkspaceTabId("glossaryEntryManager"), "previous")
    ).toBe(tabC);

    // 語彙管理設定 active + next -> タグ管理設定
    expect(
      findAdjacentWorkspaceTab(fullTabs, specialWorkspaceTabId("glossaryEntryManager"), "next")
    ).toBe(specialTag);

    // プロジェクト設定 active + next -> null (boundary no-op)
    expect(
      findAdjacentWorkspaceTab(fullTabs, specialWorkspaceTabId("projectSettings"), "next")
    ).toBeNull();

    // A.md active + previous -> null (boundary no-op)
    expect(
      findAdjacentWorkspaceTab(fullTabs, documentWorkspaceTabId(docIdA), "previous")
    ).toBeNull();
  });
});

describe("editorTabShortcuts - isEditableTextInputTarget", () => {
  it("returns true for input, textarea, and select elements", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");

    expect(isEditableTextInputTarget(input)).toBe(true);
    expect(isEditableTextInputTarget(textarea)).toBe(true);
    expect(isEditableTextInputTarget(select)).toBe(true);
  });

  it("returns false for regular elements like div or button", () => {
    const div = document.createElement("div");
    const button = document.createElement("button");

    expect(isEditableTextInputTarget(div)).toBe(false);
    expect(isEditableTextInputTarget(button)).toBe(false);
  });

  it("returns true for generic contenteditable elements outside CodeMirror", () => {
    const editableDiv = document.createElement("div");
    editableDiv.contentEditable = "true";

    expect(isEditableTextInputTarget(editableDiv)).toBe(true);
  });

  it("returns false for CodeMirror editor content area (.cm-content inside .cm-editor)", () => {
    const cmEditor = document.createElement("div");
    cmEditor.className = "cm-editor";
    const cmContent = document.createElement("div");
    cmContent.className = "cm-content";
    cmContent.contentEditable = "true";
    cmEditor.appendChild(cmContent);

    expect(isEditableTextInputTarget(cmContent)).toBe(false);
  });
});

describe("editorTabShortcuts - isModalOrDialogActive", () => {
  it("returns true when target is inside a dialog or modal container", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const child = document.createElement("button");
    dialog.appendChild(child);

    expect(isModalOrDialogActive(child)).toBe(true);
  });

  it("returns false for non-dialog workspace targets when no modal overlay exists", () => {
    const workspaceDiv = document.createElement("div");
    workspaceDiv.className = "settingsPanel";

    expect(isModalOrDialogActive(workspaceDiv)).toBe(false);
  });
});

describe("editorTabShortcuts - shouldHandleTabSwitchShortcut", () => {
  it("returns 'previous' for Alt+Left keydown", () => {
    const result = shouldHandleTabSwitchShortcut(
      { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft", target: document.createElement("div") },
      false
    );
    expect(result).toBe("previous");
  });

  it("returns 'next' for Alt+Right keydown", () => {
    const result = shouldHandleTabSwitchShortcut(
      { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowRight", target: document.createElement("div") },
      false
    );
    expect(result).toBe("next");
  });

  it("returns null if other modifier keys are pressed (e.g. Ctrl+Alt+Left)", () => {
    const result = shouldHandleTabSwitchShortcut(
      { altKey: true, ctrlKey: true, metaKey: false, shiftKey: false, key: "ArrowLeft", target: document.createElement("div") },
      false
    );
    expect(result).toBeNull();
  });

  it("returns null if target is an editable input", () => {
    const input = document.createElement("input");
    const result = shouldHandleTabSwitchShortcut(
      { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft", target: input },
      false
    );
    expect(result).toBeNull();
  });

  it("returns null if a modal/dialog is active", () => {
    const result = shouldHandleTabSwitchShortcut(
      { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft", target: document.createElement("div") },
      true
    );
    expect(result).toBeNull();
  });

  it("returns null if event is defaultPrevented or composing", () => {
    expect(
      shouldHandleTabSwitchShortcut(
        { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft", target: document.createElement("div"), defaultPrevented: true },
        false
      )
    ).toBeNull();

    expect(
      shouldHandleTabSwitchShortcut(
        { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft", target: document.createElement("div"), isComposing: true },
        false
      )
    ).toBeNull();
  });
});
