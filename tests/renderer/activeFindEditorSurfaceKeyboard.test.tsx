// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";
import { activeFindGutterMarkerField } from "../../src/renderer/find/activeFindGutterMarkerExtension";
import { resetActiveFindSession } from "../../src/renderer/find/activeFindSessionStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value"
)!.set!;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resetActiveFindSession();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetActiveFindSession();
  vi.restoreAllMocks();
});

function renderEditorSurface(
  overrides: Partial<React.ComponentProps<typeof EditorSurface>> = {}
) {
  const doc = createUntitledDocument(() => "untitled-1");
  const noop = () => undefined;
  const props: React.ComponentProps<typeof EditorSurface> = {
    editor: createMarkdownCurrentEditor(doc),
    activeDocumentKey: "untitled-1",
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
    onParagraphIndentControllerChange: noop,
    onViewStateControllerChange: noop,
    onViewStateSnapshot: noop,
    onViewStateDirty: noop,
    restoreActiveEditorViewState: null,
    onRestoreActiveEditorViewStateApplied: noop,
    markdownEditorFocusRequest: null,
    onMarkdownEditorFocusRequestApplied: noop,
    glossaryAvailableTags: [],
    onChangeGlossaryEntryDescription: noop,
    onAddGlossaryEntryAtom: noop,
    onChangeGlossaryEntryAtomValue: noop,
    onChangeGlossaryEntryAtomMatchFlags: noop,
    onDeleteGlossaryEntryAtom: noop,
    onReorderGlossaryEntryAtom: noop,
    onAssignGlossaryEntryTag: noop,
    onUnassignGlossaryEntryTag: noop,
    onReorderAssignedGlossaryEntryTag: noop,
    onOpenGlossaryTagManager: noop,
    onDeleteGlossaryEntry: noop,
    onNavigateToPreviousGlossaryOccurrence: noop,
    onNavigateToNextGlossaryOccurrence: noop,
    pendingMarkdownSelection: null,
    onPendingMarkdownSelectionApplied: noop,
    documentOpenId: null,
    onDocumentOpenPreviewRenderStarted: noop,
    onDocumentOpenPreviewRendered: noop,
    onDocumentOpenPreviewDomCommitted: noop,
    onDocumentOpenPreviewDecorationCompleted: noop,
    onDocumentOpenPreviewFrameObserved: noop,
    onViewportChanged: noop,
    documentMapSettings: defaultDocumentMapSettings(),
    ...overrides
  } as React.ComponentProps<typeof EditorSurface>;

  act(() => {
    root.render(<EditorSurface {...props} />);
  });
  return props;
}

const cmContent = () =>
  container.querySelector<HTMLElement>(".cm-content") as HTMLElement;
const queryInput = () =>
  container.querySelector<HTMLInputElement>(".activeFindPanelInput")!;
const findPanel = () => container.querySelector(".activeFindPanel");
const modeTabs = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(".activeFindPanelModeTab")
  );

function keydownOnEditor(
  init: KeyboardEventInit & { key: string }
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init
  });
  act(() => {
    cmContent().dispatchEvent(event);
  });
  return event;
}

