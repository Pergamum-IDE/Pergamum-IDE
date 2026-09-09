// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
});
