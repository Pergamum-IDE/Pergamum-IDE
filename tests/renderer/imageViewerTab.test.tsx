import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createMarkdownCurrentEditor,
  createProjectImageCurrentEditor,
  currentEditorTitle,
  isCurrentEditorDirty,
  markdownDocumentForEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { resolveJapaneseLintEditorSource } from "../../src/renderer/japaneseLint/japaneseLintEditorSource";
import { describeTabContextMenu } from "../../src/renderer/documentTabContextMenu";
import { getFileExplorerEntryKind } from "../../src/renderer/fileExplorerVisibility";
import { ImageViewerSurface } from "../../src/renderer/ImageViewerSurface";
import {
  createInitialOpenDocumentsState,
  documentTabs,
  getDirtyWorkingCopies,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import {
  planProjectDocumentMoveRelocation,
  relocatedPathInMovedFolders
} from "../../src/renderer/projectDocumentMoveRelocation";
import {
  buildRendererSessionSnapshot,
  buildSessionSnapshotInputs
} from "../../src/renderer/session/sessionSnapshot";
import { isSupportedProjectImageFileName } from "../../src/renderer/markdownImageReferenceMoveUpdate";
import type { PergamumProject } from "../../src/shared/api";
import { createProjectDocumentEditorId } from "../../src/shared/editorId";
import { t, type TranslationKey } from "../../src/shared/i18n";
import {
  parseSessionEditor,
  sessionEditorIdentity,
  sessionEditorIdentityKey
} from "../../src/shared/session";

const context = { rootPath: "/w/Book" };
const PROJECT: PergamumProject = {
  rootPath: "/w/Book",
  activeProjectFilePath: "/w/Book/Book.pergamum",
  accessMode: { kind: "readWrite" },
  name: "Book",
  config: null,
  documents: [{ relativePath: "ch1.md", name: "ch1.md" }]
};

function stateWith(...paths: string[]) {
  let state = createInitialOpenDocumentsState();

  for (const path of paths) {
    state = openOrActivateEditor(
      state,
      path.endsWith(".png")
        ? createProjectImageCurrentEditor(path)
        : createMarkdownCurrentEditor(
            createProjectDocument(
              { relativePath: path, name: path },
              "text\n"
            )
          ),
      context
    );
  }

  return state;
}

describe("file kind: image / markdown / text (24)", () => {
  const opts = { enablePlainTextDocuments: true };
  const entry = (name: string) => ({
    kind: "file" as const,
    name,
    relativePath: name
  });

  it("classifies supported images as assets and .md / .txt as documents", () => {
    for (const name of ["a.png", "a.jpg", "a.JPEG", "a.gif", "a.webp"]) {
      expect(isSupportedProjectImageFileName(name), name).toBe(true);
      expect(getFileExplorerEntryKind(entry(name), opts), name).toBe("asset");
    }
    expect(getFileExplorerEntryKind(entry("a.md"), opts)).toBe("document");
    expect(getFileExplorerEntryKind(entry("a.txt"), opts)).toBe("document");
  });

  it("does not add SVG (or other formats) to the supported image set", () => {
    for (const name of ["a.svg", "a.bmp", "a.avif", "a.ico"]) {
      expect(isSupportedProjectImageFileName(name), name).toBe(false);
    }
  });
});

describe("image tab identity and state (25 / 26 / 29)", () => {
  it("is a project-document identity, titled by file name, never dirty, no document", () => {
    const editor = createProjectImageCurrentEditor("art/map.png");

    expect(editor.kind).toBe("projectImage");
    expect(currentEditorTitle(editor)).toBe("map.png");
    expect(isCurrentEditorDirty(editor)).toBe(false);
    expect(markdownDocumentForEditor(editor)).toBeNull();
  });

  it("opening the same image twice activates the existing tab (no duplicate)", () => {
    const state = stateWith("ch1.md", "art/map.png", "ch1.md");
    const again = openOrActivateEditor(
      state,
      createProjectImageCurrentEditor("art/map.png"),
      context
    );

    expect(again.documents).toHaveLength(2);
    expect(again.activeDocumentId).toEqual(
      createProjectDocumentEditorId("art/map.png", context)
    );
  });

  it("is never a dirty working copy (Save All / close confirmation)", () => {
    expect(getDirtyWorkingCopies(stateWith("art/map.png"))).toEqual([]);
  });

  it("marks the tab as an image viewer and disables Save As in its tab menu", () => {
    const tabs = documentTabs(stateWith("ch1.md", "art/map.png"));
    const imageTab = tabs[1];
    const menu = describeTabContextMenu(imageTab, {
      allTabs: tabs,
      projectAccess: { kind: "readWrite" },
      enablePlainTextDocuments: true
    });
    const item = (id: string) => menu.items.find((entry) => entry.id === id);

    expect(imageTab.isImageViewer).toBe(true);
    expect(tabs[0].isImageViewer).toBeUndefined();
    expect(item("saveAs")?.enabled).toBe(false);
    expect(item("export")?.enabled).toBe(false);
    expect(item("japaneseMachineCheck")?.enabled).toBe(false);
    // Reveal / rename / copy path keep working through the shared identity.
    expect(item("selectInFileExplorer")?.enabled).toBe(true);
    expect(item("renameFile")?.enabled).toBe(true);
  });
});

describe("image viewer surface (27 / 28 / 21 / 23)", () => {
  const render = (language: "ja" | "en", relativePath = "art/my map.png") =>
    renderToStaticMarkup(
      <ImageViewerSurface
        relativePath={relativePath}
        name="my map.png"
        translate={(key: TranslationKey) => t(language, key)}
        ratio={0.5}
        isNarrow={false}
      />
    );

  it("shows the localized read-only notice on the editor side (Japanese)", () => {
    const html = render("ja");

    expect(html).toContain("画像ファイルは編集できません");
    expect(html).toContain('data-image-viewer-editor="read-only"');
  });

  it("shows the localized read-only notice on the editor side (English)", () => {
    expect(render("en")).toContain("Image files cannot be edited.");
  });

  it("has no editable surface: no CodeMirror, textarea or input", () => {
    const html = render("ja");

    expect(html).not.toContain("cm-editor");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("contenteditable");
  });

  it("previews the image through the project-local protocol (no file://, no Markdown)", () => {
    const html = render("en");

    expect(html).toContain('src="pergamum-asset://project/art/my%20map.png"');
    expect(html).toContain('alt="my map.png"');
    expect(html).not.toContain("file://");
  });

  it("shows the localized load-failure message for a non-canonical path", () => {
    expect(render("ja", "../outside.png")).toContain("画像を表示できません");
    expect(render("en", "../outside.png")).toContain(
      "The image could not be displayed."
    );
    expect(render("en", "../outside.png")).not.toContain("<img");
  });

  it("does not run the Markdown renderer or linters (source boundary)", () => {
    // Comments may name these on purpose; only code is checked.
    const source = readFileSync(
      "src/renderer/ImageViewerSurface.tsx",
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    for (const forbidden of [
      "markdownPreviewRenderer",
      "MarkdownEditor",
      "CodeMirror",
      "japaneseLint",
      "markdown-it"
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }

    const surface = readFileSync("src/renderer/EditorSurface.tsx", "utf8");
    expect(surface).toContain('editor.kind === "projectImage"');
    expect(surface.indexOf('editor.kind === "projectImage"')).toBeLessThan(
      surface.indexOf("<TextEditorSurface")
    );
  });

  it("keeps the image fit rules (aspect ratio, no upscale, contained)", () => {
    const css = readFileSync("src/renderer/styles.css", "utf8");
    const rule = css.slice(css.indexOf(".imageViewerImage {"));
    const body = rule.slice(0, rule.indexOf("}"));

    expect(body).toContain("max-width: 100%");
    expect(body).toContain("max-height: 100%");
    expect(body).toContain("object-fit: contain");
    expect(body).not.toMatch(/(^|[^-])width:\s*100%/);
  });
});

describe("Save / Recovery / App wiring boundaries (14 / 22 / 23)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("saveFile ignores an image tab before touching any document", () => {
    const save = app.slice(app.indexOf("async function saveFile("));
    expect(save.indexOf('editor.kind === "projectImage"')).toBeGreaterThan(0);
    expect(save.indexOf('editor.kind === "projectImage"')).toBeLessThan(
      save.indexOf("const targetEditor = targetOpenDocument.editor;")
    );
  });

  it("opens an image through activateProjectDocument without reading text", () => {
    const body = app.slice(
      app.indexOf("async function activateProjectDocument(")
    );
    const imageBranch = body.slice(
      body.indexOf("isSupportedProjectImageFileName(relativePath)"),
      body.indexOf("readProjectDocument(")
    );

    expect(imageBranch).toContain("createProjectImageCurrentEditor(relativePath)");
    expect(imageBranch).not.toContain("readProjectDocument");
  });
});

