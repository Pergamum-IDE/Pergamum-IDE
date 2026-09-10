// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownEditor,
  type MarkdownEditorParagraphIndentController
} from "../../src/renderer/MarkdownEditor";
import type { MarkdownEditorActiveFindConfig } from "../../src/renderer/find/activeFindKeymapExtension";
import type { MarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";
import { activeFindGutterMarkerField } from "../../src/renderer/find/activeFindGutterMarkerExtension";
import { smartSelectionHighlightField } from "../../src/renderer/selectionHighlightExtension";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

function mount(props: Partial<React.ComponentProps<typeof MarkdownEditor>>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value: "",
        onChange: () => undefined,
        ...props
      })
    );
  });
  return {
    rerender: (next: Partial<React.ComponentProps<typeof MarkdownEditor>>) =>
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: "",
            onChange: () => undefined,
            ...next
          })
        );
      }),
    contentDom: () => container!.querySelector(".cm-content") as HTMLElement
  };
}

function findKeydown(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    code: "KeyF",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true
  });
}

function editorView(): EditorView {
  const content = container?.querySelector(".cm-content");
  const view = content instanceof HTMLElement ? EditorView.findFromDOM(content) : null;

  if (!view) {
    throw new Error("Expected mounted CodeMirror EditorView.");
  }

  return view;
}