function typeInto(element: HTMLInputElement, value: string): void {
  act(() => {
    nativeInputValueSetter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function editorView(): EditorView {
  const view = EditorView.findFromDOM(cmContent());

  if (!view) {
    throw new Error("Expected mounted CodeMirror EditorView.");
  }

  return view;
}

function findGutterMarkerCount(): number {
  return editorView().state.field(activeFindGutterMarkerField, false)?.size ?? 0;
}

function editorWithContent(content: string) {
  const doc = createUntitledDocument(() => "untitled-1");
  return createMarkdownCurrentEditor({
    ...doc,
    content,
    savedContent: content
  });
}

describe("EditorSurface — Ctrl+F / Ctrl+H open the active Find panel (#424 Slice 7 regression)", () => {
  it("renders a CodeMirror editor and no Find panel initially", () => {
    renderEditorSurface();
    expect(cmContent()).not.toBeNull();
    expect(findPanel()).toBeNull();
  });

  it("Ctrl+F from the editor body opens the panel in Search mode", () => {
    renderEditorSurface();
    const event = keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(findPanel()).not.toBeNull();
    const [searchTab, replaceTab] = modeTabs();
    expect(searchTab.getAttribute("aria-selected")).toBe("true");
    expect(replaceTab.getAttribute("aria-selected")).toBe("false");
  });

  it("Ctrl+H from the editor body opens the panel in Replace mode", () => {
    renderEditorSurface();
    keydownOnEditor({ key: "h", code: "KeyH", ctrlKey: true });
    expect(findPanel()).not.toBeNull();
    const [searchTab, replaceTab] = modeTabs();
    expect(replaceTab.getAttribute("aria-selected")).toBe("true");
    expect(searchTab.getAttribute("aria-selected")).toBe("false");
  });

  it("Mod+F (metaKey) also opens Search mode", () => {
    renderEditorSurface();
    keydownOnEditor({ key: "f", code: "KeyF", metaKey: true });
    expect(findPanel()).not.toBeNull();
    expect(modeTabs()[0].getAttribute("aria-selected")).toBe("true");
  });

  it("the panel STAYS open across follow-up renders (not closed by an effect)", () => {
    renderEditorSurface();
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(findPanel()).not.toBeNull();
    // force a re-render with a fresh (value-equal) prop object
    renderEditorSurface();
    expect(findPanel()).not.toBeNull();
  });

  it("does not open the native CodeMirror bottom search panel", () => {
    renderEditorSurface();
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(container.querySelector(".cm-search")).toBeNull();
    expect(container.querySelector(".cm-panel.cm-search")).toBeNull();
  });

  it("read-only editor still opens Search / Replace mode via Ctrl+F / Ctrl+H", () => {
    renderEditorSurface({ isProjectOwnedReadOnly: true });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(findPanel()).not.toBeNull();
    keydownOnEditor({ key: "h", code: "KeyH", ctrlKey: true });
    expect(modeTabs()[1].getAttribute("aria-selected")).toBe("true");
  });

  it("#425 findGutterMarkers=false suppresses Active Find gutter markers even when matches exist", () => {
    renderEditorSurface({
      editor: editorWithContent("foo foo\nfoo"),
      findGutterMarkers: false
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "foo");

    expect(editorView().state.field(activeFindGutterMarkerField, false)).toBe(
      undefined
    );
  });

  it("#425 findGutterMarkers=true shows one Active Find gutter marker per matched line", () => {
    renderEditorSurface({
      editor: editorWithContent("foo foo\nfoo"),
      findGutterMarkers: true
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "foo");

    expect(findGutterMarkerCount()).toBe(2);
  });

  it.each(["off", "default", "smart"] as const)(
    "#425 selectionHighlightMode=%s still allows independent Find gutter markers",
    (selectionHighlightMode) => {
      renderEditorSurface({
        editor: editorWithContent("foo foo\nfoo"),
        selectionHighlightMode,
        findGutterMarkers: true
      });
      keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
      typeInto(queryInput(), "foo");

      expect(findGutterMarkerCount()).toBe(2);
    }
  );
});

describe("#425 follow-up — Active Find: panel open/mode is surface-global, search state is per-documentKey", () => {
  const switchTab = (content: string, key: string) =>
    renderEditorSurface({
      editor: editorWithContent(content),
      activeDocumentKey: key
    });
  const queryInputs = () =>
    container.querySelectorAll<HTMLInputElement>(".activeFindPanelInput");

  it("keeps the panel OPEN across a tab switch, but the query is per document", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "QA");
    expect(findPanel()).not.toBeNull();

    // → B.md (never searched): panel stays open, query is empty
    switchTab("beta beta", "doc-b");
    expect(findPanel()).not.toBeNull();
    expect(queryInput().value).toBe("");

    typeInto(queryInput(), "beta");

    // ← A.md: its query is restored
    switchTab("alpha alpha alpha", "doc-a");
    expect(queryInput().value).toBe("QA");

    // → B.md again: its query is restored
    switchTab("beta beta", "doc-b");
    expect(queryInput().value).toBe("beta");
  });

  it("replaceText is per document; Replace mode is surface-global", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "h", code: "KeyH", ctrlKey: true });
    typeInto(queryInputs()[0], "alpha");
    typeInto(queryInputs()[1], "OMEGA_A");
    expect(modeTabs()[1].getAttribute("aria-selected")).toBe("true");

    switchTab("alpha", "doc-b");
    // Replace mode persisted (surface-global), replace text is B's (empty)
    expect(modeTabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(queryInputs()[1].value).toBe("");
    typeInto(queryInputs()[1], "OMEGA_B");

    switchTab("alpha alpha", "doc-a");
    expect(queryInputs()[0].value).toBe("alpha");
    expect(queryInputs()[1].value).toBe("OMEGA_A");

    switchTab("alpha", "doc-b");
    expect(queryInputs()[1].value).toBe("OMEGA_B");
  });

  it("a search option toggle is per document", () => {
    renderEditorSurface({
      editor: editorWithContent("Alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "alpha");
    const optionToggle = () =>
      container.querySelectorAll<HTMLButtonElement>(
        ".activeFindPanelOptions .searchOptionToggle"
      )[0];
    act(() => optionToggle().click());
    expect(optionToggle().getAttribute("aria-pressed")).toBe("true");

    switchTab("alpha Alpha", "doc-b");
    // B.md starts with the default (off)
    expect(optionToggle().getAttribute("aria-pressed")).toBe("false");

    switchTab("Alpha alpha", "doc-a");
    // A.md's toggle is restored
    expect(optionToggle().getAttribute("aria-pressed")).toBe("true");
  });

  it("an explicitly closed panel stays closed across a tab switch (but its per-doc query is kept)", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "kept");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(".activeFindPanelCloseButton")!
        .click()
    );
    expect(findPanel()).toBeNull();

    switchTab("alpha alpha", "doc-b");
    expect(findPanel()).toBeNull();

    // Re-open on A.md — the per-doc query survived the close.
    switchTab("alpha", "doc-a");
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(queryInput().value).toBe("kept");
  });

  it("Ctrl+F / Ctrl+H remain idempotent-open after a tab switch", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    switchTab("alpha alpha", "doc-b");

    for (let i = 0; i < 3; i += 1) {
      keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
      expect(findPanel()).not.toBeNull();
      expect(modeTabs()[0].getAttribute("aria-selected")).toBe("true");
    }
    keydownOnEditor({ key: "h", code: "KeyH", ctrlKey: true });
    expect(modeTabs()[1].getAttribute("aria-selected")).toBe("true");
  });

  it("match count recomputes for the new document and does not leak the old one's matches", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "alpha");
    const countA =
      container.querySelector(".activeFindPanelCount")?.textContent ?? "";
    expect(countA).toMatch(/\b3\b/);

    // doc-b starts with an empty query → no match count for the same string
    switchTab("alpha beta alpha", "doc-b");
    typeInto(queryInput(), "alpha");
    const countB =
      container.querySelector(".activeFindPanelCount")?.textContent ?? "";
    expect(countB).toMatch(/\b2\b/);
    expect(countB).not.toMatch(/\b3\b/);
  });

  it.each([
    { findGutterMarkers: false, selectionHighlightMode: "default" as const },
    { findGutterMarkers: true, selectionHighlightMode: "off" as const },
    { findGutterMarkers: true, selectionHighlightMode: "smart" as const }
  ])(
    "per-doc query + open/mode persistence hold with %o",
    ({ findGutterMarkers, selectionHighlightMode }) => {
      renderEditorSurface({
        editor: editorWithContent("foo foo\nfoo"),
        activeDocumentKey: "doc-a",
        findGutterMarkers,
        selectionHighlightMode
      });
      keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
      typeInto(queryInput(), "foo");

      renderEditorSurface({
        editor: editorWithContent("bar\nbar bar"),
        activeDocumentKey: "doc-b",
        findGutterMarkers,
        selectionHighlightMode
      });
      expect(findPanel()).not.toBeNull();
      expect(queryInput().value).toBe("");
      if (findGutterMarkers) {
        // doc-a's "foo" markers must not leak into doc-b
        expect(findGutterMarkerCount()).toBe(0);
        typeInto(queryInput(), "bar");
        expect(findGutterMarkerCount()).toBe(2);
      }

      renderEditorSurface({
        editor: editorWithContent("foo foo\nfoo"),
        activeDocumentKey: "doc-a",
        findGutterMarkers,
        selectionHighlightMode
      });
      expect(queryInput().value).toBe("foo");
    }
  );
});