describe("Session serialize / restore shape (30)", () => {
  it("records markdown + image + text tabs and the active image tab", () => {
    const state = stateWith("ch1.md", "art/map.png", "notes.md");
    const active = openOrActivateEditor(
      state,
      createProjectImageCurrentEditor("art/map.png"),
      context
    );
    const inputs = buildSessionSnapshotInputs("s", PROJECT, active, true);
    const snapshot = buildRendererSessionSnapshot(inputs, new Map());

    expect(snapshot.editors.map((editor) => editor.kind)).toEqual([
      "projectMarkdown",
      "projectImage",
      "projectMarkdown"
    ]);
    expect(snapshot.editors[1]).toMatchObject({
      kind: "projectImage",
      relativePath: "art/map.png",
      viewState: null
    });
    expect(snapshot.activeEditor).toEqual({
      kind: "projectImage",
      relativePath: "art/map.png"
    });
  });

  it("round-trips through the session parser as an image editor, never as text", () => {
    const parsed = parseSessionEditor({
      kind: "projectImage",
      order: 2,
      relativePath: "art/map.png",
      viewState: { garbage: true }
    });

    expect(parsed).toEqual({
      kind: "projectImage",
      order: 2,
      relativePath: "art/map.png",
      viewState: null
    });
    expect(sessionEditorIdentityKey(sessionEditorIdentity(parsed!))).toBe(
      "projectImage\u0000art/map.png"
    );
    expect(
      parseSessionEditor({ kind: "projectImage", order: 0, relativePath: "" })
    ).toBeNull();
  });
});