describe("MarkdownEditor activeFind prop wiring (#424 Slice 1)", () => {
  it("routes Ctrl+F to the supplied config's requestOpen and preventDefaults it", () => {
    const requestOpen = vi.fn();
    const config: MarkdownEditorActiveFindConfig = { requestOpen };
    const { contentDom } = mount({ activeFind: config });

    const event = findKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("leaves Ctrl+F inert when no activeFind config is supplied (e.g. Glossary description field)", () => {
    const { contentDom } = mount({ contextSurface: "glossaryDescription" });

    const event = findKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("picks up a live activeFind prop change (undefined -> config) without a remount", () => {
    const { contentDom, rerender } = mount({});

    const first = findKeydown();
    act(() => {
      contentDom().dispatchEvent(first);
    });
    expect(first.defaultPrevented).toBe(false);

    const requestOpen = vi.fn();
    rerender({ activeFind: { requestOpen } });

    const second = findKeydown();
    act(() => {
      contentDom().dispatchEvent(second);
    });
    expect(second.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  // #425 follow-up: the real dogfood failure. A MarkdownEditor unmounts
  // (Settings-tab round trip), the App-owned `documentStates` cache — and the
  // cached EditorState's baked Ctrl+F keymap — survive, and a BRAND NEW
  // MarkdownEditor mounts, restores that state, and is wired to a DIFFERENT
  // surface's config. Ctrl+F must reach the NEW config, never the dead one.
  it("routes Ctrl+F to the CURRENT config after a remount that restores a cached EditorState", () => {
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
    const requestOpenOld = vi.fn();
    const requestOpenNew = vi.fn();

    const firstContainer = document.createElement("div");
    document.body.appendChild(firstContainer);
    const firstRoot = createRoot(firstContainer);
    act(() => {
      firstRoot.render(
        React.createElement(MarkdownEditor, {
          value: "hello world",
          onChange: () => undefined,
          documentKey: "doc-1",
          documentStates,
          activeFind: { requestOpen: requestOpenOld }
        })
      );
    });
    const firstContent = firstContainer.querySelector(
      ".cm-content"
    ) as HTMLElement;
    act(() => {
      firstContent.dispatchEvent(findKeydown());
    });
    expect(requestOpenOld).toHaveBeenCalledTimes(1);

    // Navigate away — editor unmounts, cache (with baked keymap) survives.
    act(() => firstRoot.unmount());
    firstContainer.remove();

    const secondContainer = document.createElement("div");
    document.body.appendChild(secondContainer);
    const secondRoot = createRoot(secondContainer);
    act(() => {
      secondRoot.render(
        React.createElement(MarkdownEditor, {
          value: "hello world",
          onChange: () => undefined,
          documentKey: "doc-1",
          documentStates,
          activeFind: { requestOpen: requestOpenNew }
        })
      );
    });
    const secondContent = secondContainer.querySelector(
      ".cm-content"
    ) as HTMLElement;
    act(() => {
      secondContent.dispatchEvent(findKeydown());
    });

    expect(requestOpenNew).toHaveBeenCalledTimes(1);
    expect(requestOpenOld).toHaveBeenCalledTimes(1); // never re-invoked

    act(() => secondRoot.unmount());
    secondContainer.remove();
  });

  it("Ctrl+F is inert again once the only active-find MarkdownEditor unmounts", () => {
    const requestOpen = vi.fn();
    const soloContainer = document.createElement("div");
    document.body.appendChild(soloContainer);
    const soloRoot = createRoot(soloContainer);
    act(() => {
      soloRoot.render(
        React.createElement(MarkdownEditor, {
          value: "x",
          onChange: () => undefined,
          documentKey: "doc-solo",
          activeFind: { requestOpen }
        })
      );
    });
    act(() => soloRoot.unmount());
    soloContainer.remove();

    // A non-find editor (Glossary description field shape) now mounts.
    const { contentDom } = mount({ contextSurface: "glossaryDescription" });
    const event = findKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(requestOpen).not.toHaveBeenCalled();
  });
});

describe("MarkdownEditor activeFindHighlight prop wiring (#424 Slice 2)", () => {
  function marks(): NodeListOf<Element> {
    return container!.querySelectorAll(".cm-pergamum-findMatch");
  }

  it("paints a highlight span per range and marks the active one", () => {
    const { rerender } = mount({ value: "foo foo foo" });
    rerender({
      value: "foo foo foo",
      activeFindHighlight: {
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 },
          { from: 8, to: 11 }
        ],
        activeIndex: 1
      }
    });

    expect(marks()).toHaveLength(3);
    expect(
      container!.querySelectorAll(".cm-pergamum-findMatch-active")
    ).toHaveLength(1);
  });

  it("clears every highlight when the prop goes back to null", () => {
    const { rerender } = mount({
      value: "foo foo",
      activeFindHighlight: {
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 }
        ],
        activeIndex: 0
      }
    });
    expect(marks()).toHaveLength(2);

    rerender({ value: "foo foo", activeFindHighlight: null });
    expect(marks()).toHaveLength(0);
  });

  it("does not carry highlights across a document switch", () => {
    const { rerender } = mount({
      value: "foo foo",
      documentKey: "doc-a",
      activeFindHighlight: {
        matches: [{ from: 0, to: 3 }],
        activeIndex: 0
      }
    });
    expect(marks()).toHaveLength(1);

    // switch to another document; the panel would also close and drop the prop
    rerender({
      value: "bar bar",
      documentKey: "doc-b",
      activeFindHighlight: null
    });
    expect(marks()).toHaveLength(0);

    // switching back must NOT restore the stale highlight
    rerender({
      value: "foo foo",
      documentKey: "doc-a",
      activeFindHighlight: null
    });
    expect(marks()).toHaveLength(0);
  });
});

describe("MarkdownEditor selection highlight mode prop wiring (#425)", () => {
  function selectionMarkCount(): number {
    return editorView().state.field(smartSelectionHighlightField, false)?.size ?? 0;
  }

  it("paints smart selection matches and clears them when the mode changes to off", () => {
    const pendingSelection = {
      start: 0,
      end: 5,
      focusEditor: false
    };
    const onPendingSelectionApplied = vi.fn();
    const { rerender } = mount({
      value: "night knight night",
      selectionHighlightMode: "smart",
      pendingSelection,
      onPendingSelectionApplied
    });

    expect(onPendingSelectionApplied).toHaveBeenCalledTimes(1);
    expect(selectionMarkCount()).toBe(2);

    rerender({
      value: "night knight night",
      selectionHighlightMode: "off",
      pendingSelection: null,
      onPendingSelectionApplied
    });

    expect(selectionMarkCount()).toBe(0);
  });

  it("does not leave the smart highlight field active when switched to CodeMirror default mode", () => {
    const pendingSelection = {
      start: 0,
      end: 5,
      focusEditor: false
    };
    const { rerender } = mount({
      value: "night knight night",
      selectionHighlightMode: "smart",
      pendingSelection
    });

    expect(selectionMarkCount()).toBe(2);

    rerender({
      value: "night knight night",
      selectionHighlightMode: "default",
      pendingSelection: null
    });

    expect(selectionMarkCount()).toBe(0);
  });

  it("reconciles cached document state to the current mode when reactivated", () => {
    const pendingSelection = {
      start: 0,
      end: 5,
      focusEditor: false
    };
    const { rerender } = mount({
      value: "night knight night",
      documentKey: "doc-a",
      selectionHighlightMode: "smart",
      pendingSelection
    });

    expect(selectionMarkCount()).toBe(2);

    rerender({
      value: "other",
      documentKey: "doc-b",
      selectionHighlightMode: "smart",
      pendingSelection: null
    });

    rerender({
      value: "night knight night",
      documentKey: "doc-a",
      selectionHighlightMode: "off",
      pendingSelection: null
    });

    expect(selectionMarkCount()).toBe(0);
  });
});

describe("MarkdownEditor activeFindGutterMarkers prop wiring (#425)", () => {
  function gutterMarkerCount(): number {
    return editorView().state.field(activeFindGutterMarkerField, false)?.size ?? 0;
  }

  it("applies the independent findGutterMarkers setting gate and updates without remounting", () => {
    const markers = {
      matches: [
        { from: 0, to: 3 },
        { from: 4, to: 7 }
      ]
    };
    const { rerender } = mount({
      value: "foo\nfoo",
      findGutterMarkers: false,
      activeFindGutterMarkers: markers
    });

    expect(gutterMarkerCount()).toBe(0);

    rerender({
      value: "foo\nfoo",
      findGutterMarkers: true,
      activeFindGutterMarkers: markers
    });

    expect(gutterMarkerCount()).toBe(2);
    expect(
      container!.querySelector(".cm-pergamum-findGutterMarker svg")
    ).toBeTruthy();

    rerender({
      value: "foo\nfoo",
      findGutterMarkers: true,
      activeFindGutterMarkers: null
    });

    expect(gutterMarkerCount()).toBe(0);
  });

  it("does not restore stale gutter markers from a cached document state after a switch", () => {
    const { rerender } = mount({
      value: "foo\nfoo",
      documentKey: "doc-a",
      findGutterMarkers: true,
      activeFindGutterMarkers: {
        matches: [{ from: 0, to: 3 }]
      }
    });
    expect(gutterMarkerCount()).toBe(1);

    rerender({
      value: "bar\nbar",
      documentKey: "doc-b",
      findGutterMarkers: true,
      activeFindGutterMarkers: null
    });
    expect(gutterMarkerCount()).toBe(0);

    rerender({
      value: "foo\nfoo",
      documentKey: "doc-a",
      findGutterMarkers: true,
      activeFindGutterMarkers: null
    });
    expect(gutterMarkerCount()).toBe(0);
  });
});

describe("EditorSurface active Find panel wiring (#424 Slice 1)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("renders the Pergamum Find panel above the MarkdownEditor when open", () => {
    const headerIndex = source.indexOf('translate("workspace.editor")');
    // the real editor element, not <MarkdownEditorSurface>
    const editorIndex = source.indexOf("<MarkdownEditor\n");
    // the JSX element, not `useState<ActiveFindPanelMode>`
    const panelIndex = source.indexOf("<ActiveFindPanel\n");
    expect(headerIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeGreaterThan(headerIndex);
    expect(panelIndex).toBeLessThan(editorIndex);
    expect(source).toContain("{findOpen ? (");
  });

  it("threads the Find config + navigation + focus-return + highlight props into MarkdownEditor", () => {
    expect(source).toContain("activeFind={activeFindConfig}");
    expect(source).toContain("extraPendingSelection={findExtraSelection}");
    expect(source).toContain(
      "onExtraPendingSelectionApplied={handleFindExtraSelectionApplied}"
    );
    expect(source).toContain("extraFocusRequest={findFocusRequest}");
    expect(source).toContain("activeFindHighlight={activeFindHighlight}");
    expect(source).toContain("activeFindGutterMarkers={activeFindGutterMarkers}");
  });

  it("searches the active buffer via the shared matcher and reuses the selection-jump path", () => {
    expect(source).toContain('from "./find/activeDocumentFind"');
    expect(source).toContain(
      "evaluateActiveDocumentFind(content, findQuery, findOptions)"
    );
    expect(source).toContain("resolveActiveFindCursor(");
    // navigation jumps must not steal focus out of the search box
    expect(source).toContain("focusEditor: false");
  });

  it("#424 Slice 2: options exclusivity, index clamp, and mark-all highlight are all local", () => {
    expect(source).toContain("toggleActiveDocumentFindOption(");
    expect(source).toContain("clampActiveFindIndex(current, findMatchCount)");
    // mark-all set is only non-null for an open panel with a valid match
    const highlightMemo = source.slice(
      source.indexOf("const activeFindHighlight = useMemo"),
      source.indexOf("const activeFindHighlight = useMemo") + 500
    );
    expect(highlightMemo).toContain("!findOpen || !findMarkAll || findMatchCount === 0");
  });

  it("#425 follow-up: tab switch swaps per-doc search state in a render-phase block; open/mode stay surface-global", () => {
    // render-phase swap block (the `useDebouncedPreviewContent`-style pattern)
    const swapStart = source.indexOf(
      "if (findStateDocumentKey !== documentKey) {"
    );
    expect(swapStart).toBeGreaterThan(-1);
    const swap = source.slice(swapStart, swapStart + 700);
    // per-document search conditions are re-loaded from the store
    expect(swap).toContain("getActiveFindDocumentState(documentKey)");
    expect(swap).toContain("setFindQuery(incoming.query)");
    expect(swap).toContain("setFindReplaceText(incoming.replaceText)");
    expect(swap).toContain("setFindOptions(incoming.options)");
    expect(swap).toContain("setFindQueryKind(incoming.queryKind)");
    // derived state is dropped
    expect(swap).toContain("setFindActiveIndex(null)");
    expect(swap).toContain("setFindExtraSelection(null)");
    // panel open / mode are NOT touched in the swap (surface-global)
    expect(swap).not.toContain("setFindOpen(");
    expect(swap).not.toContain("setFindMode(");

    // no leftover diagnostic tracer
    expect(source).not.toContain("traceActiveFind");
    expect(source).not.toContain("activeFindTrace");

    // mirror effects: per-doc search state under `findStateDocumentKey`, and
    // surface-global UI state
    expect(source).toContain(
      "setActiveFindDocumentState(findStateDocumentKey, {"
    );
    expect(source).toContain(
      "setActiveFindUiState({ open: findOpen, mode: findMode })"
    );
    expect(source).toContain('from "./find/activeFindSessionStore"');

    // explicit close still returns focus to the editor
    const closeHandler = source.slice(
      source.indexOf("const handleFindClose"),
      source.indexOf("const handleFindClose") + 320
    );
    expect(closeHandler).toContain("setFindOpen(false)");
    expect(closeHandler).toContain("setFindFocusRequest({");
  });

  it("does not open the project-wide Search pane", () => {
    const findRegion = source.slice(
      source.indexOf("#424: active-document Find panel"),
      source.indexOf("handleFindExtraSelectionApplied")
    );
    expect(findRegion).not.toContain("setSidebarMode");
    expect(findRegion).not.toContain("openProjectSearch");
    expect(findRegion).not.toContain("SearchSidebar");
  });
});

describe("#425 follow-up: project unload clears the Active Find session (App wiring)", () => {
  const appSource = readFileSync("src/renderer/App.tsx", "utf8");

  it("resets the session (with a privacy-safe debug log) on project switch AND explicit close", () => {
    expect(appSource).toContain(
      "function resetActiveFindSessionForProjectContextChange()"
    );
    expect(appSource).toContain("resetActiveFindSession();");
    expect(appSource).toContain('event: "activeFind.session.reset"');
    expect(appSource).toContain('reason: "project_context_changed"');
    // summary is booleans / counts only — no query field threaded in
    expect(appSource).toContain("getActiveFindSessionSummary()");
    expect(appSource).toContain("activeFindDocumentStateCount: before.documentStateCount");

    // called from both project-context-change choke points
    const activate = appSource.slice(
      appSource.indexOf("async function activateProject("),
      appSource.indexOf("async function activateProject(") + 900
    );
    expect(activate).toContain("resetActiveFindSessionForProjectContextChange()");
    const explicitClose = appSource.slice(
      appSource.indexOf("function resetRendererProjectAfterExplicitClose("),
      appSource.indexOf("function resetRendererProjectAfterExplicitClose(") + 900
    );
    expect(explicitClose).toContain(
      "resetActiveFindSessionForProjectContextChange()"
    );
  });

  it("no leftover activeFindTrace / __afTrace references anywhere in the renderer entry points", () => {
    expect(appSource).not.toContain("activeFindTrace");
    expect(appSource).not.toContain("__afTrace");
  });
});

describe("EditorSurface replace-current wiring (#424 Slice 3)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("captures the active editor's replace controller by wrapping the bubble-up callback", () => {
    expect(source).toContain("handleParagraphIndentControllerChange");
    expect(source).toContain("findReplaceControllerRef.current = controller");
    expect(source).toContain("onParagraphIndentControllerChange(controller)");
    expect(source).toContain(
      "onParagraphIndentControllerChange={\n            handleParagraphIndentControllerChange\n          }"
    );
  });

  it("replace-current re-evaluates against the LIVE buffer and dispatches ONE input.replace transaction", () => {
    const handler = source.slice(
      source.indexOf("const handleFindReplaceCurrent"),
      source.indexOf("const handleFindClose")
    );
    expect(handler).toContain("controller.getBufferText() ?? content");
    expect(handler).toContain("evaluateActiveDocumentFind(");
    expect(handler).toContain("buildActiveDocumentReplacement(");
    expect(handler).toContain("controller.applyReplaceInBufferChanges([");
    expect(handler).toContain("resolveActiveFindIndexAfterReplacement(");
    // no disk save, no project-wide replace
    expect(handler).not.toContain("saveProjectDocument");
    expect(handler).not.toContain("writeMarkdown");
    expect(handler).not.toContain("applyProjectReplace");
  });

  it("gates replace-current on read-only / regex / template / controller / a live match", () => {
    const gate = source.slice(
      source.indexOf("const findReplaceCurrentEnabled ="),
      source.indexOf("const findReplaceCurrentEnabled =") + 400
    );
    expect(gate).toContain('findMode === "replace"');
    expect(gate).toContain("!readOnly");
    expect(gate).toContain("findControllerReady");
    expect(gate).toContain("findRegexError === null");
    expect(gate).toContain("findTemplateError === null");
    expect(gate).toContain("findMatchCount > 0");
    expect(gate).toContain("findActiveIndex !== null");
  });
});

