import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import type { DebugLogViewportChangeSource } from "../shared/debugLog";
import {
  documentCharCount,
  documentLineCount,
  documentMaxLineLength
} from "../shared/documentMetrics";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph,
  NewFileLineEnding,
  SelectionHighlightMode,
  WorkbenchSoundSettings
} from "../shared/settings";
import type { GlossaryTag } from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  currentDocumentContent,
  currentProjectRelativePath,
  type CurrentDocument
} from "./currentDocument";
import type { CurrentEditor } from "./currentEditor";
import {
  lineEndingBreakSetToArray,
  type LineEndingBreakSet
} from "./editorLineEndingField";
import type { PendingMarkdownSelection } from "./pendingMarkdownSelection";
import { GlossaryEditor } from "./GlossaryEditor";
import { GlossaryPreviewDecorator } from "./GlossaryPreviewDecorator";
import {
  MarkdownEditor,
  type MarkdownImageAttachmentPositionController,
  type MarkdownEditorActiveFindConfig,
  type MarkdownEditorFocusRequest,
  type MarkdownEditorParagraphIndentController,
  type MarkdownEditorViewStateController
} from "./MarkdownEditor";
import { ActiveFindPanel } from "./find/ActiveFindPanel";
import {
  activeDocumentReplacementTemplateError,
  buildActiveDocumentReplaceAllChanges,
  buildActiveDocumentReplacement,
  clampActiveFindIndex,
  evaluateActiveDocumentFind,
  resolveActiveFindCursor,
  resolveActiveFindIndexAfterReplaceAll,
  resolveActiveFindIndexAfterReplacement,
  toggleActiveDocumentFindOption,
  type ActiveDocumentFindOptions,
  type ReplacementTemplateError
} from "./find/activeDocumentFind";
import { collectFindGlossaryCandidates } from "./find/findGlossaryPicker";
import {
  buildActiveGlossaryFindTerms,
  runActiveGlossaryFind,
  type ActiveGlossarySearchRelation
} from "./find/activeGlossaryFind";
import type { ActiveGlossaryNearbySettings } from "./find/activeGlossaryNearbySearch";
import type { ActiveFindHighlightSpec } from "./find/activeFindHighlightExtension";
import type { ActiveFindGutterMarkerSpec } from "./find/activeFindGutterMarkerExtension";
import type { ActiveFindPanelMode } from "./find/activeFindKeymapExtension";
import {
  getActiveFindDocumentState,
  getActiveFindUiState,
  setActiveFindDocumentState,
  setActiveFindUiState,
  type ActiveFindDocumentState
} from "./find/activeFindSessionStore";
import type { MarkdownImageAttachmentPasteHandler } from "./markdownImageAttachmentPasteExtension";
import type { MarkdownImageLinkDiagnosticReason } from "../shared/api";
import { formatMarkdownImageLinkDiagnosticMessage } from "./markdownImageLinkDiagnosticMessage";
import type { ProjectLocalImageResolutionContext } from "../shared/projectLocalImageLink";
import type { EditorViewState } from "./editorViewState";
import type { MarkdownEditorDocumentState } from "./markdownEditorDocumentState";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import { markdownPreviewRenderer } from "./preview/markdownPreviewRenderer";
import { useGlossaryEntriesForMatching } from "./useGlossaryEntriesForMatching";
import { useHorizontalDrag } from "./useHorizontalDrag";
import type { SoundFeedbackPlayer } from "./soundFeedback";
import { clampMarkdownEditorPreviewRatio } from "./workbenchLayout";

const NARROW_MARKDOWN_WORKSPACE_MEDIA_QUERY = "(max-width: 760px)";

/**
 * Debounce window for `layout.viewport.changed` (#162) — window/pane resize
 * fires continuously while dragging, so this settles to a single report
 * `VIEWPORT_CHANGE_DEBOUNCE_MS` after the last size change.
 */
const VIEWPORT_CHANGE_DEBOUNCE_MS = 400;

/**
 * Safe aggregate document/window/pane metrics for `document.open.completed`
 * only (#161) — see src/shared/debugLog.ts's `DebugLogDetails` comment for
 * each field's exact definition.
 */
export interface DocumentOpenAggregateMetrics {
  documentCharCount: number;
  documentLineCount: number;
  documentMaxLineLength: number;
  appWindowWidth: number;
  appWindowHeight: number;
  editorPaneWidth: number;
  editorPaneHeight: number;
  previewPaneWidth: number;
  previewPaneHeight: number;
}

/** `layout.viewport.changed`'s detail shape (#162). */
export interface ViewportSizeDetails {
  appWindowWidth: number;
  appWindowHeight: number;
  editorPaneWidth: number;
  editorPaneHeight: number;
  previewPaneWidth: number;
  previewPaneHeight: number;
  viewportChangeSource: DebugLogViewportChangeSource;
}

function viewportSizesEqual(
  a: Omit<ViewportSizeDetails, "viewportChangeSource">,
  b: Omit<ViewportSizeDetails, "viewportChangeSource">
): boolean {
  return (
    a.appWindowWidth === b.appWindowWidth &&
    a.appWindowHeight === b.appWindowHeight &&
    a.editorPaneWidth === b.editorPaneWidth &&
    a.editorPaneHeight === b.editorPaneHeight &&
    a.previewPaneWidth === b.previewPaneWidth &&
    a.previewPaneHeight === b.previewPaneHeight
  );
}

/**
 * Debounced `layout.viewport.changed` reporter (#162): watches the app
 * window and the editor/preview pane elements for size changes and reports
 * at most once per `VIEWPORT_CHANGE_DEBOUNCE_MS` of quiet.
 *
 * A window resize almost always also changes both panes' sizes (they're
 * sized relative to the workspace container), so both the `resize` listener
 * and the `ResizeObserver` typically fire for the same underlying resize.
 * `windowResize` is treated as the higher-priority signal within one
 * debounce window (it doesn't get overwritten by a `paneResize` that fires
 * moments later as a side effect of the same window resize); a resize that
 * only ever touches the panes (ratio drag, no window resize) still reports
 * `paneResize`. This is a best-effort attribution, not a guarantee to fully
 * disambiguate every case — #162 explicitly allows `source` to fall back to
 * `unknown` (or be omitted) when precise attribution would add
 * disproportionate complexity.
 *
 * ResizeObserver's first callback after `observe()` fires immediately with
 * the current size, not because anything changed — that initial call is
 * used only to establish a baseline (no report), so mounting this component
 * for a newly-opened document never emits a spurious `layout.viewport.changed`
 * on its own (that snapshot belongs to `document.open.completed`, #161).
 */
function useDebouncedViewportChangeDebugLog(
  editorPaneRef: RefObject<HTMLElement | null>,
  previewPaneRef: RefObject<HTMLElement | null>,
  onViewportChanged: (details: ViewportSizeDetails) => void
): void {
  useEffect(() => {
    const editorPaneElement = editorPaneRef.current;
    const previewPaneElement = previewPaneRef.current;

    if (!editorPaneElement || !previewPaneElement) {
      return;
    }

    let debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let pendingSource: DebugLogViewportChangeSource = "unknown";
    let lastReportedSizes: Omit<
      ViewportSizeDetails,
      "viewportChangeSource"
    > | null = null;
    let hasEstablishedBaseline = false;

    function currentSizes(): Omit<ViewportSizeDetails, "viewportChangeSource"> {
      return {
        appWindowWidth: window.innerWidth,
        appWindowHeight: window.innerHeight,
        editorPaneWidth: editorPaneElement!.clientWidth,
        editorPaneHeight: editorPaneElement!.clientHeight,
        previewPaneWidth: previewPaneElement!.clientWidth,
        previewPaneHeight: previewPaneElement!.clientHeight
      };
    }

    function scheduleReport(source: DebugLogViewportChangeSource): void {
      if (source === "windowResize" || pendingSource === "unknown") {
        pendingSource = source;
      }

      if (debounceTimeoutId !== null) {
        clearTimeout(debounceTimeoutId);
      }

      debounceTimeoutId = setTimeout(() => {
        debounceTimeoutId = null;

        const sizes = currentSizes();
        const source = pendingSource;
        pendingSource = "unknown";

        if (lastReportedSizes && viewportSizesEqual(lastReportedSizes, sizes)) {
          return;
        }

        lastReportedSizes = sizes;
        onViewportChanged({ ...sizes, viewportChangeSource: source });
      }, VIEWPORT_CHANGE_DEBOUNCE_MS);
    }

    function handleWindowResize(): void {
      scheduleReport("windowResize");
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!hasEstablishedBaseline) {
        hasEstablishedBaseline = true;
        lastReportedSizes = currentSizes();
        return;
      }

      scheduleReport("paneResize");
    });

    resizeObserver.observe(editorPaneElement);
    resizeObserver.observe(previewPaneElement);
    window.addEventListener("resize", handleWindowResize);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();

      if (debounceTimeoutId !== null) {
        clearTimeout(debounceTimeoutId);
      }
    };
    // Deliberately an empty dependency array: editorPaneRef/previewPaneRef
    // are stable ref objects, and onViewportChanged (App.tsx's
    // handleViewportChanged) is a fresh function identity on every App.tsx
    // render — listing it would tear down and recreate the ResizeObserver
    // and resize listener (losing hasEstablishedBaseline/lastReportedSizes)
    // on every keystroke-driven re-render, not just when the pane elements
    // actually change. This effect's lifetime is meant to track
    // MarkdownEditorSurface's own mount/unmount instead (mirrors the
    // documentOpenId-only effect above).
  }, []);
}

