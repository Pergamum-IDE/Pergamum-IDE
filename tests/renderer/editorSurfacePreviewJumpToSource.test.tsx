// @vitest-environment happy-dom
//
// #504 Preview double-click jump-to-source — real end-to-end behavior tests.
//
// These mount the actual EditorSurface component tree (real CodeMirror
// EditorView + real markdown-it-rendered `article.preview` DOM), dispatch
// real `dblclick` MouseEvents on preview elements, and assert on the real
// CodeMirror selection / real window.getSelection() state. This is
// deliberately NOT source-text matching — see
// tests/renderer/previewJumpToSource.test.ts for the pure-function unit
// tests of the resolution/clamping logic in isolation.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";

// A single document exercising every block kind decision D6/#issue tests 1-5
// need: heading, plain paragraph, a loose (two-paragraph) list item, a fenced
// code block, a link, and an image. Verified once against the real
// markdownPreviewRenderer output (see the exact `data-source-line` values in
// each test) so the expectations below are not guessed:
//
//  1 "# Heading"                          -> h1                    line 1
//  2 ""
//  3 "Paragraph one."                     -> p                     line 3
//  4 ""
//  5 "- Item one"                         -> li/p("Item one")      line 5
//  6 ""
//  7 "  continuation paragraph"           -> p (nested in li@5)    line 7
//  8 ""
//  9 "- Item two"                         -> li/p("Item two")      line 9
// 10 ""
// 11 "```js"                              -> code (in <pre>)       line 11
// 12 "code here"
// 13 "```"
// 14 ""
// 15 "[link text](https://example.com)"   -> p (a has no own line) line 15
// 16 ""
// 17 "![alt text](image.png)"             -> p (img has no own line) line 17
const DOC_CONTENT = [
  "# Heading",
  "",
  "Paragraph one.",
  "",
  "- Item one",
  "",
  "  continuation paragraph",
  "",
  "- Item two",
  "",
  "```js",
  "code here",
  "```",
  "",
  "[link text](https://example.com)",
  "",
  "![alt text](image.png)"
].join("\n");
const DOC_CONTENT_LINE_COUNT = 17;

type PreviewScrollSyncLogInput = {
  level: string;
  event: string;
  details?: Record<string, unknown>;
};

interface MountedSurface {
  container: HTMLDivElement;
  events: PreviewScrollSyncLogInput[];
  view: () => EditorView;
  preview: () => HTMLElement;
  unmount: () => void;
}

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

function baseProps(
  content: string,
  documentKey: string
): React.ComponentProps<typeof EditorSurface> {
  const doc = {
    ...createUntitledDocument(() => documentKey),
    content,
    savedContent: content
  };
  const noop = () => undefined;

  return {
    editor: createMarkdownCurrentEditor(doc),
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

function mount(
  content: string,
  documentKey: string,
  overrides: Partial<React.ComponentProps<typeof EditorSurface>> = {}
): MountedSurface {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);

  const events: PreviewScrollSyncLogInput[] = [];
  const props: React.ComponentProps<typeof EditorSurface> = {
    ...baseProps(content, documentKey),
    onPreviewScrollSyncEvent: (input) => events.push(input),
    ...overrides
  };

  act(() => {
    root.render(<EditorSurface {...props} />);
  });

  return {
    container,
    events,
    view: () => {
      const cmContent = container.querySelector<HTMLElement>(".cm-content");
      const view = cmContent ? EditorView.findFromDOM(cmContent) : null;
      if (!view) {
        throw new Error("expected a mounted CodeMirror EditorView");
      }
      return view;
    },
    preview: () => {
      const el = container.querySelector<HTMLElement>("article.preview");
      if (!el) {
        throw new Error("expected a mounted article.preview container");
      }
      return el;
    },
    unmount: () => {
      act(() => root.unmount());
      containers = containers.filter((c) => c !== container);
      roots = roots.filter((r) => r !== root);
    }
  };
}

/** Dispatches a real, bubbling dblclick and returns whether it was NOT cancelled. */
function dblclick(target: Element, init: MouseEventInit = {}): boolean {
  const event = new MouseEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    detail: 2,
    ...init
  });
  let notCancelled = true;
  act(() => {
    notCancelled = target.dispatchEvent(event);
  });
  return notCancelled;
}

function requireEl<T extends Element>(el: T | null): T {
  if (!el) {
    throw new Error("expected element to exist");
  }
  return el;
}