describe("EditorSurface replace-all + 語彙 wiring (#424 Slice 4)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("threads the replace-all + glossary-candidate props into the panel", () => {
    expect(source).toContain("replaceAllEnabled={findReplaceAllEnabled}");
    expect(source).toContain("glossaryCandidates={findGlossaryCandidates}");
    expect(source).toContain("onReplaceAll={handleFindReplaceAll}");
  });

  it("builds the 語彙 candidates from the project glossary entries", () => {
    expect(source).toContain('from "./find/findGlossaryPicker"');
    expect(source).toContain(
      "collectFindGlossaryCandidates(glossaryEntries)"
    );
  });

  it("replace-all re-evaluates the LIVE buffer and dispatches ONE transaction", () => {
    const handler = source.slice(
      source.indexOf("const handleFindReplaceAll"),
      source.indexOf("const handleFindQueryKindChange")
    );
    expect(handler).toContain("controller.getBufferText() ?? content");
    expect(handler).toContain("buildActiveDocumentReplaceAllChanges(");
    expect(handler).toContain("controller.applyReplaceInBufferChanges(built.changes)");
    expect(handler).toContain("resolveActiveFindIndexAfterReplaceAll(");
    // never a disk save or the project-wide replace path
    expect(handler).not.toContain("saveProjectDocument");
    expect(handler).not.toContain("writeMarkdown");
    expect(handler).not.toContain("applyProjectReplace");
  });

  it("gates replace-all like replace-current minus the current-match requirement", () => {
    const gate = source.slice(
      source.indexOf("const findReplaceAllEnabled ="),
      source.indexOf("const findReplaceAllEnabled =") + 400
    );
    expect(gate).toContain('findMode === "replace"');
    expect(gate).toContain("!readOnly");
    expect(gate).toContain("findControllerReady");
    expect(gate).toContain("findHasReplaceQuery");
    expect(gate).toContain("findRegexError === null");
    expect(gate).toContain("findTemplateError === null");
    expect(gate).toContain("findMatchCount > 0");
    expect(gate).not.toContain("findActiveIndex !== null");
  });
});

