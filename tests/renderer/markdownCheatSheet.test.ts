// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  builtinMarkdownSource,
  isBuiltinMarkdownId
} from "../../src/shared/builtinMarkdown";
import {
  createBuiltinMarkdownCurrentEditor,
  createMarkdownCurrentEditor,
  currentEditorTitle,
  isCurrentEditorDirty,
  markdownDocumentForEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { describeTabContextMenu } from "../../src/renderer/documentTabContextMenu";
import { createBuiltinMarkdownSurfaceSource } from "../../src/renderer/markdownSurfaceSource";
import {
  createInitialOpenDocumentsState,
  documentTabs,
  getDirtyWorkingCopies,
  openOrActivateEditor,
  removeProjectScopedOpenEditors
} from "../../src/renderer/openDocuments";
import { resolveCurrentEditor } from "../../src/renderer/resolveCurrentEditor";
import {
  buildRendererSessionSnapshot,
  buildSessionSnapshotInputs
} from "../../src/renderer/session/sessionSnapshot";
import {
  decideUsageTourAutoStart,
  decideUsageTourManualStart,
  isUsageTourSurfaceUsable
} from "../../src/renderer/usageTour/usageTourSurface";
import {
  createBuiltinMarkdownEditorId,
  deserializeEditorId,
  editorIdEquals,
  isProjectScopedEditorId,
  serializeEditorId
} from "../../src/shared/editorId";
import { t } from "../../src/shared/i18n";
import {
  parseSessionEditor,
  sessionEditorIdentityKey
} from "../../src/shared/session";

const context = { rootPath: "/w/Book" };

function stateWithCheatSheetAndDoc() {
  let state = createInitialOpenDocumentsState();
  state = openOrActivateEditor(
    state,
    createMarkdownCurrentEditor(
      createProjectDocument({ relativePath: "ch1.md", name: "ch1.md" }, "x\n")
    ),
    context
  );
  return openOrActivateEditor(
    state,
    createBuiltinMarkdownCurrentEditor("markdownCheatSheet"),
    context
  );
}

describe("Markdown Cheat Sheet content (ja / en)", () => {
  const ja = builtinMarkdownSource("markdownCheatSheet", "ja");
  const en = builtinMarkdownSource("markdownCheatSheet", "en");

  it("Japanese source has every required construct", () => {
    for (const piece of [
      "# Markdown チートシート",
      "# 見出し1",
      "## 見出し2",
      "**太字**",
      "*イタリック*",
      "~~取り消し線~~",
      "\n---\n",
      "- 項目1",
      "> これは引用文です。",
      "| 名前 | 役割 |",
      "| --- | --- |",
      "[Pergamum-IDE/Pergamum-IDE](https://github.com/Pergamum-IDE/Pergamum-IDE)",
      "$$\nS = \\pi r^2\n$$",
      "```mermaid\ngraph LR",
      "Alice[アリス] -->|友人| Bob[ボブ]"
    ]) {
      expect(ja, piece).toContain(piece);
    }
  });

  it("English source mirrors it and contains no Japanese", () => {
    for (const piece of [
      "# Markdown Cheat Sheet",
      "# Heading 1",
      "## Heading 2",
      "**Bold**",
      "*Italic*",
      "~~Strikethrough~~",
      "- Item 1",
      "> This is a blockquote.",
      "| Name | Role |",
      "[Pergamum-IDE/Pergamum-IDE](https://github.com/Pergamum-IDE/Pergamum-IDE)",
      "$$\nS = \\pi r^2\n$$",
      "```mermaid\ngraph LR"
    ]) {
      expect(en, piece).toContain(piece);
    }
    expect(/[ぁ-んァ-ヶ一-龠々]/.test(en)).toBe(false);
  });

  it("titles the tab per display language", () => {
    expect(t("ja", "markdownCheatSheet.tabTitle")).toBe("Markdown チートシート");
    expect(t("en", "markdownCheatSheet.tabTitle")).toBe("Markdown Cheat Sheet");
    expect(t("ja", "menu.markdownCheatSheet")).toBe("Markdown チートシート");
    expect(t("en", "menu.markdownCheatSheet")).toBe("Markdown Cheat Sheet");
  });
});

describe("built-in document identity and state", () => {
  it("has a locale-independent id, no file path, and round-trips serialization", () => {
    const id = createBuiltinMarkdownEditorId("markdownCheatSheet");
    const serialized = serializeEditorId(id);

    expect(JSON.parse(serialized)).toEqual({
      kind: "builtinMarkdown",
      builtinId: "markdownCheatSheet"
    });
    expect(serialized).not.toMatch(/path|\.md/i);
    expect(editorIdEquals(deserializeEditorId(serialized, null), id)).toBe(true);
    expect(isProjectScopedEditorId(id)).toBe(false);
    expect(isBuiltinMarkdownId("markdownCheatSheet")).toBe(true);
    expect(isBuiltinMarkdownId("other")).toBe(false);
  });

  it("is read-only state: never dirty, not a document, not a dirty working copy", () => {
    const editor = createBuiltinMarkdownCurrentEditor("markdownCheatSheet");

    expect(isCurrentEditorDirty(editor)).toBe(false);
    expect(markdownDocumentForEditor(editor)).toBeNull();
    expect(currentEditorTitle(editor)).toBe("markdownCheatSheet");
    expect(getDirtyWorkingCopies(stateWithCheatSheetAndDoc())).toEqual([]);
    expect(createBuiltinMarkdownSurfaceSource("# x").isDirty).toBe(false);
    expect(createBuiltinMarkdownSurfaceSource("# x").isMarkdownDocument).toBe(true);
  });

  it("opening it again activates the existing tab (no duplicate)", () => {
    const state = stateWithCheatSheetAndDoc();
    const reopened = openOrActivateEditor(
      state,
      createBuiltinMarkdownCurrentEditor("markdownCheatSheet"),
      context
    );

    expect(reopened.documents).toHaveLength(2);
    expect(reopened.activeDocumentId).toEqual(
      createBuiltinMarkdownEditorId("markdownCheatSheet")
    );
  });

  it("survives project close (it belongs to no project)", () => {
    const remaining = removeProjectScopedOpenEditors(stateWithCheatSheetAndDoc());

    expect(remaining.documents.map((entry) => entry.editor.kind)).toEqual([
      "builtinMarkdown"
    ]);
  });

  it("resolves from its id alone (no file read)", async () => {
    const result = await resolveCurrentEditor(
      createBuiltinMarkdownEditorId("markdownCheatSheet"),
      {
        openDocumentsState: createInitialOpenDocumentsState(),
        project: null,
        activeProjectContext: null,
        readProjectDocument: () => Promise.reject(new Error("no file read"))
      }
    );

    expect(result).toEqual({
      kind: "resolved",
      editor: { kind: "builtinMarkdown", builtinId: "markdownCheatSheet" }
    });
  });

  it("tab menu: no Save As / export / copy file name, still closable", () => {
    const tabs = documentTabs(stateWithCheatSheetAndDoc());
    const tab = tabs[1];
    const menu = describeTabContextMenu(tab, {
      allTabs: tabs,
      projectAccess: { kind: "readWrite" },
      enablePlainTextDocuments: true
    });
    const item = (id: string) => menu.items.find((entry) => entry.id === id);

    expect(item("saveAs")?.enabled).toBe(false);
    expect(item("export")?.enabled).toBe(false);
    expect(item("copyFileName")?.enabled).toBe(false);
    expect(item("close")?.enabled).toBe(true);
  });
});

describe("Editor / Preview stack (source boundary)", () => {
  const surface = readFileSync("src/renderer/EditorSurface.tsx", "utf8");
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("uses the regular MarkdownEditorSurface, read-only, Preview forced on, plain Markdown renderer", () => {
    expect(surface).toContain("createBuiltinMarkdownSurfaceSource(builtinMarkdownText");
    expect(surface).toContain("readOnly={isProjectOwnedReadOnly || isBuiltinMarkdown}");
    expect(surface).toContain("previewVisible={previewVisible || isBuiltinMarkdown}");
    expect(surface).toContain("isGlossaryDescription || isBuiltinMarkdown");
    // No dedicated rendering component exists for the cheat sheet.
    expect(surface).not.toMatch(/CheatSheetSurface|CheatSheetPreview/);
  });

  it("does not touch the user's Preview preference and keeps the toggle disabled", () => {
    // `isPreviewEligible` (toggle enablement) only covers documents / glossary.
    expect(app).toContain(
      "const isPreviewEligible =\n    !isEditorAreaSpecialTabActive &&\n    (activeMarkdownDocument !== null || isGlossaryDescriptionEditorActive);"
    );
    expect(app).toContain('activeDocument?.editor.kind === "builtinMarkdown"');
    // Opening the tab never sets layout.markdownEditorPreview.
    const open = app.slice(app.indexOf("function openMarkdownCheatSheetTab()"));
    expect(open.slice(0, open.indexOf("function openEditor("))).not.toContain(
      "markdownEditorPreview"
    );
  });

  it("localizes the tab title and language-selects the source in App", () => {
    expect(app).toContain('translate("markdownCheatSheet.tabTitle")');
    expect(app).toContain("builtinMarkdownSource(");
  });

  it("saveFile ignores a built-in document before touching any document", () => {
    const save = app.slice(app.indexOf("async function saveFile("));
    expect(save.indexOf('editor.kind === "builtinMarkdown"')).toBeGreaterThan(0);
    expect(save.indexOf('editor.kind === "builtinMarkdown"')).toBeLessThan(
      save.indexOf("const targetEditor = targetOpenDocument.editor;")
    );
  });
});

describe("session shape", () => {
  const project = {
    rootPath: "/w/Book",
    activeProjectFilePath: "/w/Book/Book.pergamum",
    accessMode: { kind: "readWrite" as const },
    name: "Book",
    config: null,
    documents: []
  };

  it("records only the built-in id (no path, no content), in tab order, and as active", () => {
    const inputs = buildSessionSnapshotInputs(
      "s",
      project,
      stateWithCheatSheetAndDoc(),
      true
    );
    const snapshot = buildRendererSessionSnapshot(inputs, new Map());

    expect(snapshot.editors.map((editor) => editor.kind)).toEqual([
      "projectMarkdown",
      "builtinMarkdown"
    ]);
    expect(snapshot.editors[1]).toMatchObject({
      kind: "builtinMarkdown",
      builtinId: "markdownCheatSheet",
      order: 1,
      viewState: null
    });
    expect(Object.keys(snapshot.editors[1]).sort()).toEqual([
      "builtinId",
      "kind",
      "order",
      "viewState"
    ]);
    expect(snapshot.activeEditor).toEqual({
      kind: "builtinMarkdown",
      builtinId: "markdownCheatSheet"
    });
  });

  it("parses a built-in entry and drops an unknown id", () => {
    expect(
      parseSessionEditor({ kind: "builtinMarkdown", order: 0, builtinId: "markdownCheatSheet" })
    ).toEqual({
      kind: "builtinMarkdown",
      order: 0,
      builtinId: "markdownCheatSheet",
      viewState: null
    });
    expect(
      parseSessionEditor({ kind: "builtinMarkdown", order: 0, builtinId: "future" })
    ).toBeNull();
    expect(
      sessionEditorIdentityKey({ kind: "builtinMarkdown", builtinId: "markdownCheatSheet" })
    ).toBe("builtinMarkdown\u0000markdownCheatSheet");
  });
});

describe("usage tour start decisions", () => {
  const base = {
    settingsLoading: false,
    settingsFailed: false,
    alreadyDecided: false,
    coldStartSettled: true,
    launchRoutingSettled: true,
    autoShowDisabled: false,
    hasProject: false
  };

  it("auto: eligible and no restored project -> Cheat Sheet first, then the tour", () => {
    expect(decideUsageTourAutoStart(base)).toBe("openCheatSheetThenTour");
  });

  it("auto: a restored project keeps the screen and starts the tour directly", () => {
    expect(decideUsageTourAutoStart({ ...base, hasProject: true })).toBe("openTour");
  });

  it("auto: persistently disabled -> neither tour nor Cheat Sheet", () => {
    expect(decideUsageTourAutoStart({ ...base, autoShowDisabled: true })).toBe("skip");
  });

  it("auto: waits for settings and for the cold-start restore to settle (never decides from a transient null project)", () => {
    for (const patch of [
      { settingsLoading: true },
      { settingsFailed: true },
      { alreadyDecided: true },
      { coldStartSettled: false },
      { launchRoutingSettled: false }
    ]) {
      expect(decideUsageTourAutoStart({ ...base, ...patch })).toBe("wait");
    }
  });

  it("manual: usable Editor + Preview keeps the current screen, otherwise prepares the Cheat Sheet", () => {
    expect(decideUsageTourManualStart(true)).toBe("openTour");
    expect(decideUsageTourManualStart(false)).toBe("openCheatSheetThenTour");
  });
});

describe("isUsageTourSurfaceUsable (target readiness)", () => {
  function mountTargets(sizes: { editor?: number; preview?: number }) {
    document.body.innerHTML =
      '<section data-usage-tour-target="editor-surface"></section><section data-usage-tour-target="preview-surface"></section>';
    const [editor, preview] = Array.from(document.querySelectorAll("section"));
    const rect = (size: number | undefined) =>
      () => ({ width: size ?? 0, height: size ?? 0 }) as DOMRect;
    editor.getBoundingClientRect = rect(sizes.editor);
    preview.getBoundingClientRect = rect(sizes.preview);
  }

  it("is true only when both targets exist and are laid out", () => {
    mountTargets({ editor: 100, preview: 100 });
    expect(isUsageTourSurfaceUsable()).toBe(true);
  });

  it("is false when a target is hidden / zero-sized (e.g. Preview off, special tab)", () => {
    mountTargets({ editor: 100, preview: 0 });
    expect(isUsageTourSurfaceUsable()).toBe(false);
    mountTargets({ editor: 0, preview: 100 });
    expect(isUsageTourSurfaceUsable()).toBe(false);
  });

  it("is false when a target is missing (no project / document)", () => {
    document.body.innerHTML = "";
    expect(isUsageTourSurfaceUsable()).toBe(false);
    document.body.innerHTML = '<section data-usage-tour-target="editor-surface"></section>';
    expect(isUsageTourSurfaceUsable()).toBe(false);
  });
});

describe("App tour wiring (source boundary)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("starts the prepared tour only through the readiness effect, with no wall-clock delay", () => {
    const effect = app.slice(
      app.indexOf("if (pendingUsageTourStart === null) {"),
      app.indexOf("pendingUsageTourStart,\n    activeDocument?.id")
    );

    expect(effect).toContain('activeDocument?.editor.kind !== "builtinMarkdown"');
    expect(effect).toContain("isUsageTourSurfaceUsable()");
    expect(effect).not.toMatch(/setTimeout/);
  });

  it("auto and manual starts use the shared decision helpers", () => {
    expect(app).toContain("decideUsageTourAutoStart({");
    expect(app).toContain("decideUsageTourManualStart(isUsageTourSurfaceUsable())");
  });

  it("keeps the lifecycle: saves only for the automatic tour (valid settings request)", () => {
    expect(app).toContain("toSaveApplicationSettingsRequest(current)");
    expect(app.match(/if \(!isUsageTourManual\)/g)?.length).toBe(2);
  });

  it("Cheat Sheet hyperlinks use the shared external-link policy (no bypass)", () => {
    const surfaceSource = readFileSync("src/shared/builtinMarkdown.ts", "utf8");
    expect(surfaceSource).toContain(
      "(https://github.com/Pergamum-IDE/Pergamum-IDE)"
    );
    // The single delegated Preview click handler covers every `.preview`.
    expect(app).toContain("handlePreviewLinkClick(event");
  });
});