describe("#425 follow-up — Active Find session survives a Settings-tab round trip (EditorSurface unmount)", () => {
  // Going to App Settings / Project Settings replaces <EditorSurface> with the
  // settings panel — the whole component unmounts. Coming back mounts a FRESH
  // instance, which must restore the session from the process-lived store.
  const goToSettings = () =>
    act(() => {
      root.render(<div data-testid="settings-tab" />);
    });

  it("restores an open Find panel + query after returning from Settings", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    typeInto(queryInput(), "alpha");
    expect(findPanel()).not.toBeNull();

    goToSettings();
    expect(findPanel()).toBeNull();

    renderEditorSurface({
      editor: editorWithContent("alpha beta alpha"),
      activeDocumentKey: "doc-a"
    });

    expect(findPanel()).not.toBeNull();
    expect(queryInput().value).toBe("alpha");
  });

  it("restores Replace mode + replace text after returning from Settings", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "h", code: "KeyH", ctrlKey: true });
    typeInto(queryInput(), "alpha");
    typeInto(
      container.querySelectorAll<HTMLInputElement>(".activeFindPanelInput")[1],
      "OMEGA"
    );

    goToSettings();
    renderEditorSurface({
      editor: editorWithContent("alpha"),
      activeDocumentKey: "doc-a"
    });

    expect(modeTabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelectorAll<HTMLInputElement>(".activeFindPanelInput")[1]
        .value
    ).toBe("OMEGA");
  });

  it("keeps an explicitly closed panel closed after a Settings round trip", () => {
    renderEditorSurface({
      editor: editorWithContent("alpha"),
      activeDocumentKey: "doc-a"
    });
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(".activeFindPanelCloseButton")!
        .click()
    );
    expect(findPanel()).toBeNull();

    goToSettings();
    renderEditorSurface({
      editor: editorWithContent("alpha alpha"),
      activeDocumentKey: "doc-a"
    });
    expect(findPanel()).toBeNull();

    // …and Ctrl+F on the FRESH surface still opens it (no stale binding).
    keydownOnEditor({ key: "f", code: "KeyF", ctrlKey: true });
    expect(findPanel()).not.toBeNull();
  });
});