describe("EditorSurface preview double-click jump-to-source (#504)", () => {
  it("jumps from a paragraph to a collapsed cursor at the start of its source line, without cancelling the event", () => {
    const surface = mount(DOC_CONTENT, "doc-paragraph");
    const p = requireEl(surface.preview().querySelector('p[data-source-line="3"]'));

    const notCancelled = dblclick(p);

    const selection = surface.view().state.selection.main;
    expect(selection.empty).toBe(true);
    expect(selection.head).toBe(surface.view().state.doc.line(3).from);
    expect(notCancelled).toBe(true);
    expect(surface.events.at(-1)).toMatchObject({
      details: {
        previewJumpToSourceResult: "jumped",
        previewJumpToSourceLine: 3,
        previewJumpToSourceTargetLine: 3,
        previewJumpToSourceClamped: false,
        previewJumpToSourceDocLineCount: DOC_CONTENT_LINE_COUNT
      }
    });
  });

  it("jumps from a heading to its source line", () => {
    const surface = mount(DOC_CONTENT, "doc-heading");
    const h1 = requireEl(surface.preview().querySelector("h1"));

    dblclick(h1);

    expect(surface.view().state.selection.main.head).toBe(
      surface.view().state.doc.line(1).from
    );
  });

  it("jumps from a list item itself (not its nested paragraph) to the list item's own source line", () => {
    const surface = mount(DOC_CONTENT, "doc-listitem");
    const secondListItem = requireEl(
      surface.preview().querySelectorAll("li")[1]
    );
    expect(secondListItem.getAttribute("data-source-line")).toBe("9");

    dblclick(secondListItem);

    expect(surface.view().state.selection.main.head).toBe(
      surface.view().state.doc.line(9).from
    );
  });

  it("uses the innermost [data-source-line] ancestor: a <p> nested in an <li> jumps to the <p>'s own line, not the <li>'s", () => {
    const surface = mount(DOC_CONTENT, "doc-nested");
    // The first <li> (data-source-line="5") contains two paragraphs; the
    // second one ("continuation paragraph") is genuinely on a different
    // source line (7) than its own <li>.
    const continuationParagraph = requireEl(
      surface.preview().querySelector('p[data-source-line="7"]')
    );
    const enclosingListItem = continuationParagraph.closest("li")!;
    expect(enclosingListItem.getAttribute("data-source-line")).toBe("5");

    dblclick(continuationParagraph);

    expect(surface.view().state.selection.main.head).toBe(
      surface.view().state.doc.line(7).from
    );
  });

  it("jumps from inside a fenced code block", () => {
    const surface = mount(DOC_CONTENT, "doc-code");
    const code = requireEl(surface.preview().querySelector("pre code"));
    expect(code.getAttribute("data-source-line")).toBe("11");

    dblclick(code);

    expect(surface.view().state.selection.main.head).toBe(
      surface.view().state.doc.line(11).from
    );
  });

  it("does nothing when double-clicking the preview container itself (no [data-source-line] ancestor)", () => {
    const surface = mount(DOC_CONTENT, "doc-no-anchor");
    const initialHead = surface.view().state.selection.main.head;

    dblclick(surface.preview());

    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "noSourceLine" }
    });
  });

  it("ignores a double-click on a real rendered <a>, even though its ancestor <p> has a source line", () => {
    const surface = mount(DOC_CONTENT, "doc-ignore-a");
    const link = requireEl(surface.preview().querySelector("a"));
    expect(link.closest("[data-source-line]")?.getAttribute("data-source-line")).toBe(
      "15"
    );
    const initialHead = surface.view().state.selection.main.head;

    dblclick(link);

    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "ignoredTarget" }
    });
  });

  it("ignores a double-click on a real rendered <img>, even though its ancestor <p> has a source line", () => {
    const surface = mount(DOC_CONTENT, "doc-ignore-img");
    const img = requireEl(surface.preview().querySelector("img"));
    expect(img.closest("[data-source-line]")?.getAttribute("data-source-line")).toBe(
      "17"
    );
    const initialHead = surface.view().state.selection.main.head;

    dblclick(img);

    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "ignoredTarget" }
    });
  });

  it("ignores a double-click on a <button> nested inside a source-lined block", () => {
    // markdown-it is configured with `html: false` (see
    // markdownPreviewRenderer.ts), so raw HTML in the Markdown source is
    // escaped rather than rendered as real elements — there is no way to get
    // a genuine <button> out of the real renderer. This inserts one directly
    // into the REAL mounted preview DOM to exercise the real delegated
    // listener + resolvePreviewJumpTarget against a real <button> element,
    // which is the part #504 actually needs to prove.
    const surface = mount(DOC_CONTENT, "doc-ignore-button");
    const paragraph = requireEl(
      surface.preview().querySelector('p[data-source-line="3"]')
    );
    const button = document.createElement("button");
    button.textContent = "action";
    paragraph.appendChild(button);
    const initialHead = surface.view().state.selection.main.head;

    dblclick(button);

    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "ignoredTarget" }
    });
  });

  it("clamps to the editor's actual (shrunk) last line when the preview is stale relative to a live edit", () => {
    const surface = mount(DOC_CONTENT, "doc-clamp");
    // Simulate the preview lagging behind the debounced render pipeline: the
    // live CodeMirror document is edited directly (bypassing the React
    // `value` prop, exactly as a real keystroke would via the editor's own
    // dispatch), while the preview DOM is left showing the OLD, longer
    // content — including the line-17 image block clicked below.
    act(() => {
      surface.view().dispatch({
        changes: {
          from: 0,
          to: surface.view().state.doc.length,
          insert: "one\ntwo\nthree\nfour\nfive"
        }
      });
    });
    expect(surface.view().state.doc.lines).toBe(5);
    const staleImageParagraph = requireEl(
      surface.preview().querySelector('p[data-source-line="17"]')
    );

    dblclick(staleImageParagraph);

    expect(surface.view().state.selection.main.head).toBe(
      surface.view().state.doc.line(5).from
    );
    expect(surface.events.at(-1)).toMatchObject({
      details: {
        previewJumpToSourceResult: "jumped",
        previewJumpToSourceLine: 17,
        previewJumpToSourceTargetLine: 5,
        previewJumpToSourceClamped: true,
        previewJumpToSourceDocLineCount: 5
      }
    });
  });

  it("does nothing for a NaN or zero data-source-line", () => {
    const surface = mount(DOC_CONTENT, "doc-invalid-line");
    const paragraph = requireEl(
      surface.preview().querySelector('p[data-source-line="3"]')
    );
    const initialHead = surface.view().state.selection.main.head;

    paragraph.setAttribute("data-source-line", "not-a-number");
    dblclick(paragraph);
    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "invalidLine" }
    });

    paragraph.setAttribute("data-source-line", "0");
    dblclick(paragraph);
    expect(surface.view().state.selection.main.head).toBe(initialHead);
    expect(surface.events.at(-1)).toMatchObject({
      details: { previewJumpToSourceResult: "invalidLine" }
    });
  });

  it("clears the preview's own text selection after a successful jump", () => {
    const surface = mount(DOC_CONTENT, "doc-clear-selection");
    const paragraph = requireEl(
      surface.preview().querySelector('p[data-source-line="3"]')
    );
    const range = document.createRange();
    range.selectNodeContents(paragraph.firstChild!);
    const domSelection = window.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);
    expect(domSelection.rangeCount).toBe(1);

    dblclick(paragraph);

    // Not a global `rangeCount === 0` check: D3 requires focusing the editor
    // after the jump, and CodeMirror legitimately places its own cursor
    // selection into the (single, document-wide) Selection object once
    // focused — so a range still exists afterward, just no longer anchored
    // in the preview. That relocation is what "clearing the preview's
    // selection" actually means here.
    expect(
      surface.preview().contains(window.getSelection()!.anchorNode)
    ).toBe(false);
  });

  it("does NOT clear the preview's text selection when the double-click target is ignored", () => {
    const surface = mount(DOC_CONTENT, "doc-keep-selection");
    const paragraph = requireEl(
      surface.preview().querySelector('p[data-source-line="3"]')
    );
    const range = document.createRange();
    range.selectNodeContents(paragraph.firstChild!);
    const domSelection = window.getSelection()!;
    domSelection.removeAllRanges();
    domSelection.addRange(range);

    const link = requireEl(surface.preview().querySelector("a"));
    dblclick(link);

    expect(domSelection.rangeCount).toBe(1);
  });

  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["shiftKey", { shiftKey: true }],
    ["altKey", { altKey: true }],
    ["metaKey", { metaKey: true }]
  ] as const)(
    "does nothing for a double-click with %s held (D4: only a plain double-click triggers the jump)",
    (_name, modifierInit) => {
      const surface = mount(DOC_CONTENT, "doc-modifier");
      const paragraph = requireEl(
        surface.preview().querySelector('p[data-source-line="3"]')
      );
      const initialHead = surface.view().state.selection.main.head;
      // Mounting itself emits unrelated preview.scrollSync.* diagnostics
      // (blockMap.built, wiring.initialized) — baseline against those rather
      // than assuming an empty array.
      const eventCountBeforeClick = surface.events.length;

      dblclick(paragraph, modifierInit);

      expect(surface.view().state.selection.main.head).toBe(initialHead);
      // The modifier gate runs before any resolution/logging — no NEW
      // diagnostic event at all, not even an "ignoredTarget"/"noEditor" one.
      expect(surface.events.length).toBe(eventCountBeforeClick);
    }
  );

  it("removes the delegated dblclick listener on unmount — a post-unmount dispatch does nothing", () => {
    const surface = mount(DOC_CONTENT, "doc-unmount");
    const preview = surface.preview();
    const paragraph = requireEl(preview.querySelector('p[data-source-line="3"]'));
    const eventCountBeforeUnmount = surface.events.length;

    surface.unmount();

    expect(() => dblclick(paragraph)).not.toThrow();
    expect(surface.events.length).toBe(eventCountBeforeUnmount);
  });

  it("targets only the editor bound to the previewed document — a jump in one EditorSurface never moves another's editor", () => {
    const surfaceA = mount(DOC_CONTENT, "doc-A");
    const surfaceB = mount(DOC_CONTENT, "doc-B");
    const bInitialHead = surfaceB.view().state.selection.main.head;

    const paragraphInA = requireEl(
      surfaceA.preview().querySelector('p[data-source-line="3"]')
    );
    dblclick(paragraphInA);

    expect(surfaceA.view().state.selection.main.head).toBe(
      surfaceA.view().state.doc.line(3).from
    );
    expect(surfaceB.view().state.selection.main.head).toBe(bInitialHead);
  });
});
