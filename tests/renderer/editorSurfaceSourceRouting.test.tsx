// @vitest-environment happy-dom
//
// #573 Slice 2: EditorSurface routes a Markdown editor through
// MarkdownSurfaceSource (unchanged editor + preview behavior).
// #573 Slice 3: a glossary Description tab renders the same editor + preview
// stack over its in-memory draft.
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
  updateGlossaryDescriptionEditorText,
  type CurrentEditor
} from "../../src/renderer/currentEditor";
import type { LineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import type { MarkdownEditorParagraphIndentController } from "../../src/renderer/MarkdownEditor";
import { captureEditorViewState } from "../../src/renderer/editorViewState";
import { MERMAID_BLOCK_CLASS } from "../../src/renderer/preview/mermaidPreviewPlaceholder";
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

const glossaryDescription = [
  "# 人物",
  "",
  "> [!NOTE]",
  "> 注記",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "$E = mc^2$",
  "",
  "```mermaid",
  "graph TD",
  "  A --> B",
  "```",
  "",
  "![図](images/a.png)"
].join("\n");

const glossaryEntry: GlossaryEntry = {
  id: entryId,
  description: glossaryDescription,
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

type SurfaceProps = React.ComponentProps<typeof EditorSurface>;

function props(
  editor: CurrentEditor,
  documentKey: string,
  overrides: Partial<SurfaceProps> = {}
): SurfaceProps {
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
    onViewportChanged: noop,
    ...overrides
  } as SurfaceProps;
}

function mount(
  editor: CurrentEditor,
  documentKey: string,
  overrides: Partial<SurfaceProps> = {}
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);

  act(() => {
    root.render(<EditorSurface {...props(editor, documentKey, overrides)} />);
  });

  function view(): EditorView | null {
    const cmContent = container.querySelector<HTMLElement>(".cm-content");
    return cmContent ? EditorView.findFromDOM(cmContent) : null;
  }

  return {
    container,
    rerender(
      nextEditor: CurrentEditor,
      nextKey: string,
      nextOverrides: Partial<SurfaceProps> = overrides
    ) {
      act(() => {
        root.render(
          <EditorSurface {...props(nextEditor, nextKey, nextOverrides)} />
        );
      });
    },
    view,
    editorText(): string | null {
      return view()?.state.doc.toString() ?? null;
    },
    previewHtml(): string {
      return container.querySelector("article.preview")?.innerHTML ?? "";
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

  it("renders a glossary Description tab as editor + preview", () => {
    const surface = mount(
      createGlossaryDescriptionCurrentEditor(glossaryEntry),
      "glossary"
    );

    expect(surface.editorText()).toBe(glossaryDescription);
    // #573 Slice 4: the Slice 3 "not saved yet" notice is gone.
    expect(
      surface.container.querySelector(".glossaryDescriptionTabNotice")
    ).toBeNull();

    const html = surface.previewHtml();
    expect(html).toContain("markdown-callout-note");
    expect(html).toContain("hljs language-ts");
    expect(html).toContain('class="katex"');
    expect(html).toContain(MERMAID_BLOCK_CLASS);
    // Project-root image resolution, like the Glossary Entry Editor Pane.
    expect(
      surface.container.querySelector("article.preview img")?.getAttribute("src")
    ).toBe("pergamum-asset://project/images/a.png");
  });

  it("previews glossary Description as Markdown regardless of the selected renderer", () => {
    const surface = mount(
      createGlossaryDescriptionCurrentEditor(glossaryEntry),
      "glossary",
      { previewRenderer: "aozoraVertical" }
    );

    expect(
      surface.container.querySelector("article.preview h1")?.textContent
    ).toBe("人物");
  });

  it("reports edits and re-renders the preview from the updated draft", async () => {
    const changes: { text: string; breaks: LineEndingBreakSet }[] = [];
    const overrides: Partial<SurfaceProps> = {
      onChangeMarkdownContent: (text, breaks) => {
        changes.push({ text, breaks });
      }
    };
    const editor = createGlossaryDescriptionCurrentEditor({
      ...glossaryEntry,
      description: "旧"
    });
    const surface = mount(editor, "glossary", overrides);

    act(() => {
      surface.view()!.dispatch({
        changes: { from: 0, to: 1, insert: "## 新しい見出し" }
      });
    });

    expect(changes.at(-1)?.text).toBe("## 新しい見出し");

    const updated = updateGlossaryDescriptionEditorText(
      editor,
      changes.at(-1)!.text,
      changes.at(-1)!.breaks
    );
    surface.rerender(updated, "glossary");
    // The preview trails the editor by a (0 ms here) debounce timer.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      surface.container.querySelector("article.preview h2")?.textContent
    ).toBe("新しい見出し");
  });

  it("hands the toolbar controller to the glossary Description editor, not the previous document", () => {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    const changes: string[] = [];
    const overrides: Partial<SurfaceProps> = {
      onParagraphIndentControllerChange: (next) => {
        controller = next;
      },
      onChangeMarkdownContent: (text) => {
        changes.push(text);
      }
    };
    const surface = mount(projectEditor("a.md", "本文"), "a", overrides);

    surface.rerender(
      createGlossaryDescriptionCurrentEditor({
        ...glossaryEntry,
        description: "語"
      }),
      "glossary"
    );

    act(() => {
      surface.view()!.dispatch({ selection: { anchor: 0, head: 1 } });
    });
    act(() => {
      controller!.applyInlineMarkup("**");
    });

    expect(surface.editorText()).toBe("**語**");
    expect(changes.at(-1)).toBe("**語**");

    act(() => {
      controller!.insertCallout("warning");
    });

    expect(changes.at(-1)).toContain("> [!WARNING]");
  });

  it("shows the metadata panel above the editor only for a glossary tab", () => {
    const onUpdateDraft = vi.fn();
    const overrides: Partial<SurfaceProps> = {
      glossaryDescriptionMetadata: {
        availableTags: [],
        onUpdateDraft,
        onOpenTagManager: vi.fn()
      }
    };
    const surface = mount(
      createGlossaryDescriptionCurrentEditor(glossaryEntry),
      "glossary",
      overrides
    );
    const panel = surface.container.querySelector(
      ".glossaryDescriptionMetadataPanel"
    );

    expect(panel).not.toBeNull();
    // Above (before) the editor / preview workspace.
    expect(panel?.nextElementSibling?.classList.contains("workspace")).toBe(
      true
    );

    act(() => {
      surface.container
        .querySelector<HTMLButtonElement>(".glossaryDescriptionMetadataToggle")!
        .click();
    });
    act(() => {
      surface.container
        .querySelector<HTMLButtonElement>(".glossaryEditorAddAtom")!
        .click();
    });
    expect(onUpdateDraft).toHaveBeenCalledWith(entryId, expect.any(Function));

    surface.rerender(projectEditor("a.md", "本文"), "a", overrides);
    expect(
      surface.container.querySelector(".glossaryDescriptionMetadataPanel")
    ).toBeNull();
  });

  it("#574: restores a glossary tab's View State when its Description is unchanged, ignores it when stale", () => {
    const description = "一行目\n二行目\n三行目";
    const source = mount(
      createGlossaryDescriptionCurrentEditor({ ...glossaryEntry, description }),
      "glossary-source"
    );
    act(() => {
      source.view()!.dispatch({ selection: { anchor: 4, head: 7 } });
    });
    const captured = captureEditorViewState(source.view()!);

    const applied = vi.fn();
    const restored = mount(
      createGlossaryDescriptionCurrentEditor({ ...glossaryEntry, description }),
      "glossary-restored",
      {
        restoreActiveEditorViewState: {
          key: "glossary-restored",
          viewState: captured
        },
        onRestoreActiveEditorViewStateApplied: applied
      }
    );
    const selection = restored.view()!.state.selection.main;

    expect([selection.anchor, selection.head]).toEqual([4, 7]);
    expect(applied).toHaveBeenCalledWith("glossary-restored");

    // The entry's Description changed since the snapshot: tab restores, the
    // stale View State is not applied.
    const stale = mount(
      createGlossaryDescriptionCurrentEditor({
        ...glossaryEntry,
        description: "別の説明に変わった"
      }),
      "glossary-stale",
      {
        restoreActiveEditorViewState: {
          key: "glossary-stale",
          viewState: captured
        }
      }
    );
    const staleSelection = stale.view()!.state.selection.main;

    expect(stale.editorText()).toBe("別の説明に変わった");
    expect([staleSelection.anchor, staleSelection.head]).toEqual([0, 0]);
  });

  it("switches between a glossary Description tab and a document tab", () => {
    const surface = mount(
      createGlossaryDescriptionCurrentEditor(glossaryEntry),
      "glossary"
    );

    surface.rerender(projectEditor("a.md", "戻った"), "a");

    expect(surface.editorText()).toBe("戻った");
    expect(
      surface.container.querySelector(".glossaryDescriptionTabNotice")
    ).toBeNull();
  });
});
