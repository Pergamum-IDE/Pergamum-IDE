import { describe, expect, it } from "vitest";
import {
  describeTabContextMenu,
  resolveTabCopyText,
  resolveTabReorderTargetIndex,
  type TabContextMenuAction
} from "../../src/renderer/documentTabContextMenu";
import type { DocumentTab } from "../../src/renderer/openDocuments";
import type { ProjectAccessMode } from "../../src/shared/api";
import {
  createFileEditorIdForPath,
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  createUntitledEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";

const projectContext: ActiveProjectContext = { rootPath: "C:\\Novel" };

function projectTab(relativePath: string, isDirty = false): DocumentTab {
  return {
    id: createProjectDocumentEditorId(relativePath, projectContext),
    title: relativePath.split("/").pop() ?? relativePath,
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
const glossaryTab: DocumentTab = {
  id: createGlossaryEntryEditorId(
    "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
    projectContext
  ),
  title: "王都",
  isDirty: false,
  isExternalMarkdownFile: false
};

const readWrite: ProjectAccessMode = { kind: "readWrite" };
const readOnly: ProjectAccessMode = {
  kind: "readOnly",
  reason: "writeLockUnavailable"
};

function menu(
  tab: DocumentTab,
  overrides: {
    allTabs?: DocumentTab[];
    projectAccess?: ProjectAccessMode | null;
  } = {}
) {
  const { items } = describeTabContextMenu(tab, {
    allTabs: overrides.allTabs ?? [tab],
    projectAccess: overrides.projectAccess ?? readWrite
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    items,
    ids: items.map((item) => item.id),
    enabled: (id: TabContextMenuAction) => byId.get(id)?.enabled ?? false,
    reason: (id: TabContextMenuAction) => byId.get(id)?.disabledReasonKey,
    separatorBefore: (id: TabContextMenuAction) =>
      byId.get(id)?.separatorBefore ?? false
  };
}

describe("describeTabContextMenu (#354)", () => {
  it("lists all ten commands in issue order with three separators", () => {
    const m = menu(projectTab("a.md"));
    expect(m.ids).toEqual([
      "close",
      "closeOthers",
      "closeToLeft",
      "closeToRight",
      "selectInFileExplorer",
      "renameFile",
      "saveAs",
      "copyAbsolutePath",
      "copyRelativePath",
      "copyFileName"
    ]);
    expect(m.separatorBefore("selectInFileExplorer")).toBe(true);
    expect(m.separatorBefore("renameFile")).toBe(true);
    expect(m.separatorBefore("copyAbsolutePath")).toBe(true);
    expect(m.items.filter((item) => item.separatorBefore)).toHaveLength(3);
  });

  it("project document tab (read-write, clean) — full capability", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md"), projectTab("c.md")];
    const m = menu(tabs[1], { allTabs: tabs });
    expect(m.enabled("close")).toBe(true);
    expect(m.enabled("closeOthers")).toBe(true);
    expect(m.enabled("closeToLeft")).toBe(true);
    expect(m.enabled("closeToRight")).toBe(true);
    expect(m.enabled("selectInFileExplorer")).toBe(true);
    expect(m.enabled("renameFile")).toBe(true);
    expect(m.enabled("saveAs")).toBe(true);
    expect(m.enabled("copyAbsolutePath")).toBe(true);
    expect(m.enabled("copyRelativePath")).toBe(true);
    expect(m.enabled("copyFileName")).toBe(true);
  });

  it("external file tab — no reveal, no rename, no relative path", () => {
    const m = menu(externalTab, { allTabs: [externalTab] });
    expect(m.enabled("selectInFileExplorer")).toBe(false);
    expect(m.reason("selectInFileExplorer")).toBe(
      "tabs.contextMenu.disabled.notProjectDocument"
    );
    expect(m.enabled("renameFile")).toBe(false);
    expect(m.reason("renameFile")).toBe(
      "tabs.contextMenu.disabled.notProjectDocument"
    );
    expect(m.enabled("saveAs")).toBe(true);
    expect(m.enabled("copyAbsolutePath")).toBe(true);
    expect(m.enabled("copyRelativePath")).toBe(false);
    expect(m.enabled("copyFileName")).toBe(true);
  });

  it("untitled tab — only close, save as, copy file name", () => {
    const m = menu(untitledTab, { allTabs: [untitledTab] });
    expect(m.enabled("selectInFileExplorer")).toBe(false);
    expect(m.enabled("renameFile")).toBe(false);
    expect(m.enabled("saveAs")).toBe(true);
    expect(m.enabled("copyAbsolutePath")).toBe(false);
    expect(m.enabled("copyRelativePath")).toBe(false);
    expect(m.enabled("copyFileName")).toBe(true);
  });

  it("glossary tab — close operations only", () => {
    const m = menu(glossaryTab, { allTabs: [glossaryTab] });
    expect(m.enabled("close")).toBe(true);
    expect(m.enabled("selectInFileExplorer")).toBe(false);
    expect(m.enabled("renameFile")).toBe(false);
    expect(m.enabled("saveAs")).toBe(false);
    expect(m.reason("saveAs")).toBe(
      "tabs.contextMenu.disabled.unsupportedForTab"
    );
    expect(m.enabled("copyAbsolutePath")).toBe(false);
    expect(m.enabled("copyRelativePath")).toBe(false);
    expect(m.enabled("copyFileName")).toBe(false);
  });

  it("read-only project disables Rename Tab File with the read-only reason", () => {
    const m = menu(projectTab("a.md"), { projectAccess: readOnly });
    expect(m.enabled("renameFile")).toBe(false);
    expect(m.reason("renameFile")).toBe(
      "tabs.contextMenu.disabled.readOnlyProject"
    );
  });

  it("dirty project document disables Rename Tab File with the dirty reason", () => {
    const m = menu(projectTab("a.md", true));
    expect(m.enabled("renameFile")).toBe(false);
    expect(m.reason("renameFile")).toBe(
      "tabs.contextMenu.disabled.dirtyDocument"
    );
  });

  it("disables close-others/left/right per tab position", () => {
    const tabs = [projectTab("a.md"), projectTab("b.md"), projectTab("c.md")];

    const first = menu(tabs[0], { allTabs: tabs });
    expect(first.enabled("closeToLeft")).toBe(false);
    expect(first.reason("closeToLeft")).toBe(
      "tabs.contextMenu.disabled.noTabsToLeft"
    );
    expect(first.enabled("closeToRight")).toBe(true);
    expect(first.enabled("closeOthers")).toBe(true);

    const last = menu(tabs[2], { allTabs: tabs });
    expect(last.enabled("closeToRight")).toBe(false);
    expect(last.reason("closeToRight")).toBe(
      "tabs.contextMenu.disabled.noTabsToRight"
    );

    const solo = menu(tabs[0], { allTabs: [tabs[0]] });
    expect(solo.enabled("closeOthers")).toBe(false);
    expect(solo.reason("closeOthers")).toBe(
      "tabs.contextMenu.disabled.noOtherTabs"
    );
    expect(solo.enabled("close")).toBe(true);
  });
});

describe("resolveTabCopyText (#354)", () => {
  it("project document — absolute (root + relative), relative, file name", () => {
    // NOTE: a projectDocument EditorId case-normalizes its relativePath on a
    // case-insensitive root (Windows), so the copied path is lowercased there.
    const text = resolveTabCopyText(projectTab("Drafts/scene.md"), {
      projectRootPath: "C:\\Novel"
    });
    expect(text.absolute).toBe("C:\\Novel\\drafts\\scene.md");
    expect(text.relative).toBe("drafts/scene.md");
    expect(text.fileName).toBe("scene.md");
  });

  it("project document — absolute is null without a project root", () => {
    const text = resolveTabCopyText(projectTab("a.md"), {
      projectRootPath: null
    });
    expect(text.absolute).toBeNull();
    expect(text.relative).toBe("a.md");
  });

  it("external file — absolute is the stored path, no relative", () => {
    const text = resolveTabCopyText(externalTab, { projectRootPath: "C:\\Novel" });
    expect(text.absolute).toBe("C:/Outside/notes.md");
    expect(text.relative).toBeNull();
    expect(text.fileName).toBe("notes.md");
  });

  it("untitled — only the display title as a file name", () => {
    const text = resolveTabCopyText(untitledTab, { projectRootPath: "C:\\Novel" });
    expect(text.absolute).toBeNull();
    expect(text.relative).toBeNull();
    expect(text.fileName).toBe("Untitled-1");
  });

  it("glossary — everything disabled", () => {
    const text = resolveTabCopyText(glossaryTab, { projectRootPath: "C:\\Novel" });
    expect(text).toEqual({ absolute: null, relative: null, fileName: null });
  });
});

describe("resolveTabReorderTargetIndex (#354)", () => {
  // Four tabs, 100px wide each, starting at x=0.
  const rects = [
    { left: 0, right: 100 },
    { left: 100, right: 200 },
    { left: 200, right: 300 },
    { left: 300, right: 400 }
  ];

  it("drops before the first tab", () => {
    expect(resolveTabReorderTargetIndex(10, rects, 3)).toBe(0);
  });

  it("drops after the last tab (clamped to last index)", () => {
    expect(resolveTabReorderTargetIndex(390, rects, 0)).toBe(3);
  });

  it("moving right: A over C's right half lands at index 2", () => {
    // pointer past C midpoint (250) -> 3 midpoints before; moved index 0 < 3
    expect(resolveTabReorderTargetIndex(260, rects, 0)).toBe(2);
  });

  it("moving left: D over A's left half lands at index 0", () => {
    expect(resolveTabReorderTargetIndex(40, rects, 3)).toBe(0);
  });

  it("hovering the moved tab itself is a no-op index", () => {
    expect(resolveTabReorderTargetIndex(140, rects, 1)).toBe(1);
    expect(resolveTabReorderTargetIndex(160, rects, 1)).toBe(1);
  });

  it("empty rects -> 0", () => {
    expect(resolveTabReorderTargetIndex(123, [], 0)).toBe(0);
  });
});