describe("EditorSurface glossary search mode wiring (#424 Slice 6)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("threads the queryKind + glossary-mode props into the panel", () => {
    expect(source).toContain("queryKind={findQueryKind}");
    expect(source).toContain("glossaryRelation={findGlossaryRelation}");
    expect(source).toContain("searchGlossaryAtomIds={findSearchGlossaryAtomIds}");
    expect(source).toContain("replaceGlossaryAtomId={findReplaceGlossaryAtomId}");
    expect(source).toContain("onQueryKindChange={handleFindQueryKindChange}");
    expect(source).toContain(
      "onGlossaryRelationChange={handleFindGlossaryRelationChange}"
    );
    expect(source).toContain(
      "onSearchGlossaryAtomIdsChange={handleFindSearchGlossaryAtomIdsChange}"
    );
    expect(source).toContain(
      "onReplaceGlossaryAtomIdChange={handleFindReplaceGlossaryAtomIdChange}"
    );
  });

  it("evaluates glossary matches through the shared surface matcher", () => {
    expect(source).toContain('from "./find/activeGlossaryFind"');
    expect(source).toContain("buildActiveGlossaryFindTerms(");
    expect(source).toContain("runActiveGlossaryFind(");
    const evalMemo = source.slice(
      source.indexOf("const findEvaluation = useMemo"),
      source.indexOf("const findMatches = findEvaluation.matches")
    );
    expect(evalMemo).toContain('findQueryKind === "glossary"');
    // relation only matters on the Search tab
    expect(evalMemo).toContain('findMode === "replace" ? "any" : findGlossaryRelation');
  });

  it("#424 Slice 7: threads the effective nearby-search settings into eval + panel", () => {
    expect(source).toContain(
      "glossaryNearbySearchSettings: ActiveGlossaryNearbySettings"
    );
    expect(source).toContain(
      'from "./find/activeGlossaryNearbySearch"'
    );
    const evalMemo = source.slice(
      source.indexOf("const findEvaluation = useMemo"),
      source.indexOf("const findMatches = findEvaluation.matches")
    );
    // the 4th arg to runActiveGlossaryFind is the effective nearby settings
    expect(evalMemo).toContain("glossaryNearbySearchSettings");
    expect(source).toContain(
      "glossaryNearbySettings={glossaryNearbySearchSettings}"
    );
    // App.tsx feeds it from the effective (project > application) settings
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    expect(appSource).toContain(
      "glossaryNearbySearchSettings={\n                          effectiveSettings.search.nearby\n                        }"
    );
  });

  it("glossary replace-current / replace-all insert the LITERAL replace text (no template)", () => {
    const current = source.slice(
      source.indexOf("const handleFindReplaceCurrent"),
      source.indexOf("const handleFindReplaceAll")
    );
    const all = source.slice(
      source.indexOf("const handleFindReplaceAll"),
      source.indexOf("const handleFindQueryKindChange")
    );
    for (const handler of [current, all]) {
      expect(handler).toContain('findQueryKind === "glossary"');
      expect(handler).toContain("controller.getBufferText() ?? content");
      expect(handler).toContain("runActiveGlossaryFind(");
      // literal insert on the glossary path — the atom's value drives the
      // search, the replace text goes in verbatim
      expect(handler).toContain("insert: findReplaceText");
      expect(handler).not.toContain("saveProjectDocument");
      expect(handler).not.toContain("applyProjectReplace");
    }
    // the glossary branch returns before the text template path
    expect(current).toContain("if (findRegexError !== null) {\n      return;");
  });

  it("#425 follow-up: a tab switch SWAPS the glossary-mode session per documentKey (not a reset-to-text)", () => {
    const swapStart = source.indexOf(
      "if (findStateDocumentKey !== documentKey) {"
    );
    const swap = source.slice(swapStart, swapStart + 700);
    // not "reset to text/any/[]" — the INCOMING document's saved values load
    expect(swap).not.toContain('setFindQueryKind("text")');
    expect(swap).not.toContain('setFindGlossaryRelation("any")');
    expect(swap).toContain("setFindQueryKind(incoming.queryKind)");
    expect(swap).toContain(
      "setFindGlossaryRelation(incoming.glossaryRelation)"
    );
    expect(swap).toContain(
      "setFindSearchGlossaryAtomIds([...incoming.searchGlossaryAtomIds])"
    );
    expect(swap).toContain(
      "setFindReplaceGlossaryAtomId(incoming.replaceGlossaryAtomId)"
    );
    // and they are mirrored back per document
    expect(source).toContain("glossaryRelation: findGlossaryRelation");
    expect(source).toContain("searchGlossaryAtomIds: findSearchGlossaryAtomIds");
    expect(source).toContain(
      "replaceGlossaryAtomId: findReplaceGlossaryAtomId"
    );
  });

  it("keeps the search-multi and replace-single glossary selections separate", () => {
    // no code path copies one into the other
    expect(source).not.toContain(
      "setFindReplaceGlossaryAtomId(findSearchGlossaryAtomIds"
    );
    expect(source).not.toContain(
      "setFindSearchGlossaryAtomIds([findReplaceGlossaryAtomId"
    );
  });
});

