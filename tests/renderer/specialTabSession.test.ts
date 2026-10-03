import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createMarkdownCurrentEditor,
  createProjectImageCurrentEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import {
  buildRendererSessionSnapshot,
  buildSessionSnapshotInputs
} from "../../src/renderer/session/sessionSnapshot";
import {
  documentWorkspaceTabId,
  specialWorkspaceTabId,
  type WorkspaceTabId
} from "../../src/renderer/workspaceTabs";
import type { PergamumProject } from "../../src/shared/api";
import { createProjectDocumentEditorId } from "../../src/shared/editorId";
import {
  parseSessionEditor,
  parseSessionEditorIdentity,
  sessionEditorIdentityKey
} from "../../src/shared/session";
import {
  isSessionRestorableSpecialTab,
  isSpecialTabId,
  specialTabIds,
  specialTabRequiresProject,
  specialTabSessionPolicy
} from "../../src/shared/specialTab";

const context = { rootPath: "/w/Book" };
const PROJECT: PergamumProject = {
  rootPath: "/w/Book",
  activeProjectFilePath: "/w/Book/Book.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Book",
  config: null,
  documents: []
};

function doc(path: string) {
  return createMarkdownCurrentEditor(
    createProjectDocument({ relativePath: path, name: path }, "x\n")
  );
}

function openAll(paths: string[]) {
  let state = createInitialOpenDocumentsState();

  for (const path of paths) {
    state = openOrActivateEditor(
      state,
      path.endsWith(".png") ? createProjectImageCurrentEditor(path) : doc(path),
      context
    );
  }

  return state;
}

const docTab = (path: string): WorkspaceTabId =>
  documentWorkspaceTabId(createProjectDocumentEditorId(path, context));

function snapshot(options: {
  paths: string[];
  tabIds: WorkspaceTabId[];
  active?: WorkspaceTabId;
  project?: PergamumProject | null;
}) {
  const inputs = buildSessionSnapshotInputs(
    "s",
    options.project === undefined ? PROJECT : options.project,
    openAll(options.paths),
    true,
    { tabIds: options.tabIds, activeTabId: options.active }
  );

  return buildRendererSessionSnapshot(inputs, new Map());
}

describe("special tab Session Restore policy", () => {
  it("declares a policy for every special tab and excludes only Debug Log", () => {
    expect(Object.keys(specialTabSessionPolicy).sort()).toEqual(
      [...specialTabIds].sort()
    );
    expect(specialTabIds.filter((id) => !isSessionRestorableSpecialTab(id))).toEqual([
      "debugLog"
    ]);
  });

  it("classifies project-dependent tabs in one place", () => {
    expect(specialTabIds.filter(specialTabRequiresProject).sort()).toEqual(
      [
        "glossaryEntryManager",
        "glossaryTagManager",
        "projectSettings",
        "resumeHub"
      ].sort()
    );
    expect(specialTabRequiresProject("settings")).toBe(false);
    expect(specialTabRequiresProject("keyboardShortcuts")).toBe(false);
  });

  it("rejects unknown ids", () => {
    expect(isSpecialTabId("settings")).toBe(true);
    expect(isSpecialTabId("futureTab")).toBe(false);
    expect(isSpecialTabId(undefined)).toBe(false);
  });
});

