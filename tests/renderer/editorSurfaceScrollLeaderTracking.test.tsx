// @vitest-environment happy-dom
//
// #505 Phase 1 — real end-to-end behavior tests for STICKY input-based
// leader tracking and scroll event classification, wired into the actual
// EditorSurface component tree (real CodeMirror EditorView + real
// article.preview). Dispatches real DOM events and asserts on the actual
// `preview.scrollSync.leader.changed` / `preview.scrollSync.scrollEvent.
// classified` diagnostics captured via the real `onPreviewScrollSyncEvent`
// callback prop — not source-text matching.
//
// See tests/renderer/previewScrollLeaderTracker.test.ts for the pure
// tracker/classification/attribution unit tests, and
// tests/renderer/previewScrollSyncAnnotation.test.ts for the pure
// scrollIntoView-transaction-detection unit tests.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";
import { previewToEditorScrollSyncAnnotation } from "../../src/renderer/previewScrollSyncAnnotation";

const DOC_CONTENT = [
  "# Heading",
  "",
  "Paragraph one.",
  "",
  "Paragraph two."
].join("\n");

type PreviewScrollSyncLogInput = {
  level: string;
  event: string;
  details?: Record<string, unknown>;
};

interface MountedSurface {
  container: HTMLDivElement;
  events: PreviewScrollSyncLogInput[];
  view: () => EditorView;
  editorScroller: () => HTMLElement;
  preview: () => HTMLElement;
  rerender: (
    overrides: Partial<React.ComponentProps<typeof EditorSurface>>
  ) => void;
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
  documentKey: string,
  isDebugModeEnabled: boolean
): React.ComponentProps<typeof EditorSurface> {
  const doc = {
    ...createUntitledDocument(() => documentKey),
    content,
    savedContent: content
  };
  const noop = () => undefined;

  return {
    editor: createMarkdownCurrentEditor(doc),
    isDebugModeEnabled,
    isSyncScrollEditorToPreviewEnabled: true,
    isSyncScrollPreviewToEditorEnabled: true,
    isDoubleClickJumpToEditorEnabled: true,
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
  let currentProps: React.ComponentProps<typeof EditorSurface> = {
    ...baseProps(content, documentKey, overrides.isDebugModeEnabled ?? false),
    onPreviewScrollSyncEvent: (input) => events.push(input),
    ...overrides
  };

  act(() => {
    root.render(<EditorSurface {...currentProps} />);
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
    editorScroller: () => {
      const el = container.querySelector<HTMLElement>(".cm-scroller");
      if (!el) {
        throw new Error("expected a mounted .cm-scroller element");
      }
      return el;
    },
    preview: () => {
      const el = container.querySelector<HTMLElement>("article.preview");
      if (!el) {
        throw new Error("expected a mounted article.preview container");
      }
      return el;
    },
    rerender: (nextOverrides) => {
      currentProps = { ...currentProps, ...nextOverrides };
      act(() => {
        root.render(<EditorSurface {...currentProps} />);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      containers = containers.filter((c) => c !== container);
      roots = roots.filter((r) => r !== root);
    }
  };
}

function dispatch(target: EventTarget, event: Event): boolean {
  let notCancelled = true;
  act(() => {
    notCancelled = target.dispatchEvent(event);
  });
  return notCancelled;
}

async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

function wheelEvent(): Event {
  return new Event("wheel", { bubbles: true, cancelable: true });
}

function keydownEvent(key: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
}

function pointerdownEvent(): Event {
  return new Event("pointerdown", { bubbles: true, cancelable: true });
}

function touchstartEvent(): Event {
  return new Event("touchstart", { bubbles: true, cancelable: true });
}

function focusinEvent(): Event {
  return new Event("focusin", { bubbles: true, cancelable: true });
}

function scrollEvent(): Event {
  return new Event("scroll", { bubbles: false, cancelable: false });
}

function leaderChangedEvents(surface: MountedSurface) {
  return surface.events.filter(
    (e) => e.event === "preview.scrollSync.leader.changed"
  );
}

function classifiedEvents(surface: MountedSurface) {
  return surface.events.filter(
    (e) => e.event === "preview.scrollSync.scrollEvent.classified"
  );
}

describe("EditorSurface preview<->editor STICKY scroll leader tracking (#505 Phase 1)", () => {
  describe("leader.changed diagnostics — sticky acquisition", () => {
    it.each([
      ["wheel", wheelEvent] as const,
      ["pointerdown", pointerdownEvent] as const,
      ["touchstart", touchstartEvent] as const,
      ["focusin", focusinEvent] as const
    ])(
      "acquires editor leadership on a real %s event dispatched on the editor's scroller",
      (trigger, makeEvent) => {
        const surface = mount(DOC_CONTENT, `doc-editor-${trigger}`);
        // Editor is already the default leader — switch to preview first so
        // the editor input below is a genuine, observable transition.
        dispatch(surface.preview(), wheelEvent());

        dispatch(surface.editorScroller(), makeEvent());

        expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
          details: { previewScrollLeader: "editor", previewScrollLeaderTrigger: trigger }
        });
      }
    );

    it.each([
      ["wheel", wheelEvent] as const,
      ["pointerdown", pointerdownEvent] as const,
      ["touchstart", touchstartEvent] as const,
      ["focusin", focusinEvent] as const
    ])(
      "acquires preview leadership on a real %s event dispatched on the preview container",
      (trigger, makeEvent) => {
        const surface = mount(DOC_CONTENT, `doc-preview-${trigger}`);

        dispatch(surface.preview(), makeEvent());

        expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
          details: { previewScrollLeader: "preview", previewScrollLeaderTrigger: trigger }
        });
      }
    );

    it("persists across many scroll events with no new input (sticky — no expiry)", async () => {
      const surface = mount(DOC_CONTENT, "doc-persist", { isDebugModeEnabled: true });
      dispatch(surface.preview(), wheelEvent());
      expect(leaderChangedEvents(surface)).toHaveLength(1);

      for (let i = 0; i < 20; i += 1) {
        dispatch(surface.preview(), scrollEvent());
        await flushAnimationFrame();
      }

      // Still only the ONE leader.changed from the original wheel input —
      // none of those 20 scroll events caused (or needed) a change.
      expect(leaderChangedEvents(surface)).toHaveLength(1);
      expect(classifiedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview", previewScrollEventReason: "leader" }
      });
    });

    it("switches only on an input to the OTHER pane", () => {
      const surface = mount(DOC_CONTENT, "doc-switch");
      // Editor is already the default leader — go to preview and back so
      // the first assertion below is a genuine, observable transition.
      dispatch(surface.preview(), wheelEvent());

      dispatch(surface.editorScroller(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "editor" }
      });

      dispatch(surface.editorScroller(), wheelEvent());
      dispatch(surface.editorScroller(), touchstartEvent());
      expect(leaderChangedEvents(surface)).toHaveLength(2); // still editor, no new "changed"

      dispatch(surface.preview(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview" }
      });
      expect(leaderChangedEvents(surface)).toHaveLength(3);
    });
  });

  describe("keydown attribution", () => {
    it("attributes a keydown to the pane containing document.activeElement", () => {
      const surface = mount(DOC_CONTENT, "doc-keydown-active");
      const previewChild = surface.preview().querySelector("p")!;
      // A real .focus() call would ALSO fire a genuine "focusin" event,
      // which this component's own focusin listener already treats as a
      // leadership-granting input — contaminating this test's isolation of
      // keydown attribution specifically. Stubbing the activeElement getter
      // decouples the two.
      vi.spyOn(surface.container.ownerDocument, "activeElement", "get").mockReturnValue(
        previewChild
      );

      dispatch(surface.container.ownerDocument, keydownEvent("PageDown"));

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview", previewScrollLeaderTrigger: "keydown" }
      });
    });

    it("falls back to the last pointerdown pane when activeElement resolves to neither pane", () => {
      const surface = mount(DOC_CONTENT, "doc-keydown-pointerdown-fallback");
      // A pointerdown on preview records it as the last-pointerdown pane
      // AND makes it leader — switch leadership back to editor afterward so
      // the keydown's effect (if any) is unambiguous.
      dispatch(surface.preview(), pointerdownEvent());
      dispatch(surface.editorScroller(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "editor" }
      });

      // Move focus outside both panes (document.body), then a keydown with
      // no activeElement match falls back to the last pointerdown pane
      // (preview), not the current leader (editor).
      surface.container.ownerDocument.body.setAttribute("tabindex", "-1");
      surface.container.ownerDocument.body.focus();
      dispatch(surface.container.ownerDocument, keydownEvent("PageDown"));

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview", previewScrollLeaderTrigger: "keydown" }
      });
    });

    it("leaves the leader unchanged when neither activeElement nor a prior pointerdown resolves a pane", () => {
      const surface = mount(DOC_CONTENT, "doc-keydown-unresolved");
      surface.container.ownerDocument.body.setAttribute("tabindex", "-1");
      surface.container.ownerDocument.body.focus();

      dispatch(surface.container.ownerDocument, keydownEvent("PageDown"));

      // Default leader (editor) never changed, so no leader.changed at all.
      expect(leaderChangedEvents(surface)).toHaveLength(0);
    });

    it("an ordinary typing keydown (non-scroll-related key) still attributes and acquires leadership — ANY key counts in Phase 1", () => {
      const surface = mount(DOC_CONTENT, "doc-keydown-any-key");
      const previewChild = surface.preview().querySelector("p")!;
      vi.spyOn(surface.container.ownerDocument, "activeElement", "get").mockReturnValue(
        previewChild
      );

      dispatch(surface.container.ownerDocument, keydownEvent("a"));

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview", previewScrollLeaderTrigger: "keydown" }
      });
    });
  });

  describe("CodeMirror transaction-driven leadership", () => {
    it("a transaction with a scrollIntoView effect takes editor leadership away from a sticky preview leader", () => {
      const surface = mount(DOC_CONTENT, "doc-cm-transaction");
      dispatch(surface.preview(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview" }
      });

      act(() => {
        surface.view().dispatch({
          effects: EditorView.scrollIntoView(surface.view().state.doc.line(1).from, {
            y: "start"
          })
        });
      });

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: {
          previewScrollLeader: "editor",
          previewScrollLeaderTrigger: "editorTransactionScrollIntoView"
        }
      });
    });

    it("the SAME transaction carrying the #505 preview->editor sync annotation does NOT take leadership", () => {
      const surface = mount(DOC_CONTENT, "doc-cm-annotation-exception");
      dispatch(surface.preview(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview" }
      });
      const eventCountBefore = surface.events.length;

      act(() => {
        surface.view().dispatch({
          effects: EditorView.scrollIntoView(surface.view().state.doc.line(1).from, {
            y: "start"
          }),
          annotations: previewToEditorScrollSyncAnnotation.of(true)
        });
      });

      // No new leader.changed — preview is still leader.
      expect(surface.events.length).toBe(eventCountBefore);
      expect(surface.events.filter((e) => e.event === "preview.scrollSync.leader.changed"))
        .toHaveLength(1);
    });
  });

  describe("reset on document open / tab switch", () => {
    it("resets the leader to editor when activeDocumentKey changes (tab switch)", () => {
      const surface = mount(DOC_CONTENT, "doc-a");
      dispatch(surface.preview(), wheelEvent());
      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "preview" }
      });

      surface.rerender({ activeDocumentKey: "doc-b", documentOpenId: null });

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "editor", previewScrollLeaderTrigger: "tabSwitch" }
      });
    });

    it("resets the leader to editor with trigger documentOpen when documentOpenId is set at the switch", () => {
      const surface = mount(DOC_CONTENT, "doc-a2");
      dispatch(surface.preview(), wheelEvent());

      surface.rerender({ activeDocumentKey: "doc-c", documentOpenId: "open-1" });

      expect(leaderChangedEvents(surface).at(-1)).toMatchObject({
        details: { previewScrollLeader: "editor", previewScrollLeaderTrigger: "documentOpen" }
      });
    });

    it("does not emit a redundant leader.changed when the leader was already editor at the switch", () => {
      const surface = mount(DOC_CONTENT, "doc-already-editor");
      // Never touched — leader stays at its initial value, editor.
      surface.rerender({ activeDocumentKey: "doc-other", documentOpenId: null });

      expect(leaderChangedEvents(surface)).toHaveLength(0);
    });
  });

  describe("input listeners never cancel or stop the native event", () => {
    it.each([
      ["wheel", wheelEvent] as const,
      ["pointerdown", pointerdownEvent] as const,
      ["touchstart", touchstartEvent] as const,
      ["focusin", focusinEvent] as const,
      ["keydown", () => keydownEvent("PageDown")] as const
    ])("%s on the editor scroller is not cancelled", (_name, makeEvent) => {
      const surface = mount(DOC_CONTENT, `doc-not-cancelled-editor-${_name}`);

      const notCancelled = dispatch(surface.editorScroller(), makeEvent());

      expect(notCancelled).toBe(true);
    });

    it("does not stop propagation: a bubble-phase listener on the same element still runs after the capture-phase leader tracker", () => {
      const surface = mount(DOC_CONTENT, "doc-not-stopped");
      let bubblePhaseListenerRan = false;
      surface.preview().addEventListener("wheel", () => {
        bubblePhaseListenerRan = true;
      });

      dispatch(surface.preview(), wheelEvent());

      expect(bubblePhaseListenerRan).toBe(true);
      expect(leaderChangedEvents(surface)).toHaveLength(1);
    });
  });

  describe("scrollEvent.classified diagnostics", () => {
    it("classifies a scroll event on the leading pane as leader (propagated: true)", async () => {
      const surface = mount(DOC_CONTENT, "doc-leader-classified", { isDebugModeEnabled: true });

      dispatch(surface.editorScroller(), wheelEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      await flushAnimationFrame();

      expect(classifiedEvents(surface).at(-1)).toMatchObject({
        details: {
          previewScrollEventPane: "editor",
          previewScrollLeader: "editor",
          previewScrollEventReason: "leader",
          previewScrollEventPropagated: true
        }
      });
    });

    it("classifies a scroll event on the OTHER (non-leading) pane as follower (propagated: false)", async () => {
      const surface = mount(DOC_CONTENT, "doc-follower-classified", { isDebugModeEnabled: true });

      dispatch(surface.editorScroller(), wheelEvent());
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(classifiedEvents(surface).at(-1)).toMatchObject({
        details: {
          previewScrollEventPane: "preview",
          previewScrollLeader: "editor",
          previewScrollEventReason: "follower",
          previewScrollEventPropagated: false
        }
      });
    });

    it("classifies as disabledBySetting when the pane IS leader but that direction is turned off", async () => {
      const surface = mount(DOC_CONTENT, "doc-disabled-classified", {
        isDebugModeEnabled: true,
        isSyncScrollPreviewToEditorEnabled: false
      });

      dispatch(surface.preview(), wheelEvent());
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(classifiedEvents(surface).at(-1)).toMatchObject({
        details: {
          previewScrollEventPane: "preview",
          previewScrollLeader: "preview",
          previewScrollEventReason: "disabledBySetting",
          previewScrollEventPropagated: false
        }
      });
    });

    it("no longer carries phase0DryRun", async () => {
      const surface = mount(DOC_CONTENT, "doc-no-dry-run", { isDebugModeEnabled: true });

      dispatch(surface.editorScroller(), wheelEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      await flushAnimationFrame();

      expect(classifiedEvents(surface).at(-1)?.details).not.toHaveProperty(
        "previewScrollEventPhase0DryRun"
      );
    });

    it("includes msSinceLastProgrammaticWrite (null when none yet) only for the preview pane", async () => {
      const surface = mount(DOC_CONTENT, "doc-ms-since-write", { isDebugModeEnabled: true });

      dispatch(surface.editorScroller(), wheelEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      await flushAnimationFrame();
      const editorDetail = classifiedEvents(surface).at(-1)!.details!;
      expect(editorDetail).not.toHaveProperty(
        "previewScrollEventMsSinceLastProgrammaticWrite"
      );

      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();
      const previewDetail = classifiedEvents(surface).at(-1)!.details!;
      expect(previewDetail).toHaveProperty(
        "previewScrollEventMsSinceLastProgrammaticWrite",
        null
      );
    });

    it("emits no scrollEvent.classified diagnostics at all when debug mode is off, even though classification still runs", async () => {
      const surface = mount(DOC_CONTENT, "doc-debug-off", { isDebugModeEnabled: false });

      // Editor is already the default leader — switch to preview so leader
      // tracking's own independence from the debug-mode gate is observable.
      dispatch(surface.preview(), wheelEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(classifiedEvents(surface)).toHaveLength(0);
      expect(leaderChangedEvents(surface)).toHaveLength(1);
    });

    it("#505 Phase 1 bug fix: coalesces multiple raw scroll events within one animation frame into a single classified log (no duplicate at the same timestamp)", async () => {
      const surface = mount(DOC_CONTENT, "doc-coalesce", { isDebugModeEnabled: true });
      dispatch(surface.editorScroller(), wheelEvent());

      // Simulate what a pointer drag does: several raw "scroll" events
      // fired synchronously before the browser gets to paint a frame.
      dispatch(surface.editorScroller(), scrollEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      dispatch(surface.editorScroller(), scrollEvent());
      await flushAnimationFrame();

      const editorClassifications = classifiedEvents(surface).filter(
        (e) => e.details?.previewScrollEventPane === "editor"
      );
      expect(editorClassifications).toHaveLength(1);
    });
  });

  describe("removes all leader-tracking listeners on unmount", () => {
    it("a post-unmount dispatch produces no new diagnostic events", () => {
      const surface = mount(DOC_CONTENT, "doc-unmount", { isDebugModeEnabled: true });
      const editorScroller = surface.editorScroller();
      const preview = surface.preview();
      const ownerDocument = surface.container.ownerDocument;
      const eventCountBefore = surface.events.length;

      surface.unmount();

      expect(() => {
        dispatch(editorScroller, wheelEvent());
        dispatch(preview, scrollEvent());
        dispatch(ownerDocument, keydownEvent("PageDown"));
      }).not.toThrow();
      expect(surface.events.length).toBe(eventCountBefore);
    });
  });
});