function useIsNarrowMarkdownWorkspace(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia(NARROW_MARKDOWN_WORKSPACE_MEDIA_QUERY).matches
  );

  useEffect(() => {
    const mediaQueryList = window.matchMedia(
      NARROW_MARKDOWN_WORKSPACE_MEDIA_QUERY
    );

    function handleChange(event: MediaQueryListEvent): void {
      setIsNarrow(event.matches);
    }

    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return isNarrow;
}

/**
 * #250: the Markdown preview is rebuilt (markdown-it parse + a full,
 * non-incremental `innerHTML` replace of the preview pane) from whatever
 * content this hook returns. On a long document that work is expensive
 * enough that doing it synchronously on every keystroke — as the editor's
 * own render previously did — visibly delayed the *next* keystroke, since
 * it shared the same synchronous render/commit as the CodeMirror update.
 * This value intentionally lags `content` by up to `updateDelayMs` (the
 * user's `preview.updateDelayMs` setting — #250 follow-up) so the editor
 * never waits on it; only the last edit in a fast burst actually triggers a
 * preview render. `updateDelayMs === 0` needs no special case: it's just a
 * `setTimeout(..., 0)`, which still yields once before running rather than
 * executing synchronously in the same task as the edit — exactly "don't
 * intentionally wait," without forking the implementation.
 *
 * Keyed on `documentKey` (the active tab's identity) rather than `content`
 * alone: switching to a different open document must show *that*
 * document's preview immediately, never a stale pending update queued for
 * the previously active one. Adopting the new document's content happens
 * synchronously during render (the documented React pattern for resetting
 * state when a prop identifying "which thing this is" changes), so a tab
 * switch never flashes the old document's preview even for one frame.
 *
 * `updateDelayMs` is also a dependency of the scheduling effect: changing
 * the setting while an update is pending cancels that stale-delay timer
 * (the effect cleanup) and reschedules with the new delay from "now",
 * using the same current content — never a leftover timer running on the
 * old delay.
 */
export function useDebouncedPreviewContent(
  documentKey: string,
  content: string,
  updateDelayMs: number
): string {
  const [state, setState] = useState({ documentKey, content });

  if (state.documentKey !== documentKey) {
    setState({ documentKey, content });
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setState((previous) =>
        previous.documentKey === documentKey
          ? { documentKey, content }
          : previous
      );
    }, updateDelayMs);

    return () => clearTimeout(timeoutId);
  }, [documentKey, content, updateDelayMs]);

  return state.content;
}

export interface PreviewRenderResult {
  readonly html: string;
  readonly startedAt: number;
  readonly durationMs: number;
}

/**
 * #250 follow-up: `MarkdownEditorSurface` re-renders on every keystroke
 * (its `content` prop — the CodeMirror-bound canonical value — updates
 * immediately), but markdown-it must only re-run when `previewSourceContent`
 * (the debounced value from useDebouncedPreviewContent) actually changes.
 * Exported — rather than inlined as a bare `useMemo` in the component — so
 * tests exercise this exact production memoization instead of a
 * reimplementation that could silently drift from it.
 *
 * html/startedAt/durationMs all come from the same memoized computation, so
 * they stay consistent for whichever render actually produced this html —
 * including on a document switch, where useDebouncedPreviewContent adopts
 * the new document's content synchronously during render, so this recomputes
 * fresh on that same render (preserving the #152/#154/#161 document-open
 * timing semantics, which read these values from render's closure).
 */
