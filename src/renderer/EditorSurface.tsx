import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  WorkbenchSoundSettings
} from "../shared/settings";
import type {
  GlossaryEntryKind,
  GlossaryFormMatchBoundary,
  GlossaryFormRelation,
  GlossaryWarningPolicy
} from "../shared/glossary";
import type { Translate } from "../shared/i18n";
import {
  currentDocumentContent,
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
  type MarkdownEditorParagraphIndentController,
  type MarkdownEditorFocusRequest,
  type MarkdownEditorViewStateController
} from "./MarkdownEditor";
import type { EditorViewState } from "./editorViewState";
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
  previewSourceContent: string
): PreviewRenderResult {
  return useMemo(() => {
    const startedAt = performance.now();
    const html = markdownPreviewRenderer.render(previewSourceContent);

    return { html, startedAt, durationMs: performance.now() - startedAt };
  }, [previewSourceContent]);
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
   * `editor.whitespace.*` (#256) — display-only whitespace marker
   * toggles, passed straight through to the Markdown editor. Never
   * affects Save, dirty state, or selection.
   */
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
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
  onViewStateSnapshot: (
    outgoingDocumentKey: string,
    viewState: EditorViewState | null
  ) => void;
  onViewStateDirty: () => void;
  /** #274: persisted #273 View State to re-apply once for the active
   *  Markdown editor's document (null when nothing is pending). */
  restoreActiveEditorViewState:
    | { readonly key: string; readonly viewState: unknown }
    | null;
  onRestoreActiveEditorViewStateApplied: (key: string) => void;
  markdownEditorFocusRequest: MarkdownEditorFocusRequest | null;
  onMarkdownEditorFocusRequestApplied: (requestId: number) => void;
  onChangeGlossaryEntryKind: (kind: GlossaryEntryKind) => void;
  onChangeGlossaryEntryDescription: (description: string) => void;
  onChangeGlossaryEntryCanonicalSurface: (surface: string) => void;
  onChangeGlossaryEntryCanonicalMatchBoundaryStart: (
    matchBoundaryStart: GlossaryFormMatchBoundary
  ) => void;
  onChangeGlossaryEntryCanonicalMatchBoundaryEnd: (
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ) => void;
  onAddGlossaryEntryForm: (relation: GlossaryFormRelation) => void;
  onChangeGlossaryEntryFormSurface: (
    formId: string,
    surface: string
  ) => void;
  onChangeGlossaryEntryFormWarningPolicy: (
    formId: string,
    warningPolicy: GlossaryWarningPolicy
  ) => void;
  onChangeGlossaryEntryFormMatchBoundaryStart: (
    formId: string,
    matchBoundaryStart: GlossaryFormMatchBoundary
  ) => void;
  onChangeGlossaryEntryFormMatchBoundaryEnd: (
    formId: string,
    matchBoundaryEnd: GlossaryFormMatchBoundary
  ) => void;
  onDeleteGlossaryEntryForm: (formId: string) => void;
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
  previewUpdateDelayMs,
  newFileLineEndingFallback,
  expectedLineEnding,
  markerGlyph,
  whitespaceSettings,
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
  onViewStateSnapshot,
  onViewStateDirty,
  restoreActiveEditorViewState,
  onRestoreActiveEditorViewStateApplied,
  markdownEditorFocusRequest,
  onMarkdownEditorFocusRequestApplied,
  onChangeGlossaryEntryKind,
  onChangeGlossaryEntryDescription,
  onChangeGlossaryEntryCanonicalSurface,
  onChangeGlossaryEntryCanonicalMatchBoundaryStart,
  onChangeGlossaryEntryCanonicalMatchBoundaryEnd,
  onAddGlossaryEntryForm,
  onChangeGlossaryEntryFormSurface,
  onChangeGlossaryEntryFormWarningPolicy,
  onChangeGlossaryEntryFormMatchBoundaryStart,
  onChangeGlossaryEntryFormMatchBoundaryEnd,
  onDeleteGlossaryEntryForm,
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
          previewUpdateDelayMs={previewUpdateDelayMs}
          newFileLineEndingFallback={newFileLineEndingFallback}
          expectedLineEnding={expectedLineEnding}
          markerGlyph={markerGlyph}
          whitespaceSettings={whitespaceSettings}
          projectRootPath={projectRootPath}
          glossaryRefreshToken={glossaryRefreshToken}
          translate={translate}
          soundFeedback={soundFeedback}
          soundSettings={soundSettings}
          readOnly={isProjectOwnedReadOnly}
          onChangeMarkdownContent={onChangeMarkdownContent}
          onParagraphIndentControllerChange={onParagraphIndentControllerChange}
          onViewStateControllerChange={onViewStateControllerChange}
          onViewStateSnapshot={onViewStateSnapshot}
          onViewStateDirty={onViewStateDirty}
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
      return (
        <GlossaryEditor
          draft={editor.draft}
          translate={translate}
          onChangeKind={onChangeGlossaryEntryKind}
          onChangeDescription={onChangeGlossaryEntryDescription}
          onChangeCanonicalSurface={onChangeGlossaryEntryCanonicalSurface}
          onChangeCanonicalMatchBoundaryStart={
            onChangeGlossaryEntryCanonicalMatchBoundaryStart
          }
          onChangeCanonicalMatchBoundaryEnd={
            onChangeGlossaryEntryCanonicalMatchBoundaryEnd
          }
          onAddForm={onAddGlossaryEntryForm}
          onChangeFormSurface={onChangeGlossaryEntryFormSurface}
          onChangeFormWarningPolicy={
            onChangeGlossaryEntryFormWarningPolicy
          }
          onChangeFormMatchBoundaryStart={
            onChangeGlossaryEntryFormMatchBoundaryStart
          }
          onChangeFormMatchBoundaryEnd={
            onChangeGlossaryEntryFormMatchBoundaryEnd
          }
          onDeleteForm={onDeleteGlossaryEntryForm}
          onDeleteEntry={onDeleteGlossaryEntry}
          onNavigateToPreviousOccurrence={
            onNavigateToPreviousGlossaryOccurrence
          }
          onNavigateToNextOccurrence={onNavigateToNextGlossaryOccurrence}
          readOnly={isProjectOwnedReadOnly}
        />
      );
  }
}