describe("MarkdownEditor replace controller for #424 Slice 4 (replace-all)", () => {
  function captureController(value: string) {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    const { contentDom } = mount({
      value,
      onParagraphIndentControllerChange: (next) => {
        controller = next;
      }
    });
    return { controller: () => controller!, contentDom };
  }

  function ctrlZ(): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("applies every change in one transaction and Undo restores them all at once", () => {
    const { controller, contentDom } = captureController("a x a x a");

    act(() => {
      controller().applyReplaceInBufferChanges([
        { from: 0, to: 1, insert: "B" },
        { from: 4, to: 5, insert: "B" },
        { from: 8, to: 9, insert: "B" }
      ]);
    });
    expect(controller().getBufferText()).toBe("B x B x B");

    act(() => {
      contentDom().dispatchEvent(ctrlZ());
    });
    expect(controller().getBufferText()).toBe("a x a x a");
  });

  it("an empty change list is a no-op that still reports success", () => {
    const { controller } = captureController("unchanged");
    let applied = false;
    act(() => {
      applied = controller().applyReplaceInBufferChanges([]);
    });
    expect(applied).toBe(true);
    expect(controller().getBufferText()).toBe("unchanged");
  });

  it("a read-only buffer refuses a multi-change replace-all batch", () => {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    mount({
      value: "a a a",
      readOnly: true,
      onParagraphIndentControllerChange: (c) => {
        controller = c;
      }
    });
    const applied = controller!.applyReplaceInBufferChanges([
      { from: 0, to: 1, insert: "X" },
      { from: 2, to: 3, insert: "X" }
    ]);
    expect(applied).toBe(false);
    expect(controller!.getBufferText()).toBe("a a a");
  });
});