export function useMemoizedPreviewRender(
  previewSourceContent: string,
  // #409 / #412: how project-local image links are anchored for this Preview
  // surface. Defaults to `{ kind: "none" }` (no rewrite). Callers may pass a
  // fresh object literal each render — the memo keys on the discriminant
  // primitives below, not the object identity.
  projectLocalImageResolution: ProjectLocalImageResolutionContext = {
    kind: "none"
  }
): PreviewRenderResult {
  const resolutionKind = projectLocalImageResolution.kind;
  const resolutionSourcePath =
    projectLocalImageResolution.kind === "sourceFile"
      ? projectLocalImageResolution.sourceMarkdownProjectRelativePath
      : "";
  return useMemo(() => {
    const startedAt = performance.now();
    const html = markdownPreviewRenderer.render(previewSourceContent, {
      projectLocalImageResolution
    });

    return { html, startedAt, durationMs: performance.now() - startedAt };
    // projectLocalImageResolution is reconstructed from the two primitives
    // it keys on; adding it as a dep would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSourceContent, resolutionKind, resolutionSourcePath]);
}

interface EditorSurfaceProps {
  editor: CurrentEditor;
  /**
   * Stable identity of the active tab (#250) — used only to know when the
   * user has switched to a *different* open document, so a debounced
   * preview update in flight for the previous one is never applied after
   * the switch. Not used for anything else.
   */
  activeDocumentKey: string;
  /**
   * #392: the runtime-only per-document `EditorState` cache, OWNED above
   * this component (App.tsx) so it survives EditorSurface's own
   * unmount/remount (navigating to Settings / a Manager tab / a Glossary
   * Entry editor and back all unmount EditorSurface). Forwarded straight
   * through to MarkdownEditor — see that component's `documentStates` prop
   * doc comment. `undefined` for the `glossaryEntry` editor kind.
   */
  documentStates?: Map<string, MarkdownEditorDocumentState>;
  /** `preview.updateDelayMs` (#250 follow-up) — see useDebouncedPreviewContent. */
  previewUpdateDelayMs: number;
  /**
   * `files.newFile.lineEnding` (#253) — the fallback kind for a brand new
   * line break created in a document with no existing tracked breaks at
   * all. Never used to decide an *existing* break's kind or as a save-time
   * conversion target.
   */
  newFileLineEndingFallback: NewFileLineEnding;
  /**
   * `editor.lineEnding.expected` (#252) — diagnostic-only comparison
   * target for the line-ending marker/distribution UI. Never affects Save
   * or new-break inheritance, and never makes the document dirty.
   */
  expectedLineEnding: ExpectedLineEnding;
  /**
   * `editor.lineEnding.markerGlyph` (#252) — one glyph shown at every
   * tracked line break.
   */
  markerGlyph: LineEndingMarkerGlyph;
  /**
   * `editor.undoHistoryMinDepth` (#394 Step 1) — CodeMirror `history()`'s
   * `minDepth` for a Markdown document's EditorState. Passed straight
   * through to MarkdownEditor; read only at EditorState construction time
   * (never reconfigures an existing document's history — see
   * markdownEditorCodeMirrorSetup.ts).
   */
  undoHistoryMinDepth: number;
  /** `editor.selectionHighlightMode` (#425), active Markdown editor only. */
  selectionHighlightMode: SelectionHighlightMode;
  /** `editor.findGutterMarkers` (#425), active Markdown editor only. */
  findGutterMarkers: boolean;
  /**
   * `editor.whitespace.*` (#256) — display-only whitespace marker
   * toggles, passed straight through to the Markdown editor. Never
   * affects Save, dirty state, or selection.
   */
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  /** #424 Slice 7: glossary "nearby" relation search range (effective). */
  glossaryNearbySearchSettings: ActiveGlossaryNearbySettings;
  projectRootPath: string | null;
  glossaryRefreshToken: number;
  translate: Translate;
  soundFeedback: SoundFeedbackPlayer;
  soundSettings: WorkbenchSoundSettings;
  isProjectOwnedReadOnly: boolean;
  markdownEditorPreviewRatio: number;
  onChangeMarkdownEditorPreviewRatio: (ratio: number) => void;
  onChangeMarkdownContent: (
    content: string,
    lineEndingBreaks: LineEndingBreakSet
  ) => void;
  onParagraphIndentControllerChange: (
    controller: MarkdownEditorParagraphIndentController | null
  ) => void;
  onViewStateControllerChange: (
    controller: MarkdownEditorViewStateController | null
  ) => void;
  onImageAttachmentPaste?: MarkdownImageAttachmentPasteHandler;
  onImageAttachmentPositionControllerChange?: (
    controller: MarkdownImageAttachmentPositionController | null
  ) => void;
  imageAttachmentSourceDocumentId?: string;
  imageAttachmentSourceEditorId?: string;
  onViewStateSnapshot: (
    outgoingDocumentKey: string,
    viewState: EditorViewState | null
  ) => void;
  onViewStateDirty: () => void;
  /** #375 Document Map: the active Markdown editor's on-screen document range. */
  onMarkdownVisibleRangeChange?: (
    range: EditorVisibleTextRange | null
  ) => void;
  /** #274: persisted #273 View State to re-apply once for the active
   *  Markdown editor's document (null when nothing is pending). */
  restoreActiveEditorViewState:
    | { readonly key: string; readonly viewState: unknown }
    | null;
  onRestoreActiveEditorViewStateApplied: (key: string) => void;
  markdownEditorFocusRequest: MarkdownEditorFocusRequest | null;
  onMarkdownEditorFocusRequestApplied: (requestId: number) => void;
  glossaryAvailableTags: readonly GlossaryTag[];
  onChangeGlossaryEntryDescription: (description: string) => void;
  onAddGlossaryEntryAtom: () => void;
  onChangeGlossaryEntryAtomValue: (atomId: string, value: string) => void;
  onChangeGlossaryEntryAtomMatchFlags: (
    atomId: string,
    matchFlags: number
  ) => void;
  onDeleteGlossaryEntryAtom: (atomId: string) => void;
  onReorderGlossaryEntryAtom: (atomId: string, toIndex: number) => void;
  /** #375: ordered tag assignment (two-list editor). */
  onAssignGlossaryEntryTag: (tagId: string, toIndex: number) => void;
  onUnassignGlossaryEntryTag: (tagId: string) => void;
  onReorderAssignedGlossaryEntryTag: (
    tagId: string,
    toIndex: number
  ) => void;
  /** #375: open the Glossary Tag Manager special tab. */
  onOpenGlossaryTagManager: () => void;
  onDeleteGlossaryEntry: () => void;
  onNavigateToPreviousGlossaryOccurrence: () => void;
  onNavigateToNextGlossaryOccurrence: () => void;
  pendingMarkdownSelection: PendingMarkdownSelection | null;
  onPendingMarkdownSelectionApplied: () => void;
  /** In-flight document-open correlation id (#152), or null when idle. */
  documentOpenId: string | null;
  /**
   * Fired once, right before onDocumentOpenPreviewRendered, with the
   * `performance.now()` mark this document's preview render started at
   * (#154 follow-up).
   */
  onDocumentOpenPreviewRenderStarted: (
    documentOpenId: string,
    previewRenderStartedAt: number
  ) => void;
  /**
   * Fired once after this document's preview has rendered, with its
   * duration and the safe aggregate document/window/pane metrics for
   * `document.open.completed` (#161).
   */
  onDocumentOpenPreviewRendered: (
    documentOpenId: string,
    previewRenderDurationMs: number,
    aggregateMetrics: DocumentOpenAggregateMetrics
  ) => void;
  /**
   * Fired once after the just-rendered preview HTML has been committed to
   * the DOM (#154). See GlossaryPreviewDecorator for what "committed" means
   * here and its caveats.
   */
  onDocumentOpenPreviewDomCommitted: (
    documentOpenId: string,
    durationMs: number,
    previewNodeCount: number
  ) => void;
  /** Fired once after glossary preview decoration has finished (#154). */
  onDocumentOpenPreviewDecorationCompleted: (
    documentOpenId: string,
    durationMs: number,
    visitedTextNodeCount: number,
    decoratedNodeCount: number,
    matchCount: number
  ) => void;
  /**
   * Fired once from a requestAnimationFrame callback scheduled right after
   * decoration finishes (#154 follow-up). See GlossaryPreviewDecorator for
   * what this proxy does and does not guarantee.
   */
  onDocumentOpenPreviewFrameObserved: (
    documentOpenId: string,
    durationMs: number
  ) => void;
  /**
   * Fired at most once per `VIEWPORT_CHANGE_DEBOUNCE_MS` of quiet after the
   * app window or the editor/preview pane sizes change (#162). Not tied to
   * `documentOpenId` — this reports ongoing layout changes, not a one-time
   * open snapshot (that's `onDocumentOpenPreviewRendered`'s aggregateMetrics
   * above).
   */
  onViewportChanged: (details: ViewportSizeDetails) => void;
}

export function EditorSurface({
  editor,
  activeDocumentKey,
  documentStates,
  previewUpdateDelayMs,
  newFileLineEndingFallback,
  expectedLineEnding,
  markerGlyph,
  undoHistoryMinDepth,
  selectionHighlightMode,
  findGutterMarkers,
  whitespaceSettings,
  glossaryNearbySearchSettings,
  projectRootPath,
  glossaryRefreshToken,
  translate,
  soundFeedback,
  soundSettings,
  isProjectOwnedReadOnly,
  markdownEditorPreviewRatio,
  onChangeMarkdownEditorPreviewRatio,
  onChangeMarkdownContent,
  onParagraphIndentControllerChange,
  onViewStateControllerChange,
  onImageAttachmentPaste,
  onImageAttachmentPositionControllerChange,
  imageAttachmentSourceDocumentId,
  imageAttachmentSourceEditorId,
  onViewStateSnapshot,
  onViewStateDirty,
  onMarkdownVisibleRangeChange,
  restoreActiveEditorViewState,
  onRestoreActiveEditorViewStateApplied,
  markdownEditorFocusRequest,
  onMarkdownEditorFocusRequestApplied,
  glossaryAvailableTags,
  onChangeGlossaryEntryDescription,
  onAddGlossaryEntryAtom,
  onChangeGlossaryEntryAtomValue,
  onChangeGlossaryEntryAtomMatchFlags,
  onDeleteGlossaryEntryAtom,
  onReorderGlossaryEntryAtom,
  onAssignGlossaryEntryTag,
  onUnassignGlossaryEntryTag,
  onReorderAssignedGlossaryEntryTag,
  onOpenGlossaryTagManager,
  onDeleteGlossaryEntry,
  onNavigateToPreviousGlossaryOccurrence,
  onNavigateToNextGlossaryOccurrence,
  pendingMarkdownSelection,
  onPendingMarkdownSelectionApplied,
  documentOpenId,
  onDocumentOpenPreviewRenderStarted,
  onDocumentOpenPreviewRendered,
  onDocumentOpenPreviewDomCommitted,
  onDocumentOpenPreviewDecorationCompleted,
  onDocumentOpenPreviewFrameObserved,
  onViewportChanged
}: EditorSurfaceProps): JSX.Element {
  switch (editor.kind) {
    case "markdown":
      return (
        <MarkdownEditorSurface
          document={editor.document}
          documentKey={activeDocumentKey}
          documentStates={documentStates}
          previewUpdateDelayMs={previewUpdateDelayMs}
          newFileLineEndingFallback={newFileLineEndingFallback}
          expectedLineEnding={expectedLineEnding}
          markerGlyph={markerGlyph}
          undoHistoryMinDepth={undoHistoryMinDepth}
          selectionHighlightMode={selectionHighlightMode}
          findGutterMarkers={findGutterMarkers}
          whitespaceSettings={whitespaceSettings}
          glossaryNearbySearchSettings={glossaryNearbySearchSettings}
          projectRootPath={projectRootPath}
          glossaryRefreshToken={glossaryRefreshToken}
          translate={translate}
          soundFeedback={soundFeedback}
          soundSettings={soundSettings}
          readOnly={isProjectOwnedReadOnly}
          onChangeMarkdownContent={onChangeMarkdownContent}
          onParagraphIndentControllerChange={onParagraphIndentControllerChange}
          onViewStateControllerChange={onViewStateControllerChange}
          onImageAttachmentPaste={onImageAttachmentPaste}
          onImageAttachmentPositionControllerChange={
            onImageAttachmentPositionControllerChange
          }
          imageAttachmentSourceDocumentId={imageAttachmentSourceDocumentId}
          imageAttachmentSourceEditorId={imageAttachmentSourceEditorId}
          onViewStateSnapshot={onViewStateSnapshot}
          onViewStateDirty={onViewStateDirty}
          onMarkdownVisibleRangeChange={onMarkdownVisibleRangeChange}
          restoreViewState={restoreActiveEditorViewState}
          onRestoreViewStateApplied={onRestoreActiveEditorViewStateApplied}
          focusRequest={markdownEditorFocusRequest}
          onFocusRequestApplied={onMarkdownEditorFocusRequestApplied}
          pendingSelection={pendingMarkdownSelection}
          onPendingSelectionApplied={onPendingMarkdownSelectionApplied}
          ratio={markdownEditorPreviewRatio}
          onChangeRatio={onChangeMarkdownEditorPreviewRatio}
          documentOpenId={documentOpenId}
          onDocumentOpenPreviewRenderStarted={
            onDocumentOpenPreviewRenderStarted
          }
          onDocumentOpenPreviewRendered={onDocumentOpenPreviewRendered}
          onDocumentOpenPreviewDomCommitted={onDocumentOpenPreviewDomCommitted}
          onDocumentOpenPreviewDecorationCompleted={
            onDocumentOpenPreviewDecorationCompleted
          }
          onDocumentOpenPreviewFrameObserved={
            onDocumentOpenPreviewFrameObserved
          }
          onViewportChanged={onViewportChanged}
        />
      );
    case "glossaryEntry":
      // #436 Slice 5: this branch is unreachable — nothing ever opens a
      // `glossaryEntry` editor tab any more (create/edit both live in the
      // bottom Glossary Entry Editor Pane). Kept only so `CurrentEditor`'s
      // `glossaryEntry` variant still renders something if it were ever
      // reached. `mode="edit"` since a revived tab could only ever target an
      // existing entry (create never went through a tab).
      return (
        <GlossaryEditor
          mode="edit"
          draft={editor.draft}
          availableTags={glossaryAvailableTags}
          translate={translate}
          onChangeDescription={onChangeGlossaryEntryDescription}
          onAddAtom={onAddGlossaryEntryAtom}
          onChangeAtomValue={onChangeGlossaryEntryAtomValue}
          onChangeAtomMatchFlags={onChangeGlossaryEntryAtomMatchFlags}
          onDeleteAtom={onDeleteGlossaryEntryAtom}
          onReorderAtom={onReorderGlossaryEntryAtom}
          onAssignTag={onAssignGlossaryEntryTag}
          onUnassignTag={onUnassignGlossaryEntryTag}
          onReorderAssignedTag={onReorderAssignedGlossaryEntryTag}
          onOpenTagManager={onOpenGlossaryTagManager}
          onDeleteEntry={onDeleteGlossaryEntry}
          readOnly={isProjectOwnedReadOnly}
          markerGlyph={markerGlyph}
          expectedLineEnding={expectedLineEnding}
          newFileLineEndingFallback={newFileLineEndingFallback}
          whitespaceSettings={whitespaceSettings}
          undoHistoryMinDepth={undoHistoryMinDepth}
        />
      );
  }
}

interface MarkdownEditorSurfaceProps {
  document: CurrentDocument;
  documentKey: string;
  /** #392: see EditorSurfaceProps's own doc comment. */
  documentStates?: Map<string, MarkdownEditorDocumentState>;
  previewUpdateDelayMs: number;
  newFileLineEndingFallback: NewFileLineEnding;
  expectedLineEnding: ExpectedLineEnding;
  markerGlyph: LineEndingMarkerGlyph;
  /** #394 Step 1: see EditorSurfaceProps's own doc comment. */
  undoHistoryMinDepth: number;
  selectionHighlightMode: SelectionHighlightMode;
  findGutterMarkers: boolean;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
  /** #424 Slice 7: glossary "nearby" relation search range (effective). */
  glossaryNearbySearchSettings: ActiveGlossaryNearbySettings;
  projectRootPath: string | null;
  glossaryRefreshToken: number;
  translate: Translate;
  soundFeedback: SoundFeedbackPlayer;
  soundSettings: WorkbenchSoundSettings;
  readOnly: boolean;
  onChangeMarkdownContent: (
    content: string,
    lineEndingBreaks: LineEndingBreakSet
  ) => void;
  onParagraphIndentControllerChange: (
    controller: MarkdownEditorParagraphIndentController | null
  ) => void;
  onViewStateControllerChange: (
    controller: MarkdownEditorViewStateController | null
  ) => void;
  onImageAttachmentPaste?: MarkdownImageAttachmentPasteHandler;
  onImageAttachmentPositionControllerChange?: (
    controller: MarkdownImageAttachmentPositionController | null
  ) => void;
  imageAttachmentSourceDocumentId?: string;
  imageAttachmentSourceEditorId?: string;
  onViewStateSnapshot: (
    outgoingDocumentKey: string,
    viewState: EditorViewState | null
  ) => void;
  onViewStateDirty: () => void;
  onMarkdownVisibleRangeChange?: (
    range: EditorVisibleTextRange | null
  ) => void;
  restoreViewState:
    | { readonly key: string; readonly viewState: unknown }
    | null;
  onRestoreViewStateApplied: (key: string) => void;
  focusRequest: MarkdownEditorFocusRequest | null;
  onFocusRequestApplied: (requestId: number) => void;
  pendingSelection: PendingMarkdownSelection | null;
  onPendingSelectionApplied: () => void;
  ratio: number;
  onChangeRatio: (ratio: number) => void;
  documentOpenId: string | null;
  onDocumentOpenPreviewRenderStarted: (
    documentOpenId: string,
    previewRenderStartedAt: number
  ) => void;
  onDocumentOpenPreviewRendered: (
    documentOpenId: string,
    previewRenderDurationMs: number,
    aggregateMetrics: DocumentOpenAggregateMetrics
  ) => void;
  onDocumentOpenPreviewDomCommitted: (
    documentOpenId: string,
    durationMs: number,
    previewNodeCount: number
  ) => void;
  onDocumentOpenPreviewDecorationCompleted: (
    documentOpenId: string,
    durationMs: number,
    visitedTextNodeCount: number,
    decoratedNodeCount: number,
    matchCount: number
  ) => void;
  onDocumentOpenPreviewFrameObserved: (
    documentOpenId: string,
    durationMs: number
  ) => void;
  onViewportChanged: (details: ViewportSizeDetails) => void;
}

function MarkdownEditorSurface({
  document,
  documentKey,
  documentStates,
  previewUpdateDelayMs,
  newFileLineEndingFallback,
  expectedLineEnding,
  markerGlyph,
  undoHistoryMinDepth,
  selectionHighlightMode,
  findGutterMarkers,
  whitespaceSettings,
  glossaryNearbySearchSettings,
  projectRootPath,
  glossaryRefreshToken,
  translate,
  soundFeedback,
  soundSettings,
  readOnly,
  onChangeMarkdownContent,
  onParagraphIndentControllerChange,
  onViewStateControllerChange,
  onImageAttachmentPaste,
  onImageAttachmentPositionControllerChange,
  imageAttachmentSourceDocumentId,
  imageAttachmentSourceEditorId,
  onViewStateSnapshot,
  onViewStateDirty,
  onMarkdownVisibleRangeChange,
  restoreViewState,
  onRestoreViewStateApplied,
  focusRequest,
  onFocusRequestApplied,
  pendingSelection,
  onPendingSelectionApplied,
  ratio,
  onChangeRatio,
  documentOpenId,
  onDocumentOpenPreviewRenderStarted,
  onDocumentOpenPreviewRendered,
  onDocumentOpenPreviewDomCommitted,
  onDocumentOpenPreviewDecorationCompleted,
  onDocumentOpenPreviewFrameObserved,
  onViewportChanged
}: MarkdownEditorSurfaceProps): JSX.Element {
  const content = currentDocumentContent(document);
  // #253: only converted to a plain array (an O(n) walk of the tracked
  // breaks) when the document identity itself changes — never per
  // keystroke. For the same documentKey, MarkdownEditor ignores this prop
  // entirely after its initial mount/reconfigure, so recomputing it on
  // every edit would be pure waste (and, for a document with many tracked
  // breaks, a real per-keystroke cost this Issue explicitly avoids).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialLineEndingBreaks = useMemo(
    () => lineEndingBreakSetToArray(document.lineEndingBreaks),
    [documentKey]
  );
  // #250: the preview is rendered from a debounced trailing view of
  // `content`, not `content` itself — see useDebouncedPreviewContent. The
  // CodeMirror editor below still receives `content` directly and is
  // unaffected by preview timing.
  const previewSourceContent = useDebouncedPreviewContent(
    documentKey,
    content,
    previewUpdateDelayMs
  );
  // #409: only a project document has a project-root-relative path to
  // resolve project-local image links against; a standalone `.md` file
  // renders image links verbatim, as before.
  const previewSourceProjectRelativePath =
    currentProjectRelativePath(document);
  // #412: a Markdown document Preview anchors links at the document's own
  // folder (`sourceFile`); a standalone / non-project document does not
  // rewrite at all (`none`). The Glossary vocabulary Preview uses
  // `projectRoot` instead — see GlossaryEditor.tsx. Memoized so it is a
  // stable prop identity for MarkdownEditor's effect deps.
  const previewImageResolution = useMemo<ProjectLocalImageResolutionContext>(
    () =>
      previewSourceProjectRelativePath !== null
        ? {
            kind: "sourceFile",
            sourceMarkdownProjectRelativePath: previewSourceProjectRelativePath
          }
        : { kind: "none" },
    [previewSourceProjectRelativePath]
  );
  // #250 follow-up: see useMemoizedPreviewRender above — markdown-it only
  // re-runs when previewSourceContent changes, not on every keystroke
  // rerender of this component.
  const previewRender = useMemoizedPreviewRender(
    previewSourceContent,
    previewImageResolution
  );
  const previewHtml = previewRender.html;
  const previewRenderStartedAt = previewRender.startedAt;
  const previewRenderDurationMs = previewRender.durationMs;
  // #411 / #412: broken-image-link diagnostics use the SAME resolution
  // context as the Preview (`sourceFile` for a project document), but are
  // disabled (`none`) for a read-only document.
  const imageLinkDiagnosticsResolutionContext = useMemo<
    ProjectLocalImageResolutionContext
  >(
    () => (readOnly ? { kind: "none" } : previewImageResolution),
    [readOnly, previewImageResolution]
  );
  const formatImageLinkDiagnosticMessage = useCallback(
    (reason: MarkdownImageLinkDiagnosticReason, src: string) =>
      formatMarkdownImageLinkDiagnosticMessage(translate, reason, src),
    [translate]
  );
  const { entries: glossaryEntries, surfaceIndex } =
    useGlossaryEntriesForMatching(projectRootPath, glossaryRefreshToken);
  // #390 PoC: stable identity per `entries` value so MarkdownEditor's
  // effect-driven ref refresh doesn't fire on every unrelated re-render.
  const glossaryCompletion = useMemo(
    () => ({ entries: glossaryEntries }),
    [glossaryEntries]
  );
  // #424 Slice 4: project glossary atoms for the Find panel's `語彙` picker —
  // project-ordered, each tagged with whether it is its entry's representative
  // form. The picker inserts an atom's RAW value into the query.
  const findGlossaryCandidates = useMemo(
    () => collectFindGlossaryCandidates(glossaryEntries),
    [glossaryEntries]
  );
  const reportedDocumentOpenIdRef = useRef<string | null>(null);
  const editorPaneRef = useRef<HTMLElement | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);

  // -------------------------------------------------------------------------
  // #424: active-document Find panel.
  //
  // Everything is local to this component — the panel searches only THIS
  // editor's current buffer (`content`), navigation reuses the same
  // "select + reveal" transaction the Outline / Go to Line jumps use (via
  // the dedicated `extraPendingSelection` prop), closing returns focus
  // through `extraFocusRequest`, and "マークする" highlights ride the
  // `activeFindHighlight` prop. No App.tsx wiring, no project-wide Search.
  // -------------------------------------------------------------------------
  // #425 follow-up: seed from the process-lived store (activeFindSessionStore).
  // `open` / `mode` are surface-global (survive tab switch AND a Settings-tab
  // round trip that unmounts this component). Everything else is per
  // `documentKey`. Read once here; the mirror effects below keep the store in
  // sync, and the render-phase swap block re-loads on a tab switch.
  const initialFindUi = useRef(getActiveFindUiState()).current;
  const initialFindDoc = useRef(
    getActiveFindDocumentState(documentKey)
  ).current;
  const [findOpen, setFindOpen] = useState(initialFindUi.open);
  const [findMode, setFindMode] = useState<ActiveFindPanelMode>(
    initialFindUi.mode
  );
  const [findQuery, setFindQuery] = useState(initialFindDoc.query);
  const [findReplaceText, setFindReplaceText] = useState(
    initialFindDoc.replaceText
  );
  const [findOptions, setFindOptions] = useState<ActiveDocumentFindOptions>(
    initialFindDoc.options
  );
  // #424 Slice 6: text vs Glossary Atom search. `search` selects multiple atoms
  // (`findSearchGlossaryAtomIds` + `findGlossaryRelation`), `replace` selects
  // one (`findReplaceGlossaryAtomId`); the two selections are kept SEPARATE so
  // switching tabs never silently reuses the other's picks.
  const [findQueryKind, setFindQueryKind] = useState<"text" | "glossary">(
    initialFindDoc.queryKind
  );
  const [findGlossaryRelation, setFindGlossaryRelation] =
    useState<ActiveGlossarySearchRelation>(initialFindDoc.glossaryRelation);
  const [findSearchGlossaryAtomIds, setFindSearchGlossaryAtomIds] = useState<
    string[]
  >(() => [...initialFindDoc.searchGlossaryAtomIds]);
  const [findReplaceGlossaryAtomId, setFindReplaceGlossaryAtomId] = useState<
    string | null
  >(initialFindDoc.replaceGlossaryAtomId);
  // #424 Slice 3: the active editor's replace-transaction controller, captured
  // by wrapping the bubble-up callback so replace-current can dispatch a real
  // `input.replace` transaction without any App.tsx wiring. `ready` mirrors it
  // in state so the button's enabled/disabled is reactive.
  const findReplaceControllerRef =
    useRef<MarkdownEditorParagraphIndentController | null>(null);
  const [findControllerReady, setFindControllerReady] = useState(false);
  const handleParagraphIndentControllerChange = useCallback(
    (controller: MarkdownEditorParagraphIndentController | null) => {
      findReplaceControllerRef.current = controller;
      setFindControllerReady(controller !== null);
      onParagraphIndentControllerChange(controller);
    },
    [onParagraphIndentControllerChange]
  );
  // #424 Slice 2: "マークする" defaults ON — a Find panel that highlights
  // nothing reads as broken. The toggle lets the user quiet it.
  const [findMarkAll, setFindMarkAll] = useState(initialFindDoc.markAll);
  const [findActiveIndex, setFindActiveIndex] = useState<number | null>(null);
  const [findFocusToken, setFindFocusToken] = useState(0);
  const [findExtraSelection, setFindExtraSelection] = useState<{
    start: number;
    end: number;
    scrollY: "center";
    focusEditor: false;
  } | null>(null);
  const [findFocusRequest, setFindFocusRequest] =
    useState<MarkdownEditorFocusRequest | null>(null);
  const findFocusRequestSeqRef = useRef(0);
  // The (query + options) combination the panel last auto-jumped for — so
  // editing the document under an open panel updates the count without
  // yanking the viewport, but changing a search input DOES re-seed.
  const findSeededInputKeyRef = useRef<string | null>(null);

  // #425 follow-up: which `documentKey` the search-condition state above
  // currently belongs to. Diverges from `documentKey` for exactly one render
  // on a tab switch, when the render-phase block below swaps the state over.
  const [findStateDocumentKey, setFindStateDocumentKey] = useState(documentKey);

  const currentFindDocumentState: ActiveFindDocumentState = {
    query: findQuery,
    replaceText: findReplaceText,
    queryKind: findQueryKind,
    options: findOptions,
    glossaryRelation: findGlossaryRelation,
    searchGlossaryAtomIds: findSearchGlossaryAtomIds,
    replaceGlossaryAtomId: findReplaceGlossaryAtomId,
    markAll: findMarkAll
  };

  // A genuine Markdown tab switch: adopt the incoming document's saved search
  // conditions (or the defaults) SYNCHRONOUSLY during render — the same pattern
  // `useDebouncedPreviewContent` above uses for `documentKey` changes, so match
  // recomputation never flashes the previous document's query even for a frame.
  // The panel's open/mode is untouched (that is surface-global). Only the
  // derived state (current-match index, pending selection) is dropped.
  if (findStateDocumentKey !== documentKey) {
    setFindStateDocumentKey(documentKey);
    const incoming = getActiveFindDocumentState(documentKey);
    setFindQuery(incoming.query);
    setFindReplaceText(incoming.replaceText);
    setFindQueryKind(incoming.queryKind);
    setFindOptions(incoming.options);
    setFindGlossaryRelation(incoming.glossaryRelation);
    setFindSearchGlossaryAtomIds([...incoming.searchGlossaryAtomIds]);
    setFindReplaceGlossaryAtomId(incoming.replaceGlossaryAtomId);
    setFindMarkAll(incoming.markAll);
    setFindActiveIndex(null);
    setFindExtraSelection(null);
  }

  // #425 follow-up: mirror the current search conditions into the store under
  // the document they belong to (`findStateDocumentKey`, NOT `documentKey` —
  // during the one-render swap gap they differ, and writing under the new key
  // then would clobber the incoming document's saved state). Document-derived
  // state (matches / current index / decorations / gutter markers) is NOT
  // persisted — it is recomputed for the active document.
  useEffect(() => {
    setActiveFindDocumentState(findStateDocumentKey, {
      query: findQuery,
      replaceText: findReplaceText,
      queryKind: findQueryKind,
      options: findOptions,
      glossaryRelation: findGlossaryRelation,
      searchGlossaryAtomIds: findSearchGlossaryAtomIds,
      replaceGlossaryAtomId: findReplaceGlossaryAtomId,
      markAll: findMarkAll
    });
  }, [
    findStateDocumentKey,
    findQuery,
    findReplaceText,
    findQueryKind,
    findOptions,
    findGlossaryRelation,
    findSearchGlossaryAtomIds,
    findReplaceGlossaryAtomId,
    findMarkAll
  ]);

  // Surface-global UI state (panel open + Find/Replace mode) — survives a tab
  // switch and this component's own unmount (Settings-tab round trip).
  useEffect(() => {
    setActiveFindUiState({ open: findOpen, mode: findMode });
  }, [findOpen, findMode]);

  // Unmount safety net: a change committed the same tick as an unmount might
  // not flush the mirror effect first. Keep a live snapshot (updated in an
  // effect, never during render) and persist it on the way out so a
  // Settings-tab round trip never drops the last keystroke.
  const findStateDocumentKeyRef = useRef(findStateDocumentKey);
  const currentFindDocumentStateRef = useRef(currentFindDocumentState);
  useEffect(() => {
    findStateDocumentKeyRef.current = findStateDocumentKey;
    currentFindDocumentStateRef.current = currentFindDocumentState;
  });
  useEffect(
    () => () => {
      setActiveFindDocumentState(
        findStateDocumentKeyRef.current,
        currentFindDocumentStateRef.current
      );
    },
    []
  );

  // #424 Slice 6: the selected glossary atom ids for the ACTIVE tab, and the
  // shared-matcher terms they resolve to (raw value + each atom's matchFlags).
  const findGlossarySelectedAtomIds = useMemo(
    () =>
      findMode === "replace"
        ? findReplaceGlossaryAtomId !== null
          ? [findReplaceGlossaryAtomId]
          : []
        : findSearchGlossaryAtomIds,
    [findMode, findReplaceGlossaryAtomId, findSearchGlossaryAtomIds]
  );
  const findGlossaryTerms = useMemo(
    () =>
      buildActiveGlossaryFindTerms(
        findGlossaryCandidates,
        findGlossarySelectedAtomIds
      ),
    [findGlossaryCandidates, findGlossarySelectedAtomIds]
  );

  const findEvaluation = useMemo(() => {
    if (!findOpen) {
      return { matches: [], regexError: null };
    }
    if (findQueryKind === "glossary") {
      return {
        matches:
          findGlossaryTerms.length > 0
            ? runActiveGlossaryFind(
                content,
                findGlossaryTerms,
                // Relation is a Search-tab concept; a single Replace-tab atom
                // is the same under "any" / "all" / "nearby".
                findMode === "replace" ? "any" : findGlossaryRelation,
                glossaryNearbySearchSettings
              )
            : [],
        regexError: null
      };
    }
    return findQuery.length > 0
      ? evaluateActiveDocumentFind(content, findQuery, findOptions)
      : { matches: [], regexError: null };
  }, [
    findOpen,
    findQueryKind,
    findGlossaryTerms,
    findMode,
    findGlossaryRelation,
    glossaryNearbySearchSettings,
    findQuery,
    findOptions,
    content
  ]);
  const findMatches = findEvaluation.matches;
  const findRegexError = findEvaluation.regexError;
  const findMatchCount = findMatches.length;
  const findInputKey = useMemo(
    () =>
      findQueryKind === "glossary"
        ? JSON.stringify([
            "glossary",
            findMode,
            findSearchGlossaryAtomIds,
            findReplaceGlossaryAtomId,
            findGlossaryRelation
          ])
        : JSON.stringify(["text", findQuery, findOptions]),
    [
      findQueryKind,
      findMode,
      findSearchGlossaryAtomIds,
      findReplaceGlossaryAtomId,
      findGlossaryRelation,
      findQuery,
      findOptions
    ]
  );

  // #424 Slice 3: replacement-template error (regex mode only) + the single
  // "can replace-current run" gate, both owner-computed so the panel stays
  // presentational.
  const findTemplateError = useMemo<ReplacementTemplateError | null>(
    () =>
      // Glossary mode's replacement text is always literal — no template.
      findOpen && findMode === "replace" && findQueryKind === "text"
        ? activeDocumentReplacementTemplateError(
            findReplaceText,
            findOptions,
            findQuery
          )
        : null,
    [findOpen, findMode, findQueryKind, findReplaceText, findOptions, findQuery]
  );
  // #424 Slice 6: in glossary mode "there is a query" means "an atom is
  // selected" (text mode: the query string is non-empty).
  const findHasReplaceQuery =
    findQueryKind === "glossary"
      ? findReplaceGlossaryAtomId !== null
      : findQuery.length > 0;
  const findReplaceCurrentEnabled =
    findOpen &&
    findMode === "replace" &&
    !readOnly &&
    findControllerReady &&
    findHasReplaceQuery &&
    findRegexError === null &&
    findTemplateError === null &&
    findMatchCount > 0 &&
    findActiveIndex !== null;
  // #424 Slice 4: replace-all shares every replace-current gate EXCEPT the
  // "there is a current match" one — it acts on the whole match set.
  const findReplaceAllEnabled =
    findOpen &&
    findMode === "replace" &&
    !readOnly &&
    findControllerReady &&
    findHasReplaceQuery &&
    findRegexError === null &&
    findTemplateError === null &&
    findMatchCount > 0;

  const jumpToFindMatch = useCallback(
    (match: { startOffset: number; endOffset: number }) => {
      setFindExtraSelection({
        start: match.startOffset,
        end: match.endOffset,
        scrollY: "center",
        focusEditor: false
      });
    },
    []
  );

  // Re-seed the active index + jump when a SEARCH INPUT changes (query or an
  // option) — not on every keystroke in the document.
  useEffect(() => {
    if (!findOpen) {
      findSeededInputKeyRef.current = null;
      return;
    }
    if (findSeededInputKeyRef.current === findInputKey) {
      return;
    }
    findSeededInputKeyRef.current = findInputKey;
    if (findMatches.length > 0) {
      setFindActiveIndex(0);
      jumpToFindMatch(findMatches[0]);
    } else {
      setFindActiveIndex(null);
    }
  }, [findOpen, findInputKey, findMatches, jumpToFindMatch]);

  // #424 Slice 2: clamp the active index into range after the match set
  // changes under an open panel (document edited, count shrank).
  useEffect(() => {
    setFindActiveIndex((current) =>
      clampActiveFindIndex(current, findMatchCount)
    );
  }, [findMatchCount]);

  // #424 Slice 2: the "mark all" highlight set for the active document —
  // null (no highlights) unless the panel is open, mark-all is on, the
  // query is valid and non-empty, and there is at least one match.
  const activeFindHighlight = useMemo<ActiveFindHighlightSpec | null>(() => {
    if (!findOpen || !findMarkAll || findMatchCount === 0) {
      return null;
    }
    return {
      matches: findMatches.map((match) => ({
        from: match.startOffset,
        to: match.endOffset
      })),
      activeIndex: findActiveIndex
    };
  }, [findOpen, findMarkAll, findMatchCount, findMatches, findActiveIndex]);

  const activeFindGutterMarkers =
    useMemo<ActiveFindGutterMarkerSpec | null>(() => {
      if (!findOpen || findMatchCount === 0) {
        return null;
      }

      return {
        matches: findMatches.map((match) => ({
          from: match.startOffset,
          to: match.endOffset
        }))
      };
    }, [findOpen, findMatchCount, findMatches]);

  // The actual tab-switch handling — adopting the incoming document's search
  // conditions and dropping the derived state (current-match index, pending
  // selection) — happens in the render-phase swap block above; `open` / `mode`
  // stay surface-global.

  const activeFindConfig = useMemo<MarkdownEditorActiveFindConfig>(
    () => ({
      // #425 follow-up: idempotent open. `setFindMode(mode)` makes Ctrl+F force
      // Search and Ctrl+H force Replace even when the panel is already open;
      // `findFocusToken` re-focuses the query input.
      requestOpen: (mode, initialQuery) => {
        setFindOpen(true);
        setFindMode(mode);
        setFindFocusToken((token) => token + 1);
        if (initialQuery.length > 0) {
          setFindQuery(initialQuery);
        }
      }
    }),
    []
  );

  const handleFindModeChange = useCallback((mode: ActiveFindPanelMode) => {
    setFindMode(mode);
    // Return focus to the query input (the panel's focus effect handles it).
    setFindFocusToken((token) => token + 1);
  }, []);

  const handleFindQueryChange = useCallback((next: string) => {
    setFindQuery(next);
  }, []);

  const handleFindReplaceTextChange = useCallback((next: string) => {
    setFindReplaceText(next);
  }, []);

  const handleFindToggleOption = useCallback(
    (key: keyof ActiveDocumentFindOptions) => {
      setFindOptions((current) =>
        toggleActiveDocumentFindOption(current, key)
      );
    },
    []
  );

  const handleFindToggleMarkAll = useCallback(() => {
    setFindMarkAll((current) => !current);
  }, []);

  const handleFindNext = useCallback(() => {
    const nextIndex = resolveActiveFindCursor(
      findMatches.length,
      findActiveIndex,
      "next"
    );
    setFindActiveIndex(nextIndex);
    if (nextIndex !== null) {
      jumpToFindMatch(findMatches[nextIndex]);
    }
  }, [findMatches, findActiveIndex, jumpToFindMatch]);

  const handleFindPrevious = useCallback(() => {
    const nextIndex = resolveActiveFindCursor(
      findMatches.length,
      findActiveIndex,
      "previous"
    );
    setFindActiveIndex(nextIndex);
    if (nextIndex !== null) {
      jumpToFindMatch(findMatches[nextIndex]);
    }
  }, [findMatches, findActiveIndex, jumpToFindMatch]);

  // #424 Slice 3: replace the CURRENT match only, through the active editor's
  // `input.replace` transaction (one undo step). Re-evaluates against the
  // live buffer text right before dispatch so a stale `content` prop can
  // never place the edit at the wrong offset. Never touches disk, an
  // inactive tab, a closed document, or the project-wide replace path.
  const handleFindReplaceCurrent = useCallback(() => {
    if (readOnly) {
      return;
    }
    const controller = findReplaceControllerRef.current;
    if (!controller) {
      return;
    }

    const liveText = controller.getBufferText() ?? content;

    // #424 Slice 6: glossary mode — replace the current occurrence of the
    // selected atom value with the LITERAL replace text (no regex template).
    if (findQueryKind === "glossary") {
      const terms = buildActiveGlossaryFindTerms(
        findGlossaryCandidates,
        findReplaceGlossaryAtomId !== null ? [findReplaceGlossaryAtomId] : []
      );
      if (terms.length === 0) {
        return;
      }
      const matches = runActiveGlossaryFind(liveText, terms, "any");
      const index = clampActiveFindIndex(findActiveIndex, matches.length);
      if (index === null) {
        return;
      }
      const match = matches[index];
      const applied = controller.applyReplaceInBufferChanges([
        { from: match.startOffset, to: match.endOffset, insert: findReplaceText }
      ]);
      if (!applied) {
        return;
      }
      const afterMatches = runActiveGlossaryFind(
        controller.getBufferText() ?? liveText,
        terms,
        "any"
      );
      const nextIndex = resolveActiveFindIndexAfterReplacement(
        afterMatches,
        match.startOffset
      );
      setFindActiveIndex(nextIndex);
      if (nextIndex !== null) {
        jumpToFindMatch(afterMatches[nextIndex]);
      }
      return;
    }

    if (findRegexError !== null) {
      return;
    }
    const evaluation = evaluateActiveDocumentFind(
      liveText,
      findQuery,
      findOptions
    );
    if (evaluation.regexError !== null || evaluation.matches.length === 0) {
      return;
    }
    const index = clampActiveFindIndex(
      findActiveIndex,
      evaluation.matches.length
    );
    if (index === null) {
      return;
    }
    const match = evaluation.matches[index];

    const built = buildActiveDocumentReplacement(
      liveText,
      match,
      findReplaceText,
      findOptions,
      findQuery
    );
    if (!built.ok) {
      return;
    }

    const applied = controller.applyReplaceInBufferChanges([
      {
        from: match.startOffset,
        to: match.endOffset,
        insert: built.replacement
      }
    ]);
    if (!applied) {
      return;
    }

    // The buffer just changed — recompute against the NEW live text and move
    // to the first match at/after where the replacement started.
    const afterText = controller.getBufferText() ?? liveText;
    const afterMatches = evaluateActiveDocumentFind(
      afterText,
      findQuery,
      findOptions
    ).matches;
    const nextIndex = resolveActiveFindIndexAfterReplacement(
      afterMatches,
      match.startOffset
    );
    setFindActiveIndex(nextIndex);
    if (nextIndex !== null) {
      jumpToFindMatch(afterMatches[nextIndex]);
    }
  }, [
    readOnly,
    findQueryKind,
    findGlossaryCandidates,
    findReplaceGlossaryAtomId,
    findRegexError,
    content,
    findQuery,
    findOptions,
    findReplaceText,
    findActiveIndex,
    jumpToFindMatch
  ]);

  // #424 Slice 4: replace EVERY match in the active document in ONE
  // `input.replace` transaction (one undo step). Re-evaluates against the live
  // buffer immediately before dispatch and builds every change from that SAME
  // snapshot, so no stale offset is ever used. Never touches disk, an inactive
  // tab, a closed document, or the project-wide replace path.
  const handleFindReplaceAll = useCallback(() => {
    if (readOnly) {
      return;
    }
    const controller = findReplaceControllerRef.current;
    if (!controller) {
      return;
    }

    const liveText = controller.getBufferText() ?? content;

    // #424 Slice 6: glossary mode — replace every occurrence of the selected
    // atom value with the LITERAL replace text, in one transaction.
    if (findQueryKind === "glossary") {
      const terms = buildActiveGlossaryFindTerms(
        findGlossaryCandidates,
        findReplaceGlossaryAtomId !== null ? [findReplaceGlossaryAtomId] : []
      );
      if (terms.length === 0) {
        return;
      }
      const matches = runActiveGlossaryFind(liveText, terms, "any");
      if (matches.length === 0) {
        return;
      }
      const changes = matches.map((match) => ({
        from: match.startOffset,
        to: match.endOffset,
        insert: findReplaceText
      }));
      const applied = controller.applyReplaceInBufferChanges(changes);
      if (!applied) {
        return;
      }
      const afterMatches = runActiveGlossaryFind(
        controller.getBufferText() ?? liveText,
        terms,
        "any"
      );
      const nextIndex = resolveActiveFindIndexAfterReplaceAll(afterMatches);
      setFindActiveIndex(nextIndex);
      if (nextIndex !== null) {
        jumpToFindMatch(afterMatches[nextIndex]);
      }
      return;
    }

    if (findRegexError !== null || findQuery.length === 0) {
      return;
    }
    const evaluation = evaluateActiveDocumentFind(
      liveText,
      findQuery,
      findOptions
    );
    if (evaluation.regexError !== null || evaluation.matches.length === 0) {
      return;
    }

    const built = buildActiveDocumentReplaceAllChanges(
      liveText,
      evaluation.matches,
      findReplaceText,
      findOptions,
      findQuery
    );
    if (!built.ok || built.changes.length === 0) {
      return;
    }

    const applied = controller.applyReplaceInBufferChanges(built.changes);
    if (!applied) {
      return;
    }

    // The buffer just changed wholesale — re-search the NEW live text and land
    // on the first remaining match (or clear the cursor when none remain).
    const afterText = controller.getBufferText() ?? liveText;
    const afterMatches = evaluateActiveDocumentFind(
      afterText,
      findQuery,
      findOptions
    ).matches;
    const nextIndex = resolveActiveFindIndexAfterReplaceAll(afterMatches);
    setFindActiveIndex(nextIndex);
    if (nextIndex !== null) {
      jumpToFindMatch(afterMatches[nextIndex]);
    }
  }, [
    readOnly,
    findQueryKind,
    findGlossaryCandidates,
    findReplaceGlossaryAtomId,
    findRegexError,
    content,
    findQuery,
    findOptions,
    findReplaceText,
    jumpToFindMatch
  ]);

  // #424 Slice 6: the `語彙` icon toggles text ⇄ glossary query kind; the other
  // three just mirror the panel's selectors into local state. The existing
  // `findInputKey` effect re-seeds + jumps whenever any of them change.
  const handleFindQueryKindChange = useCallback((kind: "text" | "glossary") => {
    setFindQueryKind(kind);
    setFindFocusToken((token) => token + 1);
  }, []);
  const handleFindGlossaryRelationChange = useCallback(
    (relation: ActiveGlossarySearchRelation) => {
      setFindGlossaryRelation(relation);
    },
    []
  );
  const handleFindSearchGlossaryAtomIdsChange = useCallback(
    (atomIds: string[]) => {
      setFindSearchGlossaryAtomIds(atomIds);
    },
    []
  );
  const handleFindReplaceGlossaryAtomIdChange = useCallback(
    (atomId: string | null) => {
      setFindReplaceGlossaryAtomId(atomId);
    },
    []
  );

  const handleFindClose = useCallback(() => {
    setFindOpen(false);
    findFocusRequestSeqRef.current += 1;
    setFindFocusRequest({
      id: findFocusRequestSeqRef.current,
      documentKey
    });
  }, [documentKey]);

  const handleFindExtraSelectionApplied = useCallback(() => {
    setFindExtraSelection(null);
  }, []);

  // One-shot measurement (#152, extended #154, #161): fires only when
  // documentOpenId changes (i.e. a new open just applied its editor state
  // and this component has now re-rendered with that document's content),
  // never on ordinary content edits. App.tsx clears documentOpenId after
  // handling this.
  //
  // Guarded by reportedDocumentOpenIdRef against React StrictMode's dev-only
  // double effect invocation (this app renders under <React.StrictMode> —
  // see main.tsx), which would otherwise report the same open twice and
  // duplicate previewRender.started/previewRender.completed/usable/completed
  // in dev/dogfood logs.
  //
  // #163: this is a *passive* effect, so it runs after every layout effect
  // in the tree has already run — including GlossaryPreviewDecorator's
  // (child) useLayoutEffect, which logs previewDom.committed/
  // previewDecoration.completed. previewRenderStartedAt above is captured
  // during *render*, chronologically before that child layout effect runs,
  // but the onDocumentOpenPreviewRenderStarted/onDocumentOpenPreviewRendered
  // calls below don't happen until this passive effect fires — i.e. later
  // than previewDom.committed's own log call. So previewRender.started/
  // previewRender.completed can end up with a *later* seq than
  // previewDom.committed/previewDecoration.completed despite describing an
  // *earlier* moment. See src/shared/debugLog.ts's DebugLogEvent comment:
  // read each event's own durationMs against its documented boundary, not
  // seq/timestamp, to reconstruct actual ordering.
  useEffect(() => {
    if (documentOpenId && reportedDocumentOpenIdRef.current !== documentOpenId) {
      reportedDocumentOpenIdRef.current = documentOpenId;
      onDocumentOpenPreviewRenderStarted(documentOpenId, previewRenderStartedAt);
      onDocumentOpenPreviewRendered(documentOpenId, previewRenderDurationMs, {
        documentCharCount: documentCharCount(content),
        documentLineCount: documentLineCount(content),
        documentMaxLineLength: documentMaxLineLength(content),
        appWindowWidth: window.innerWidth,
        appWindowHeight: window.innerHeight,
        editorPaneWidth: editorPaneRef.current?.clientWidth ?? 0,
        editorPaneHeight: editorPaneRef.current?.clientHeight ?? 0,
        previewPaneWidth: previewPaneRef.current?.clientWidth ?? 0,
        previewPaneHeight: previewPaneRef.current?.clientHeight ?? 0
      });
    }
    // Deliberately keyed on documentOpenId alone: previewRenderStartedAt /
    // previewRenderDurationMs / content are read from this same render's
    // closure, but must not themselves be dependencies, or every content
    // edit (not just an open) would re-fire.
  }, [documentOpenId]);
  useDebouncedViewportChangeDebugLog(
    editorPaneRef,
    previewPaneRef,
    onViewportChanged
  );
  const isNarrow = useIsNarrowMarkdownWorkspace();
  const workspaceRef = useRef<HTMLElement | null>(null);
  const ratioAtDragStartRef = useRef(ratio);
  const ratioDrag = useHorizontalDrag({
    onDragStart: () => {
      ratioAtDragStartRef.current = ratio;
    },
    onDragMove: (deltaX) => {
      const containerWidth = workspaceRef.current?.clientWidth;

      if (!containerWidth) {
        return;
      }

      const nextRatio = clampMarkdownEditorPreviewRatio(
        ratioAtDragStartRef.current + deltaX / containerWidth,
        containerWidth
      );

      onChangeRatio(nextRatio);
    }
  });

  useEffect(() => {
    function handleWindowResize(): void {
      const containerWidth = workspaceRef.current?.clientWidth;

      if (!containerWidth) {
        return;
      }

      const clampedRatio = clampMarkdownEditorPreviewRatio(
        ratio,
        containerWidth
      );

      if (clampedRatio !== ratio) {
        onChangeRatio(clampedRatio);
      }
    }

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [ratio, onChangeRatio]);

  return (
    <section
      className="workspace"
      aria-label={translate("workspace.markdownWorkspace")}
      ref={workspaceRef}
      style={
        isNarrow
          ? undefined
          : {
              gridTemplateColumns: `minmax(0, ${ratio}fr) 6px minmax(0, ${1 - ratio}fr)`
            }
      }
    >
      <section
        className="pane"
        aria-label={translate("workspace.markdownEditor")}
        ref={editorPaneRef}
      >
        <div className="paneHeader">
          {translate("workspace.editor")}
        </div>
        {findOpen ? (
          <ActiveFindPanel
            translate={translate}
            mode={findMode}
            query={findQuery}
            replaceText={findReplaceText}
            options={findOptions}
            markAll={findMarkAll}
            regexError={findRegexError}
            templateError={findTemplateError}
            readOnly={readOnly}
            replaceCurrentEnabled={findReplaceCurrentEnabled}
            replaceAllEnabled={findReplaceAllEnabled}
            glossaryCandidates={findGlossaryCandidates}
            queryKind={findQueryKind}
            glossaryRelation={findGlossaryRelation}
            glossaryNearbySettings={glossaryNearbySearchSettings}
            searchGlossaryAtomIds={findSearchGlossaryAtomIds}
            replaceGlossaryAtomId={findReplaceGlossaryAtomId}
            matchCount={findMatchCount}
            activeIndex={findActiveIndex}
            focusToken={findFocusToken}
            onModeChange={handleFindModeChange}
            onQueryChange={handleFindQueryChange}
            onReplaceTextChange={handleFindReplaceTextChange}
            onToggleOption={handleFindToggleOption}
            onToggleMarkAll={handleFindToggleMarkAll}
            onReplaceCurrent={handleFindReplaceCurrent}
            onReplaceAll={handleFindReplaceAll}
            onQueryKindChange={handleFindQueryKindChange}
            onGlossaryRelationChange={handleFindGlossaryRelationChange}
            onSearchGlossaryAtomIdsChange={handleFindSearchGlossaryAtomIdsChange}
            onReplaceGlossaryAtomIdChange={handleFindReplaceGlossaryAtomIdChange}
            onNext={handleFindNext}
            onPrevious={handleFindPrevious}
            onClose={handleFindClose}
          />
        ) : null}
        <MarkdownEditor
          value={content}
          onChange={onChangeMarkdownContent}
          activeFind={activeFindConfig}
          extraPendingSelection={findExtraSelection}
          onExtraPendingSelectionApplied={handleFindExtraSelectionApplied}
          extraFocusRequest={findFocusRequest}
          activeFindHighlight={activeFindHighlight}
          activeFindGutterMarkers={activeFindGutterMarkers}
          onParagraphIndentControllerChange={
            handleParagraphIndentControllerChange
          }
          onViewStateControllerChange={onViewStateControllerChange}
          onImageAttachmentPaste={onImageAttachmentPaste}
          onImageAttachmentPositionControllerChange={
            onImageAttachmentPositionControllerChange
          }
          imageAttachmentSourceDocumentId={imageAttachmentSourceDocumentId}
          imageAttachmentSourceEditorId={imageAttachmentSourceEditorId}
          imageLinkDiagnosticsResolutionContext={
            imageLinkDiagnosticsResolutionContext
          }
          formatImageLinkDiagnosticMessage={formatImageLinkDiagnosticMessage}
          onViewStateSnapshot={onViewStateSnapshot}
          onViewStateDirty={onViewStateDirty}
          onVisibleRangeChange={onMarkdownVisibleRangeChange}
          restoreViewState={restoreViewState}
          onRestoreViewStateApplied={onRestoreViewStateApplied}
          focusRequest={focusRequest}
          onFocusRequestApplied={onFocusRequestApplied}
          documentKey={documentKey}
          documentStates={documentStates}
          initialLineEndingBreaks={initialLineEndingBreaks}
          newFileLineEndingFallback={newFileLineEndingFallback}
          expectedLineEnding={expectedLineEnding}
          markerGlyph={markerGlyph}
          undoHistoryMinDepth={undoHistoryMinDepth}
          selectionHighlightMode={selectionHighlightMode}
          findGutterMarkers={findGutterMarkers}
          whitespaceSettings={whitespaceSettings}
          pendingSelection={pendingSelection}
          onPendingSelectionApplied={onPendingSelectionApplied}
          contextSurface="markdownEditor"
          soundFeedback={soundFeedback}
          soundSettings={soundSettings}
          readOnly={readOnly}
          glossaryCompletion={glossaryCompletion}
        />
      </section>

      {!isNarrow ? (
        <div
          className="markdownWorkspaceResizeHandle"
          role="separator"
          aria-orientation="vertical"
          aria-label={translate("workbench.markdownEditorPreviewResizeHandle")}
          onPointerDown={ratioDrag.onPointerDown}
          onPointerMove={ratioDrag.onPointerMove}
          onPointerUp={ratioDrag.onPointerUp}
          onPointerCancel={ratioDrag.onPointerCancel}
        />
      ) : null}

      <section
        className="pane"
        aria-label={translate("workspace.markdownPreview")}
        ref={previewPaneRef}
      >
        <div className="paneHeader">
          {translate("workspace.preview")}
        </div>
        <GlossaryPreviewDecorator
          previewHtml={previewHtml}
          surfaceIndex={surfaceIndex}
          documentOpenId={documentOpenId}
          previewRenderStartedAt={previewRenderStartedAt}
          onPreviewDomCommitted={onDocumentOpenPreviewDomCommitted}
          onPreviewDecorationCompleted={onDocumentOpenPreviewDecorationCompleted}
          onPreviewFrameObserved={onDocumentOpenPreviewFrameObserved}
        />
      </section>
    </section>
  );
}