describe("Move / Rename follows the image tab (32)", () => {
  const plan = (
    paths: string[],
    relocations: Array<{ oldRelativePath: string; newRelativePath: string }>,
    movedFolders: Array<{ from: string; to: string }> = []
  ) =>
    planProjectDocumentMoveRelocation({
      projectSnapshot: PROJECT,
      currentProject: PROJECT,
      relocations,
      movedFolders,
      openDocumentsState: stateWith(...paths),
      context,
      recoveryKeyForRelativePath: () => null
    });

  it("re-keys an open image tab when the file moves or is renamed", () => {
    const result = plan(
      ["ch1.md", "art/map.png"],
      [{ oldRelativePath: "art/map.png", newRelativePath: "maps/map2.png" }]
    );
    const tab = result!.openDocumentsState.documents[1];

    expect(result!.openDocumentsChanged).toBe(true);
    expect(tab.editor).toMatchObject({
      kind: "projectImage",
      relativePath: "maps/map2.png",
      name: "map2.png"
    });
    expect(tab.id).toEqual(createProjectDocumentEditorId("maps/map2.png", context));
  });

  it("re-keys an image tab inside a moved / renamed folder (images are not in the folder's document list)", () => {
    const result = plan(["art/sub/map.png"], [], [{ from: "art", to: "gfx/art" }]);

    expect(result!.openDocumentsState.documents[0].editor).toMatchObject({
      kind: "projectImage",
      relativePath: "gfx/art/sub/map.png"
    });
    expect(relocatedPathInMovedFolders("artwork/a.png", [{ from: "art", to: "x" }])).toBeNull();
    expect(relocatedPathInMovedFolders("art/a.png", [{ from: "art", to: "" }])).toBe("a.png");
  });

  it("leaves unrelated image tabs alone", () => {
    const result = plan(
      ["art/map.png"],
      [{ oldRelativePath: "other/x.png", newRelativePath: "other/y.png" }]
    );

    expect(result!.openDocumentsChanged).toBe(false);
  });
});

describe("command enablement for an active image tab (28 / 18 / 19 / 20)", () => {
  const app = readFileSync("src/renderer/App.tsx", "utf8");

  it("has no Japanese lint source (linter disabled, nothing to lint)", () => {
    expect(
      resolveJapaneseLintEditorSource(
        {
          isSpecialTabActive: false,
          currentEditor: createProjectImageCurrentEditor("art/map.png")
        },
        () => true
      )
    ).toBeNull();
  });

  it("derives the editing / Markdown command gates from a markdown or glossary editor kind", () => {
    // These gates key off `currentEditor.kind === "markdown"` /
    // `markdownDocumentForEditor()` / the glossary flag, so a projectImage
    // editor is outside all of them: Markdown toolbar, Save, Save As, Find,
    // linters, outline, glossary and Preview-eligibility stay disabled.
    for (const gate of [
      'currentEditor?.kind === "markdown"',
      "const isPreviewEligible =",
      "(activeMarkdownDocument !== null || isGlossaryDescriptionEditorActive)",
      "const canSaveAs ="
    ]) {
      expect(app).toContain(gate);
    }
  });

  it("closes the image tab with the deleted file and with the project", () => {
    const deleted = app.slice(
      app.indexOf("function handleFileExplorerEntriesDeleted(")
    );
    expect(deleted).toContain('openDocument.editor.kind === "projectImage"');
    expect(readFileSync("src/renderer/openDocuments.ts", "utf8")).toContain(
      'editor.kind === "projectImage" ||'
    );
  });
});