describe("MarkdownEditor replace controller for #424 Slice 3", () => {
  function captureController() {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    const { contentDom } = mount({
      value: "alpha beta alpha",
      onParagraphIndentControllerChange: (next) => {
        controller = next;
      }
    });
    return { controller: () => controller!, contentDom };
  }

  function ctrlZ(): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("getBufferText returns the live document text", () => {
    const { controller } = captureController();
    expect(controller().getBufferText()).toBe("alpha beta alpha");
  });

  it("applyReplaceInBufferChanges replaces one range and Undo restores it (one step)", () => {
    const { controller, contentDom } = captureController();

    act(() => {
      controller().applyReplaceInBufferChanges([
        { from: 0, to: 5, insert: "OMEGA" }
      ]);
    });
    expect(controller().getBufferText()).toBe("OMEGA beta alpha");

    act(() => {
      contentDom().dispatchEvent(ctrlZ());
    });
    expect(controller().getBufferText()).toBe("alpha beta alpha");
  });
});

describe("read-only active editor Find shortcuts (#424 Slice 3 dogfood)", () => {
  function findKeydownOn(): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
      isComposing: false,
      bubbles: true,
      cancelable: true
    });
  }

  it("makes the read-only editor content focusable (tabindex) so its keymap can fire", () => {
    const { contentDom } = mount({ value: "text", readOnly: true });
    expect(contentDom().getAttribute("tabindex")).toBe("0");
    expect(contentDom().getAttribute("contenteditable")).toBe("false");
  });

  it("a writable editor is unchanged (CodeMirror manages focusability)", () => {
    const { contentDom } = mount({ value: "text", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
    expect(contentDom().getAttribute("contenteditable")).toBe("true");
  });

  it("reconfigures the tabindex when readOnly flips at runtime", () => {
    const { contentDom, rerender } = mount({ value: "t", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
    rerender({ value: "t", readOnly: true });
    expect(contentDom().getAttribute("tabindex")).toBe("0");
    rerender({ value: "t", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
  });

  it("Ctrl+F still opens the Find panel on a read-only editor (no mutation possible)", () => {
    const requestOpen = vi.fn();
    const { contentDom } = mount({
      value: "text",
      readOnly: true,
      activeFind: { requestOpen }
    });
    const event = findKeydownOn();
    act(() => {
      contentDom().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledWith("search", "");
  });

  it("applyReplaceInBufferChanges does not mutate a read-only buffer", () => {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    mount({
      value: "keep this",
      readOnly: true,
      onParagraphIndentControllerChange: (c) => {
        controller = c;
      }
    });
    const applied = controller!.applyReplaceInBufferChanges([
      { from: 0, to: 4, insert: "NOPE" }
    ]);
    expect(applied).toBe(false);
    expect(controller!.getBufferText()).toBe("keep this");
  });
});

describe("Ctrl+F native search panel suppression wiring (#424 Slice 1)", () => {
  const setupSource = readFileSync(
    "src/renderer/markdownEditorCodeMirrorSetup.ts",
    "utf8"
  );

  it("filters the panel-opener keys out of searchKeymap but keeps the rest", () => {
    expect(setupSource).toContain('"Mod-f"');
    expect(setupSource).toContain('"F3"');
    expect(setupSource).toContain('"Mod-g"');
    expect(setupSource).toContain("searchKeymapWithoutPanelOpeners");
    expect(setupSource).toContain("...searchKeymapWithoutPanelOpeners");
    // the raw spread is gone
    expect(setupSource).not.toContain("...searchKeymap,");
  });
});
