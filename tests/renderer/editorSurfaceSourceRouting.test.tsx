// @vitest-environment happy-dom
//
// #573 Slice 2: EditorSurface routes a Markdown editor through
// MarkdownSurfaceSource (unchanged editor + preview behavior) and still
// renders the Slice 1 placeholder for a glossary Description tab.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import {
  createGlossaryDescriptionCurrentEditor,
  createMarkdownCurrentEditor,
  type CurrentEditor
} from "../../src/renderer/currentEditor";
import { createProjectDocument } from "../../src/renderer/currentDocument";

let containers: HTMLDivElement[] = [];
let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  containers = [];
  roots = [];
  vi.restoreAllMocks();
});

const entryId = "0190b6a1-1c2d-7e3f-8a4b-5c6d7e8f9a0b";

const glossaryEntry: GlossaryEntry = {
  id: entryId,
  description: "説明",
  atoms: [
    {
      id: "0190b6a1-1c2d-7e3f-8a4b-000000000001",
      entryId,
      sortOrder: 0,
      value: "アリス",
      matchFlags: 0,
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z"
    }
  ],
  tags: [],
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z"
};

function projectEditor(relativePath: string, content: string): CurrentEditor {
  return createMarkdownCurrentEditor(
    createProjectDocument(
      { relativePath, name: relativePath.split("/").pop() ?? relativePath },
      content
    )
  );
}

function props(
  editor: CurrentEditor,
  documentKey: string
): React.ComponentProps<typeof EditorSurface> {
  const noop = () => undefined;

  return {
    editor,
    isDebugModeEnabled: false,
    isSyncScrollEditorToPreviewEnabled: false,
    isSyncScrollPreviewToEditorEnabled: false,
    isDoubleClickJumpToEditorEnabled: false,
    activeDocumentKey: documentKey,
    previewUpdateDelayMs: 0,
    newFileLineEndingFallback: "lf",
    expectedLineEnding: "lf",
    markerGlyph: "none",
    undoHistoryMinDepth: 100,
    selectionHighlightMode: "default",
    findGutterMarkers: false,
    whitespaceSettings: {
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    },
    normalizeUnicodeToNfcMatching: false,
    glossaryNearbySearchSettings: {
      unit: "paragraphs",
      characterDistance: 500,
      paragraphDistance: 2
    },
    projectRootPath: null,
    glossaryRefreshToken: 0,
    translate: (key, values) => t("ja", key, values),
    soundFeedback: { play: vi.fn() } as never,
    soundSettings: {
      enabled: false,
      dialog: { enabled: false },
      newline: { enabled: false },
      keypress: { enabled: false }
    },
    isProjectOwnedReadOnly: false,
    markdownEditorPreviewRatio: 0.5,
    onChangeMarkdownEditorPreviewRatio: noop,
    previewVisible: true,
    onChangeMarkdownContent: noop,
    onGlossarySelectionShortcut: noop,
    onParagraphIndentControllerChange: noop,
    onViewStateControllerChange: noop,
    onViewStateSnapshot: noop,
    onViewStateDirty: noop,
    restoreActiveEditorViewState: null,
    onRestoreActiveEditorViewStateApplied: noop,
    markdownEditorFocusRequest: null,
    onMarkdownEditorFocusRequestApplied: noop,
    pendingMarkdownSelection: null,
    onPendingMarkdownSelectionApplied: noop,
    documentOpenId: null,
    onDocumentOpenPreviewRenderStarted: noop,
    onDocumentOpenPreviewRendered: noop,
    onDocumentOpenPreviewDomCommitted: noop,
    onDocumentOpenPreviewDecorationCompleted: noop,
    onDocumentOpenPreviewFrameObserved: noop,
    onViewportChanged: noop
  } as React.ComponentProps<typeof EditorSurface>;
}

function mount(editor: CurrentEditor, documentKey: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);

  act(() => {
    root.render(<EditorSurface {...props(editor, documentKey)} />);
  });

  return {
    container,
    rerender(nextEditor: CurrentEditor, nextKey: string) {
      act(() => {
        root.render(<EditorSurface {...props(nextEditor, nextKey)} />);
      });
    },
    editorText(): string | null {
      const cmContent = container.querySelector<HTMLElement>(".cm-content");
      const view = cmContent ? EditorView.findFromDOM(cmContent) : null;
      return view ? view.state.doc.toString() : null;
    }
  };
}

describe("EditorSurface source routing (#573 Slice 2)", () => {
  it("renders a project Markdown document in the editor and preview", () => {
    const surface = mount(projectEditor("chapters/01.md", "# 見出し\n本文"), "md");

    expect(surface.editorText()).toBe("# 見出し\n本文");
    expect(
      surface.container.querySelector("article.preview h1")?.textContent
    ).toBe("見出し");
    expect(surface.container.querySelector(".glossaryDescriptionTab")).toBeNull();
  });

  it("resolves project-local preview images against the document folder", () => {
    const surface = mount(
      projectEditor("chapters/01.md", "![図](images/a.png)"),
      "md-image"
    );
    const src = surface.container
      .querySelector("article.preview img")
      ?.getAttribute("src");

    expect(src).toBe("pergamum-asset://project/chapters/images/a.png");
  });

  it("renders a .txt project document in the editor", () => {
    const surface = mount(projectEditor("notes/todo.txt", "メモ"), "txt");

    expect(surface.editorText()).toBe("メモ");
  });

  it("renders the placeholder (no editor) for a glossary Description tab", () => {
    const surface = mount(
      createGlossaryDescriptionCurrentEditor(glossaryEntry),
      "glossary"
    );

    expect(surface.editorText()).toBeNull();
    expect(
      surface.container.querySelector(".glossaryDescriptionTabSurface")
        ?.textContent
    ).toBe("アリス");

    surface.rerender(projectEditor("a.md", "戻った"), "a");

    expect(surface.editorText()).toBe("戻った");
    expect(surface.container.querySelector(".glossaryDescriptionTab")).toBeNull();
  });
});