describe("special tab serialization", () => {
  const mixedPaths = ["chapter.md", "map.png", "notes.md"];
  const mixed: WorkspaceTabId[] = [
    docTab("chapter.md"),
    specialWorkspaceTabId("settings"),
    docTab("map.png"),
    specialWorkspaceTabId("projectSettings"),
    docTab("notes.md")
  ];

  it("records documents, images and special tabs in one mixed order", () => {
    const { editors } = snapshot({ paths: mixedPaths, tabIds: mixed });

    expect(
      editors.map((editor) =>
        editor.kind === "specialTab"
          ? `special:${editor.tabId}`
          : editor.kind === "projectImage"
            ? `image:${editor.relativePath}`
            : `doc:${(editor as { relativePath: string }).relativePath}`
      )
    ).toEqual([
      "doc:chapter.md",
      "special:settings",
      "image:map.png",
      "special:projectSettings",
      "doc:notes.md"
    ]);
    expect(editors.map((editor) => editor.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("never records Debug Log, and drops it from the middle of the order", () => {
    const { editors } = snapshot({
      paths: ["chapter.md", "map.png"],
      tabIds: [
        docTab("chapter.md"),
        specialWorkspaceTabId("debugLog"),
        specialWorkspaceTabId("settings"),
        docTab("map.png")
      ]
    });

    expect(editors.map((editor) => editor.kind)).toEqual([
      "projectMarkdown",
      "specialTab",
      "projectImage"
    ]);
    expect(JSON.stringify(editors)).not.toContain("debugLog");
  });

  it("records an active restorable special tab as the active identity", () => {
    const { activeEditor } = snapshot({
      paths: mixedPaths,
      tabIds: mixed,
      active: specialWorkspaceTabId("settings")
    });

    expect(activeEditor).toEqual({ kind: "specialTab", tabId: "settings" });
  });

  it("falls back to the active document when Debug Log was active", () => {
    const { activeEditor } = snapshot({
      paths: ["chapter.md"],
      tabIds: [
        docTab("chapter.md"),
        specialWorkspaceTabId("settings"),
        specialWorkspaceTabId("debugLog")
      ],
      active: specialWorkspaceTabId("debugLog")
    });

    expect(activeEditor).toEqual({
      kind: "projectMarkdown",
      relativePath: "chapter.md"
    });
  });

  it("keeps project-independent tabs but drops project-dependent ones with no project", () => {
    const { editors } = snapshot({
      paths: [],
      tabIds: [
        specialWorkspaceTabId("settings"),
        specialWorkspaceTabId("projectSettings"),
        specialWorkspaceTabId("glossaryTagManager")
      ],
      project: null
    });

    expect(editors.map((editor) => editor.kind === "specialTab" && editor.tabId)).toEqual([
      "settings"
    ]);
  });

  it("keeps the legacy documents-only shape when no workspace tabs are given", () => {
    const inputs = buildSessionSnapshotInputs(
      "s",
      PROJECT,
      openAll(["chapter.md", "map.png"]),
      true
    );

    expect(inputs.editors.map((entry) => entry.editor.kind)).toEqual([
      "projectMarkdown",
      "projectImage"
    ]);
  });
});

describe("special tab session parsing", () => {
  it("round-trips a special tab and its identity key", () => {
    const parsed = parseSessionEditor({
      kind: "specialTab",
      order: 1,
      tabId: "projectSettings",
      viewState: { scroll: 99 }
    });

    expect(parsed).toEqual({
      kind: "specialTab",
      order: 1,
      tabId: "projectSettings",
      viewState: null
    });
    expect(
      sessionEditorIdentityKey({ kind: "specialTab", tabId: "projectSettings" })
    ).toBe("specialTab\u0000projectSettings");
    expect(
      parseSessionEditorIdentity({ kind: "specialTab", tabId: "settings" })
    ).toEqual({ kind: "specialTab", tabId: "settings" });
  });

  it("drops an unknown special tab id without affecting other entries", () => {
    expect(
      parseSessionEditor({ kind: "specialTab", order: 0, tabId: "futureTab" })
    ).toBeNull();
    expect(
      parseSessionEditorIdentity({ kind: "specialTab", tabId: "futureTab" })
    ).toBeNull();
  });
});

describe("App wiring (source boundary)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("feeds the mixed tab bar into every session snapshot, including project close", () => {
    expect(app).toContain("const sessionWorkspaceTabs = useMemo(");
    expect(app.match(/sessionWorkspaceTabs\s*\n?\s*\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    const closing = app.slice(app.indexOf("const preCloseSessionInputs"));
    expect(closing.slice(0, 900).match(/sessionWorkspaceTabs/g)).toHaveLength(2);
  });

  it("restores special tabs through the open flags (never Debug Log), keeping the mixed order", () => {
    const restore = app.slice(app.indexOf("function applyRestoredEnvironment("));
    expect(restore).toContain("restoreSpecialTabOpenState(tabId)");
    expect(restore).toContain("setActiveSpecialTabId(env.activeSpecialTabId)");
    expect(restore).toContain("setWorkspaceTabOrder(env.workspaceTabOrder)");

    const helper = app.slice(app.indexOf("function restoreSpecialTabOpenState("));
    expect(helper.slice(0, helper.indexOf("function applyRestoredEnvironment("))).toContain(
      'case "debugLog":'
    );
  });
});
