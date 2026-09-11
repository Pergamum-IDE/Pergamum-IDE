// @vitest-environment happy-dom
/**
 * #436 Slice 12 remediation — reproduces the exact review blocker and proves
 * the fix: the Ctrl+G keydown handler must be ATTACHED only to the one
 * `MarkdownEditor` instance the shortcut belongs to (EditorSurface's
 * document editor), never to an auxiliary instance such as GlossaryEditor's
 * own description-field editor — even while the module-level
 * current-config slot holds a DIFFERENT instance's published config, which is
 * exactly the situation while both are mounted at once (see
 * glossarySelectionShortcutExtension.ts's remediation note).
 *
 * This exercises the real `createMarkdownEditorDocumentState` +
 * `EditorView` wiring end to end (unlike
 * glossarySelectionShortcutExtension.test.ts, which isolates the keymap
 * extension from that wiring via an explicit `getConfig` override) — so it
 * would have failed against the pre-remediation code, where the extension
 * was unconditionally included in every document's `EditorState`.
 */
import { Compartment, EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";
import {
  publishCurrentGlossarySelectionShortcutConfig,
  unpublishCurrentGlossarySelectionShortcutConfig,
  type MarkdownEditorGlossarySelectionShortcutConfig
} from "../../src/renderer/glossarySelectionShortcutExtension";

function ref<T>(value: T): { current: T } {
  return { current: value };
}

function baseOptions(glossarySelectionShortcutEnabled: boolean) {
  return {
    doc: "the quick brown fox",
    initialLineEndingBreaks: [],
    undoHistoryMinDepth: 100,
    newFileLineEndingFallbackRef: ref<"lf" | "crlf" | "cr">("lf"),
    readOnlyCompartment: new Compartment(),
    readOnlyRef: ref(false),
    visibilityCompartment: new Compartment(),
    markerGlyph: "⏎" as const,
    expectedLineEndingRef: ref<"lf" | "crlf" | "cr">("lf"),
    markerGlyphRef: ref("⏎" as const),
    whitespaceCompartment: new Compartment(),
    whitespaceSettingsRef: ref({
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    }),
    selectionHighlightCompartment: new Compartment(),
    selectionHighlightModeRef: ref("default" as const),
    findGutterMarkerCompartment: new Compartment(),
    findGutterMarkersRef: ref(false),
    glossaryCompletionRef: ref(null),
    glossarySelectionShortcutEnabled,
    createUpdateListenerExtension: () => []
  };
}

function ctrlG(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "g",
    code: "KeyG",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true
  });
}

describe("Ctrl+G per-instance gate (#436 Slice 12 remediation)", () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
  });

  it("blocker repro: an editor built with glossarySelectionShortcutEnabled:false stays inert even while ANOTHER instance's config is the currently-published one", () => {
    const requestOpen = vi.fn();
    const config: MarkdownEditorGlossarySelectionShortcutConfig = { requestOpen };
    // Simulates the real app: the main document editor has published its
    // config into the module-level slot, then the user focuses the Glossary
    // description field (a DIFFERENT MarkdownEditor instance) and presses
    // Ctrl+G there.
    publishCurrentGlossarySelectionShortcutConfig(config);
    try {
      const { state } = createMarkdownEditorDocumentState(baseOptions(false));
      view = new EditorView({ parent: document.body, state });
      view.dispatch({ selection: EditorSelection.single(4, 9) });

      const event = ctrlG();
      view.contentDOM.dispatchEvent(event);

      expect(requestOpen).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      unpublishCurrentGlossarySelectionShortcutConfig(config);
    }
  });

  it("main editor regression: an editor built with glossarySelectionShortcutEnabled:true still fires Ctrl+G with its own selection", () => {
    const requestOpen = vi.fn();
    const config: MarkdownEditorGlossarySelectionShortcutConfig = { requestOpen };
    publishCurrentGlossarySelectionShortcutConfig(config);
    try {
      const { state } = createMarkdownEditorDocumentState(baseOptions(true));
      view = new EditorView({ parent: document.body, state });
      view.dispatch({ selection: EditorSelection.single(4, 9) });

      const event = ctrlG();
      view.contentDOM.dispatchEvent(event);

      expect(requestOpen).toHaveBeenCalledWith("quick");
      expect(event.defaultPrevented).toBe(true);
    } finally {
      unpublishCurrentGlossarySelectionShortcutConfig(config);
    }
  });

  it("omitting glossarySelectionShortcutEnabled entirely defaults to disabled (fail-safe default)", () => {
    const requestOpen = vi.fn();
    const config: MarkdownEditorGlossarySelectionShortcutConfig = { requestOpen };
    publishCurrentGlossarySelectionShortcutConfig(config);
    try {
      const { glossarySelectionShortcutEnabled: _omitted, ...optionsWithoutFlag } =
        baseOptions(false);
      const { state } = createMarkdownEditorDocumentState(optionsWithoutFlag);
      view = new EditorView({ parent: document.body, state });

      const event = ctrlG();
      view.contentDOM.dispatchEvent(event);

      expect(requestOpen).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      unpublishCurrentGlossarySelectionShortcutConfig(config);
    }
  });
});