interface MarkdownEditorSurfaceProps {
  document: CurrentDocument;
  documentKey: string;
  previewUpdateDelayMs: number;
  newFileLineEndingFallback: NewFileLineEnding;
  expectedLineEnding: ExpectedLineEnding;
  markerGlyph: LineEndingMarkerGlyph;
  whitespaceSettings: ApplicationEditorWhitespaceSettings;
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
  onViewStateSnapshot: (
    outgoingDocumentKey: string,
    viewState: EditorViewState | null
  ) => void;
  onViewStateDirty: () => void;
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
  previewUpdateDelayMs,
  newFileLineEndingFallback,
  expectedLineEnding,
  markerGlyph,
  whitespaceSettings,
  projectRootPath,
  glossaryRefreshToken,
  translate,
  soundFeedback,
  soundSettings,
  readOnly,
  onChangeMarkdownContent,
  onParagraphIndentControllerChange,
  onViewStateControllerChange,
  onViewStateSnapshot,
  onViewStateDirty,
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
  // #250 follow-up: see useMemoizedPreviewRender above — markdown-it only
  // re-runs when previewSourceContent changes, not on every keystroke
  // rerender of this component.
  const previewRender = useMemoizedPreviewRender(previewSourceContent);
  const previewHtml = previewRender.html;
  const previewRenderStartedAt = previewRender.startedAt;
  const previewRenderDurationMs = previewRender.durationMs;
  const { entries, surfaceIndex } = useGlossaryEntriesForMatching(
    projectRootPath,
    glossaryRefreshToken
  );
  const reportedDocumentOpenIdRef = useRef<string | null>(null);
  const editorPaneRef = useRef<HTMLElement | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);

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
        <MarkdownEditor
          value={content}
          onChange={onChangeMarkdownContent}
          onParagraphIndentControllerChange={onParagraphIndentControllerChange}
          onViewStateControllerChange={onViewStateControllerChange}
          onViewStateSnapshot={onViewStateSnapshot}
          onViewStateDirty={onViewStateDirty}
          restoreViewState={restoreViewState}
          onRestoreViewStateApplied={onRestoreViewStateApplied}
          focusRequest={focusRequest}
          onFocusRequestApplied={onFocusRequestApplied}
          documentKey={documentKey}
          initialLineEndingBreaks={initialLineEndingBreaks}
          newFileLineEndingFallback={newFileLineEndingFallback}
          expectedLineEnding={expectedLineEnding}
          markerGlyph={markerGlyph}
          whitespaceSettings={whitespaceSettings}
          pendingSelection={pendingSelection}
          onPendingSelectionApplied={onPendingSelectionApplied}
          contextSurface="markdownEditor"
          soundFeedback={soundFeedback}
          soundSettings={soundSettings}
          readOnly={readOnly}
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
          entries={entries}
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
