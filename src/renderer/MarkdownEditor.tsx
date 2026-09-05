import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type ChangeSpec,
  type AnnotationType,
  type StateField
} from "@codemirror/state";
import {
  pergamumContextSurfaceAttribute,
  type EditableContextSurface
} from "../shared/editContextMenu";
import type { EditorVisibleTextRange } from "./editorVisibleRange";
import {
  DEFAULT_EDITOR_SCROLL_ALIGN,
  type EditorScrollAlign
} from "./editorScrollAlign";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph,
  NewFileLineEnding,
  WorkbenchSoundSettings
} from "../shared/settings";
import { whitespaceMarkerLayer } from "./whitespaceRendering/whitespaceMarkerLayer";
import { createVisibilityExtension } from "./editorVisibility/visibilityFeature";
import { createLineEndingVisibilityFeatures } from "./editorVisibility/lineEndMarkerFeature";
import { documentSwitchTransactionSpec } from "./editorLineEndingField";
import type { LineEndingBreakSet } from "./editorLineEndingField";
import type { LineEndingBreak, LineEndingKind } from "./lineEndingTracking";
import {
  playMarkdownEditorInputSound,
  type MarkdownEditorInputSoundEvent,
  type SoundFeedbackPlayer
} from "./soundFeedback";
import type { ParagraphIndentChange } from "./paragraphIndentTransform";
import {
  applyEditorViewState,
  captureEditorViewState,
  type EditorViewState
} from "./editorViewState";
import type { MarkdownEditorGlossaryCompletionConfig } from "./glossaryCompletionExtension";
import {
  createMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "./markdownEditorDocumentState";

export type { MarkdownEditorGlossaryCompletionConfig };

interface MarkdownEditorPendingSelection {
  start: number;
  end: number;
  /** #352: `"center"` for an Outline heading jump, otherwise `"nearest"`. */
  scrollY?: "nearest" | "center";
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string, lineEndingBreaks: LineEndingBreakSet) => void;
  /**
   * Identity of the document currently bound to this editor (#250/#253) —
   * used to tell "the same document, content changed" apart from "a
   * genuinely different document is now shown". Only the latter re-seeds
   * the line-ending tracking field from `initialLineEndingBreaks`. Optional
   * for non-file editors (e.g. GlossaryEditor's description field) that
   * never switch between distinct documents and don't care about
   * line-ending tracking.
   */
  documentKey?: string;
  /**
   * #253: this document's per-break line-ending kinds, as analyzed once
   * from the raw file content at open time (see
   * lineEndingTracking.ts#analyzeLineEndings). Only consulted when
   * `documentKey` changes — never re-read on an ordinary content edit.
   */
  initialLineEndingBreaks?: readonly LineEndingBreak[];
  /**
   * `files.newFile.lineEnding` — the fallback kind for a new line break in
   * a document with no existing tracked breaks. Not a save-time
   * conversion target.
   */
  newFileLineEndingFallback?: NewFileLineEnding;
  /**
   * `editor.lineEnding.expected` (#252) — diagnostic-only: what the
   * line-ending marker/distribution UI compares each tracked break's
   * actual kind against. Never used to decide a new break's kind, convert
   * an existing break, or affect Save. Changing it never makes the
   * document dirty.
   */
  expectedLineEnding?: ExpectedLineEnding;
  /**
   * `editor.lineEnding.markerGlyph` (#252) — one glyph shown at every
   * tracked line break, regardless of its kind. Expected vs. unexpected is
   * shown via marker variant/styling, not by choosing a different glyph.
   */
  markerGlyph?: LineEndingMarkerGlyph;
  /**
   * `editor.whitespace.*` (#256) — which whitespace categories to paint
   * display-only markers for (ideographic space, ASCII space, tab, other
   * Unicode `Zs`). Independent of #252's line-ending marker. Toggling any
   * of these never edits the document, never makes it dirty, and never
   * touches selection/caret; it only reconfigures a CodeMirror compartment
   * (see the effect below). Omitted by non-file editors (GlossaryEditor's
   * description field), which then render no whitespace markers at all.
   */
  whitespaceSettings?: ApplicationEditorWhitespaceSettings;
  pendingSelection?: MarkdownEditorPendingSelection | null;
  onPendingSelectionApplied?: () => void;
  contextSurface?: EditableContextSurface;
  soundFeedback?: SoundFeedbackPlayer;
  soundSettings?: WorkbenchSoundSettings;
  readOnly?: boolean;
  onParagraphIndentControllerChange?: (
    controller: MarkdownEditorParagraphIndentController | null
  ) => void;
  /**
   * #272: hands the parent an imperative handle for reading this editor's
   * live CodeMirror View State (#273) as plain serializable data. Mirrors
   * `onParagraphIndentControllerChange` — the parent keeps the handle in a
   * ref and calls it from the Session persistence seam, never on the input
   * path. Capture is strictly read-only (no focus move, no dispatch, no IME
   * interaction — see captureEditorViewState).
   */
  onViewStateControllerChange?: (
    controller: MarkdownEditorViewStateController | null
  ) => void;
  /**
   * #272 (review Blocker 3): fired at the low-frequency lifecycle boundary
   * where this editor stops showing `outgoingDocumentKey` — i.e. right
   * before the shared CodeMirror view is re-pointed at a newly activated
   * document, and once more (with the last active key) just before the view
   * is destroyed on unmount. Lets the parent cache the *outgoing* editor's
   * final View State so a tab switch that beats the persistence debounce
   * never loses it. NEVER fired per keystroke; capture stays read-only.
   */
  onViewStateSnapshot?: (
    outgoingDocumentKey: string,
    viewState: EditorViewState | null
  ) => void;
  /**
   * #272 (PO decision): a CHEAP "this editor's #273 View State changed
   * without a document edit" signal — caret / selection moved, or the
   * viewport scrolled. The parent only uses it to schedule a coalesced
   * Session flush; NOTHING is captured / hashed / serialized here. Safe to
   * fire per selection / scroll event.
   */
  onViewStateDirty?: () => void;
  /**
   * #375 Document Map: the editor's on-screen document range, pushed on viewport /
   * geometry change (rAF-coalesced) so the Document Map can draw a "you are here"
   * rectangle. `null` on unmount. Never captures / serializes anything.
   */
  onVisibleRangeChange?: (range: EditorVisibleTextRange | null) => void;
  /**
   * #274: a persisted #273 View State to re-apply once, when the editor
   * first shows the document identified by `key` (which must equal
   * `documentKey`). Applied via `applyEditorViewState`, so the digest gate
   * is honored — a content mismatch resets to a safe default instead of
   * restoring a stale caret. Never blocks the document from opening.
   */
  restoreViewState?: { readonly key: string; readonly viewState: unknown } | null;
  /** #274: fired once after `restoreViewState` for `key` has been consumed
   *  (applied or digest-rejected) so the parent can drop it. */
  onRestoreViewStateApplied?: (key: string) => void;
  /**
   * Imperative focus stays inside the CodeMirror owner. Callers provide only
   * the target document identity and a one-shot request id.
   */
  focusRequest?: MarkdownEditorFocusRequest | null;
  onFocusRequestApplied?: (requestId: number) => void;
  /**
   * #390 PoC: Ctrl+Space Glossary Completion. `undefined`/`null` (the
   * default) leaves Ctrl+Space inert - GlossaryEditor's own description
   * field, which reuses this component, never passes this prop. Only the
   * active Markdown document editor (EditorSurface's MarkdownEditorSurface)
   * supplies it.
   */
  glossaryCompletion?: MarkdownEditorGlossaryCompletionConfig | null;
  /**
   * #392: the runtime-only per-document `EditorState` cache itself, OWNED
   * above this component (App.tsx) so it survives this component's own
   * unmount/remount — e.g. visiting Settings / Debug Log / a Glossary
   * Manager or Tag Manager tab / a Glossary Entry editor tab and back all
   * unmount EditorSurface (and this component with it), which previously
   * (#387) meant a component-local cache was lost at exactly that boundary.
   * `undefined` (GlossaryEditor's description field, which never switches
   * documents and has no need to survive an unmount it IS the field of)
   * falls back to a local, component-lifetime-only cache — behaviorally
   * identical to #387's original design for that one case. Pruning a
   * closed document's entry is the OWNER's job (App.tsx, keyed off its own
   * open-document list) — this component never prunes the Map itself, only
   * reads / writes individual entries.
   */
  documentStates?: Map<string, MarkdownEditorDocumentState>;
}

/**
 * A small handle onto the (single, shared) active-editor `EditorView` for
 * batch, model-driven edits — paragraph indent (#252) and Open Documents
 * Replace (#386). Each call dispatches ONE CodeMirror transaction (one undo
 * step) whose `{from,to,insert}` changes are in original-document coordinates;
 * returns `false` when the editor is read-only or no view is mounted.
 */
export interface MarkdownEditorParagraphIndentController {
  applyParagraphIndentChanges(
    changes: readonly ParagraphIndentChange[]
  ): boolean;
  /** #386: like `applyParagraphIndentChanges`, but tags the transaction
   *  `input.replace` so it is a clean, isolated undo step. */
  applyReplaceInBufferChanges(
    changes: readonly ParagraphIndentChange[]
  ): boolean;
  /**
   * #386 Project Documents Replace: after the file was saved to disk, refresh
   * the live view to the saved content. This is a disk SYNC, not an edit -
   * dispatched exactly like a document switch (whole-document replace, tracking
   * field reset, `addToHistory: false`), so it never lands on the undo stack.
   * Returns `false` when no view is mounted.
   */
  syncBufferToDiskContent(
    fullText: string,
    breaks: LineEndingBreakSet
  ): boolean;
}

export interface MarkdownEditorViewStateController {
  /** Read-only snapshot of the current CodeMirror View State, or `null`
   *  when no editor view is mounted. */
  captureViewState(): EditorViewState | null;
  /**
   * #375 Document Map navigation: scroll the given 0-based SOURCE line into
   * view and focus the editor. This is NAVIGATION only — the caret / selection
   * are NOT touched, no document change is dispatched. The line is clamped into
   * the document; a no-op when no view is mounted.
   *
   * `options.align` picks the vertical alignment: `"center"` (default —
   * click-to-scroll) puts the line near the middle; `"start"` (viewport-lens
   * drag) puts it near the top.
   */
  scrollToLine(
    lineIndex: number,
    options?: { align?: EditorScrollAlign }
  ): void;
}

export interface MarkdownEditorFocusRequest {
  readonly id: number;
  readonly documentKey: string;
}

interface MarkdownEditorSoundTransaction {
  readonly docChanged: boolean;
  annotation<T>(type: AnnotationType<T>): T | undefined;
  readonly changes: {
    iterChanges: (
      callback: (
        fromA: number,
        toA: number,
        fromB: number,
        toB: number,
        inserted: { toString: () => string }
      ) => void
    ) => void;
  };
}

function includesLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

function isTypedInputUserEvent(userEvent: string | undefined): boolean {
  return (
    userEvent === "input.type" ||
    userEvent?.startsWith("input.type.") === true
  );
}

export function markdownEditorInputSoundEventFromTransactions(
  transactions: readonly MarkdownEditorSoundTransaction[]
): MarkdownEditorInputSoundEvent | null {
  let hasKeypress = false;

  for (const transaction of transactions) {
    if (!transaction.docChanged) {
      continue;
    }

    const userEvent = transaction.annotation(Transaction.userEvent);
    const isTypedInput = isTypedInputUserEvent(userEvent);
    const isPlainInput = userEvent === "input";
    let hasNewline = false;

    transaction.changes.iterChanges(
      (_fromA, _toA, _fromB, _toB, inserted) => {
        const insertedText = inserted.toString();

        if ((isPlainInput || isTypedInput) && includesLineBreak(insertedText)) {
          hasNewline = true;
        } else if (isTypedInput && insertedText.length > 0) {
          hasKeypress = true;
        }
      }
    );

    if (hasNewline) {
      return "newline";
    }
  }

  return hasKeypress ? "keypress" : null;
}

const defaultMarkdownEditorDocumentKey = "single-document";

// #256: the "prop omitted" default — no whitespace markers at all. Only the
// Markdown editor surface passes real `editor.whitespace.*` settings;
// non-file editors that reuse this component get exactly the pre-#256
// rendering.
const noWhitespaceRendering: ApplicationEditorWhitespaceSettings = {
  renderIdeographicSpace: false,
  renderAsciiSpace: false,
  renderTab: false,
  renderOtherUnicodeSpace: false
};

export function MarkdownEditor({
  value,
  onChange,
  // Non-file editors (GlossaryEditor's description field) never switch
  // documents and don't have per-break line-ending data to track — these
  // three defaults give them an editor that behaves exactly as before
  // #253 (a single fixed "document" whose line-ending tracking, if it
  // fires at all, has no effect anyone reads).
  documentKey = defaultMarkdownEditorDocumentKey,
  initialLineEndingBreaks = [],
  newFileLineEndingFallback = "lf",
  expectedLineEnding = "lf",
  markerGlyph = "⏎",
  whitespaceSettings,
  pendingSelection,
  onPendingSelectionApplied,
  contextSurface,
  soundFeedback,
  soundSettings,
  readOnly = false,
  onParagraphIndentControllerChange,
  onViewStateControllerChange,
  onViewStateSnapshot,
  onViewStateDirty,
  onVisibleRangeChange,
  restoreViewState,
  onRestoreViewStateApplied,
  focusRequest,
  onFocusRequestApplied,
  glossaryCompletion,
  documentStates: documentStatesProp
}: MarkdownEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const visibilityCompartmentRef = useRef<Compartment | null>(null);
  // #256: owns the whitespace-marker layer so a runtime Settings change is
  // a compartment reconfigure (tearing down / rebuilding just this layer),
  // never an EditorView rebuild.
  const whitespaceCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  // #272: read from a ref by the mount effect's cleanup (which is []-deps
  // and must not re-subscribe) so the outgoing View State is reported with
  // the latest handler right before the view is destroyed.
  const onViewStateSnapshotRef = useRef(onViewStateSnapshot);
  // #272: read by the (mount-only) CodeMirror updateListener; kept fresh so
  // the current coordinator's cheap dirty-signal is always the one called.
  const onViewStateDirtyRef = useRef(onViewStateDirty);
  // #375 Document Map: read by the mount-only updateListener; kept fresh so the
  // current Document Map coordinator receives the viewport pushes.
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);
  // #375 Document Map: rAF handle coalescing viewport pushes on fast scroll.
  const visibleRangeFrameRef = useRef<number | null>(null);
  const soundFeedbackRef = useRef(soundFeedback);
  const soundSettingsRef = useRef(soundSettings);
  const readOnlyRef = useRef(readOnly);
  // #390: read fresh by the glossary-completion source / trigger on every
  // invocation, so a live entries reload (or the feature being enabled at
  // all - see MarkdownEditorGlossaryCompletionConfig's doc comment) is
  // honored without recreating the EditorView.
  const glossaryCompletionRef = useRef<MarkdownEditorGlossaryCompletionConfig | null>(
    glossaryCompletion ?? null
  );
  // Only ever set at mount, from that first render's documentKey (see the
  // document-switch effect below for why this must not reset on every
  // render).
  const documentKeyRef = useRef(documentKey);
  // #253: read fresh by the tracking field's `update()` on every
  // transaction (see createLineEndingTrackingField), so a runtime change
  // to the effective `files.newFile.lineEnding` setting takes effect for
  // the next new break without needing to recreate the field mid-document.
  const newFileLineEndingFallbackRef = useRef<LineEndingKind>(
    newFileLineEndingFallback
  );
  // #252: read fresh by the line-ending marker feature's detect() on every
  // decoration recompute, so a runtime Settings change is honored without
  // rebuilding the feature or the tracking field — mirrors
  // newFileLineEndingFallbackRef above.
  const expectedLineEndingRef = useRef<ExpectedLineEnding>(expectedLineEnding);
  const markerGlyphRef = useRef<LineEndingMarkerGlyph>(markerGlyph);
  // #256: read fresh by the whitespace-marker layer on every measure (doc
  // edit, scroll, geometry change, or a compartment reconfigure), so a
  // runtime toggle and a post-document-switch first render both use the
  // current effective settings without recreating the owning EditorView.
  const whitespaceSettingsRef = useRef<ApplicationEditorWhitespaceSettings>(
    whitespaceSettings ?? noWhitespaceRendering
  );
  // #387: points at whichever document is CURRENTLY active's own
  // `lineEndingField` instance (each document gets its own — see
  // markdownEditorDocumentState.ts), kept fresh here so the
  // settings-reconfigure effects below can build a marker feature against
  // the right field without needing to know about document switching
  // themselves. Swapped, never mutated in place, on every genuine switch.
  const lineEndingFieldRef = useRef<StateField<LineEndingBreakSet> | null>(
    null
  );
  const appliedFocusRequestIdRef = useRef<number | null>(null);
  // #392: component-local fallback cache, used only when no `documentStates`
  // prop is supplied (GlossaryEditor's description field — see that prop's
  // doc comment). Never read directly elsewhere in this file; always go
  // through the `documentStates` constant below.
  const fallbackDocumentStatesRef = useRef<
    Map<string, MarkdownEditorDocumentState>
  >(new Map());
  // #387 PoC / #392: runtime-only per-document EditorState cache, keyed by
  // `documentKey` — never Session / Recovery / project DB / pergamum.json
  // (nothing outside App.tsx's own owning ref and this component ever reads
  // it; `content` remains the one string every persistence / save / search
  // path already uses, completely unchanged by this cache's existence).
  // Populated lazily, right before switching away from a document AND on
  // unmount (see the document-switch effect and the mount effect's cleanup
  // below). As of #392 this Map itself is OWNED by App.tsx (passed in as the
  // `documentStates` prop) precisely so it is NOT lost when this component
  // unmounts — e.g. navigating to Settings / Debug Log / a Glossary Manager
  // or Tag Manager tab / a Glossary Entry editor tab and back all unmount
  // the single shared EditorSurface (and this component with it); before
  // #392 that was a known, accepted PoC boundary where the cache reset.
  // Pruning a closed document's entry is App.tsx's job, not this
  // component's — see the `documentStates` prop's own doc comment.
  const documentStates = documentStatesProp ?? fallbackDocumentStatesRef.current;

  if (!readOnlyCompartmentRef.current) {
    readOnlyCompartmentRef.current = new Compartment();
  }
  const readOnlyCompartment = readOnlyCompartmentRef.current;

  if (!visibilityCompartmentRef.current) {
    visibilityCompartmentRef.current = new Compartment();
  }
  const visibilityCompartment = visibilityCompartmentRef.current;

  if (!whitespaceCompartmentRef.current) {
    whitespaceCompartmentRef.current = new Compartment();
  }
  const whitespaceCompartment = whitespaceCompartmentRef.current;

  // #375 Document Map: hoisted out of the mount effect (rather than defined
  // inline there, as before #387) so the document-switch effect below can
  // build a fresh document's updateListener identically via
  // createUpdateListenerExtension, without duplicating this logic. Reads
  // only editor-instance-level refs — never anything per-document.
  function scheduleVisibleRangePush(): void {
    if (
      !onVisibleRangeChangeRef.current ||
      visibleRangeFrameRef.current !== null ||
      typeof requestAnimationFrame === "undefined"
    ) {
      if (onVisibleRangeChangeRef.current && !visibleRangeFrameRef.current) {
        pushVisibleRange();
      }
      return;
    }

    visibleRangeFrameRef.current = requestAnimationFrame(() => {
      visibleRangeFrameRef.current = null;
      pushVisibleRange();
    });
  }

  function pushVisibleRange(): void {
    const currentView = viewRef.current;
    if (!currentView || !onVisibleRangeChangeRef.current) {
      return;
    }

    const { from, to } = currentView.viewport;
    onVisibleRangeChangeRef.current({ from, to });
  }

  // #387: the update listener BODY is editor-instance-level (sound feedback,
  // onChange, View State dirty signal, Document Map push) and identical for
  // every document — only `lineEndingField` differs per document (each has
  // its own — see markdownEditorDocumentState.ts). Built once per document's
  // OWN EditorState (mount, or a later first-time switch to it), closing
  // over whichever field that document's state was created with, so
  // `update.state.field(lineEndingField)` below always reads the right one.
  function createUpdateListenerExtension(
    lineEndingField: StateField<LineEndingBreakSet>
  ) {
    return EditorView.updateListener.of((update) => {
      const soundEvent = readOnlyRef.current
        ? null
        : markdownEditorInputSoundEventFromTransactions(update.transactions);

      if (soundEvent && soundFeedbackRef.current && soundSettingsRef.current) {
        playMarkdownEditorInputSound(
          soundEvent,
          soundFeedbackRef.current,
          soundSettingsRef.current
        );
      }

      if (update.docChanged && !readOnlyRef.current) {
        onChangeRef.current(
          update.state.doc.toString(),
          update.state.field(lineEndingField)
        );
      }

      // #272 (PO decision): a View-State-only change (caret / selection
      // moved, or the viewport scrolled) with NO document edit still needs a
      // coalesced Session flush. A doc edit is already covered by the React
      // state update above, so it is excluded here. This is a bare, cheap
      // signal — no capture / hash / serialization.
      if (
        !update.docChanged &&
        (update.selectionSet || update.viewportChanged)
      ) {
        onViewStateDirtyRef.current?.();
      }

      // #375 Document Map: push the on-screen document range whenever the
      // viewport / geometry / document changed, rAF-coalesced so a fast
      // scroll doesn't spam the parent's setState.
      if (
        update.viewportChanged ||
        update.geometryChanged ||
        update.docChanged
      ) {
        scheduleVisibleRangePush();
      }
    });
  }

  // #387: builds one document's fresh EditorState — used for the very first
  // document this editor instance shows, and for any later document with no
  // cached state yet (see documentStates's doc comment / the
  // document-switch effect below). `markerGlyph` (the prop, not a ref) is
  // only the feature's construction-time value, exactly as before #387 —
  // `markerGlyphRef`/`expectedLineEndingRef` are what stay live afterward.
  function buildDocumentState(
    docContent: string,
    docInitialBreaks: readonly LineEndingBreak[]
  ): MarkdownEditorDocumentState {
    return createMarkdownEditorDocumentState({
      doc: docContent,
      initialLineEndingBreaks: docInitialBreaks,
      newFileLineEndingFallbackRef,
      readOnlyCompartment,
      readOnlyRef,
      visibilityCompartment,
      markerGlyph,
      expectedLineEndingRef,
      markerGlyphRef,
      whitespaceCompartment,
      whitespaceSettingsRef,
      glossaryCompletionRef,
      createUpdateListenerExtension
    });
  }

  // #392: the Settings-driven compartments (readOnly / line-ending marker
  // visibility / whitespace) are shared editor-instance-wide slots — a
  // document restored from `documentStates` may still reflect whatever
  // those settings were the last time IT was active (possibly a previous
  // MOUNT lifetime of this very component, now that the cache survives
  // unmount), so this is dispatched right after every cache restore
  // (mount OR switch) to bring it up to date. Mirrors the three
  // settings-reconfigure effects below exactly; effects only, so this is
  // never a document edit (no dirty, no undo entry, no selection/caret
  // move).
  function reconcileSettingsEffects(
    lineEndingField: StateField<LineEndingBreakSet>
  ) {
    return [
      readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(readOnlyRef.current),
        EditorView.editable.of(!readOnlyRef.current)
      ]),
      visibilityCompartment.reconfigure(
        createVisibilityExtension(
          createLineEndingVisibilityFeatures(
            markerGlyphRef.current,
            lineEndingField,
            () => expectedLineEndingRef.current,
            () => markerGlyphRef.current
          )
        )
      ),
      whitespaceCompartment.reconfigure(
        whitespaceMarkerLayer(() => whitespaceSettingsRef.current)
      )
    ];
  }

  // #392 (originally #387, generalized here since the cache can now survive
  // this component's own unmount — see the `documentStates` prop's doc
  // comment): resolves which EditorState a document identified by `key`
  // should show right now. Prefers a cached entry, but ONLY when its
  // document content still matches `docContent` — see #387 plan item 6
  // ("external content update"): an INACTIVE document's `content` can be
  // changed from outside CodeMirror entirely (e.g. Open Documents Replace
  // applies its edit directly to `openDocumentsState` for any buffer that
  // isn't the active editor, with no transaction and no EditorState
  // involved). A cached EditorState whose doc no longer matches the
  // incoming content is stale relative to that external edit; restoring it
  // verbatim would silently revert the edit. Falling back to a fresh build
  // (that document's own undo history is lost, but the external edit is
  // never reverted) is the same documented tradeoff `syncBufferToDiskContent`
  // already accepts for the active document's own disk-sync case below.
  function resolveDocumentState(
    key: string,
    docContent: string,
    docInitialBreaks: readonly LineEndingBreak[]
  ): { documentState: MarkdownEditorDocumentState; wasRestoredFromCache: boolean } {
    const cachedEntry = documentStates.get(key);
    const cached =
      cachedEntry && cachedEntry.state.doc.toString() === docContent
        ? cachedEntry
        : null;

    return cached
      ? { documentState: cached, wasRestoredFromCache: true }
      : {
          documentState: buildDocumentState(docContent, docInitialBreaks),
          wasRestoredFromCache: false
        };
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onViewStateSnapshotRef.current = onViewStateSnapshot;
  }, [onViewStateSnapshot]);

  useEffect(() => {
    onViewStateDirtyRef.current = onViewStateDirty;
  }, [onViewStateDirty]);

  useEffect(() => {
    onVisibleRangeChangeRef.current = onVisibleRangeChange;
  }, [onVisibleRangeChange]);

  useEffect(() => {
    soundFeedbackRef.current = soundFeedback;
    soundSettingsRef.current = soundSettings;
  }, [soundFeedback, soundSettings]);

  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  useEffect(() => {
    glossaryCompletionRef.current = glossaryCompletion ?? null;
  }, [glossaryCompletion]);

  useEffect(() => {
    newFileLineEndingFallbackRef.current = newFileLineEndingFallback;
  }, [newFileLineEndingFallback]);

  useEffect(() => {
    expectedLineEndingRef.current = expectedLineEnding;
  }, [expectedLineEnding]);

  useEffect(() => {
    markerGlyphRef.current = markerGlyph;
  }, [markerGlyph]);

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    // #392: this first document may already have a cached EditorState from
    // a PREVIOUS mount lifetime of this very component (the `documentStates`
    // Map now typically outlives this component — see that prop's doc
    // comment) — e.g. the user was editing this document, switched to
    // Settings (unmounting this component), and has now come back to it.
    // `resolveDocumentState` picks that cache up exactly like the
    // document-switch effect below does for an in-session switch.
    const resolved = resolveDocumentState(
      documentKeyRef.current,
      value,
      initialLineEndingBreaks
    );
    lineEndingFieldRef.current = resolved.documentState.lineEndingField;
    documentStates.set(documentKeyRef.current, resolved.documentState);

    const view = new EditorView({
      parent: hostRef.current,
      state: resolved.documentState.state
    });

    if (resolved.wasRestoredFromCache) {
      view.dispatch({
        effects: reconcileSettingsEffects(resolved.documentState.lineEndingField)
      });
    }

    viewRef.current = view;

    // First push once the initial layout has settled.
    scheduleVisibleRangePush();

    return () => {
      // #272: report this editor's final View State (keyed by whatever
      // document it is currently showing) before the view is torn down, so
      // an unmount that races the persistence debounce still preserves it.
      onViewStateSnapshotRef.current?.(
        documentKeyRef.current,
        captureEditorViewState(view)
      );
      // #392: capture this document's final live EditorState (undo history
      // included) into `documentStates` before tearing down — this is what
      // lets a cache OWNED above this component (App.tsx) survive this
      // component's own unmount (Settings / Debug Log / a Glossary Manager
      // or Tag Manager tab / a Glossary Entry editor tab). Without this, any
      // edits made since the last switch-away would never make it into the
      // cache, since the switch effect below only captures on a SWITCH, not
      // on a plain unmount.
      documentStates.set(documentKeyRef.current, {
        state: view.state,
        lineEndingField: lineEndingFieldRef.current!
      });
      // #375 Document Map: stop the coalesced viewport push and clear the overlay.
      if (
        visibleRangeFrameRef.current !== null &&
        typeof cancelAnimationFrame !== "undefined"
      ) {
        cancelAnimationFrame(visibleRangeFrameRef.current);
      }
      visibleRangeFrameRef.current = null;
      onVisibleRangeChangeRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // Deliberately mount-only: initialLineEndingBreaks/newFileLineEndingFallback
    // are only meant to seed the field once per document — the
    // document-switch effect below (keyed on documentKey) is what builds /
    // restores state for a genuinely different document, not a re-run of
    // this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!onParagraphIndentControllerChange) {
      return undefined;
    }

    const dispatchBufferChanges = (
      changes: readonly ParagraphIndentChange[],
      userEvent: string | undefined
    ): boolean => {
      const view = viewRef.current;

      if (!view || readOnlyRef.current) {
        return false;
      }

      if (changes.length === 0) {
        return true;
      }

      const codeMirrorChanges: ChangeSpec[] = changes.map((change) => ({
        from: change.from,
        to: change.to,
        insert: change.insert
      }));

      // One dispatch = one transaction = one undo step. ChangeSpec `from`/`to`
      // are original-document offsets; CodeMirror resolves them all against the
      // pre-transaction document, so no manual offset correction is needed.
      view.dispatch(
        userEvent === undefined
          ? { changes: codeMirrorChanges }
          : { changes: codeMirrorChanges, userEvent }
      );
      return true;
    };

    const controller: MarkdownEditorParagraphIndentController = {
      applyParagraphIndentChanges: (changes) =>
        dispatchBufferChanges(changes, undefined),
      applyReplaceInBufferChanges: (changes) =>
        dispatchBufferChanges(changes, "input.replace"),
      syncBufferToDiskContent: (fullText, breaks) => {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        // Same spec as a tab switch: whole-doc replace + tracking-field reset,
        // excluded from undo history.
        view.dispatch(
          documentSwitchTransactionSpec(view.state.doc.length, fullText, breaks)
        );
        return true;
      }
    };

    onParagraphIndentControllerChange(controller);

    return () => onParagraphIndentControllerChange(null);
  }, [onParagraphIndentControllerChange]);

  useEffect(() => {
    if (!onViewStateControllerChange) {
      return undefined;
    }

    const controller: MarkdownEditorViewStateController = {
      captureViewState: () => {
        const view = viewRef.current;

        return view ? captureEditorViewState(view) : null;
      },
      scrollToLine: (lineIndex, options) => {
        const view = viewRef.current;

        if (!view || !Number.isFinite(lineIndex)) {
          return;
        }

        // CodeMirror lines are 1-based; the Document Map speaks 0-based
        // source lines. Clamp into the document.
        const totalLines = view.state.doc.lines;
        const target = Math.max(
          1,
          Math.min(Math.floor(lineIndex) + 1, totalLines)
        );
        const line = view.state.doc.line(target);

        // Effects only — no `selection`, so the caret does not move. `y` is
        // "center" for click-to-scroll, "start" for viewport-lens drag.
        view.dispatch({
          effects: EditorView.scrollIntoView(line.from, {
            y: options?.align ?? DEFAULT_EDITOR_SCROLL_ALIGN
          })
        });
        view.focus();
      }
    };

    onViewStateControllerChange(controller);

    return () => onViewStateControllerChange(null);
  }, [onViewStateControllerChange]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly)
      ])
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    const lineEndingField = lineEndingFieldRef.current;

    if (!view || !lineEndingField) {
      return;
    }

    // #252: expectedLineEndingRef/markerGlyphRef are already read live by
    // the marker feature's detect()/createDecoration() on every natural
    // recompute (doc edit or scroll) — but a Settings-only change (no
    // edit, no scroll) would otherwise leave stale decorations on screen
    // until the next one. Reconfiguring the compartment forces an
    // immediate recompute by mounting a fresh ViewPlugin instance, without
    // recreating the EditorView or the #253 tracking field itself (the
    // same StateField instance is passed through unchanged).
    view.dispatch({
      effects: visibilityCompartment.reconfigure(
        createVisibilityExtension(
          createLineEndingVisibilityFeatures(
            markerGlyph,
            lineEndingField,
            () => expectedLineEndingRef.current,
            () => markerGlyphRef.current
          )
        )
      )
    });
  }, [expectedLineEnding, markerGlyph]);

  useEffect(() => {
    // Keep the live getter fresh BEFORE the reconfigure below, so the fresh
    // layer's first measure already sees the new settings. This also covers
    // a document switch that doesn't change these four values: the getter
    // stays current, so the next measure for the new document uses the
    // current effective settings, never a stale snapshot.
    whitespaceSettingsRef.current = whitespaceSettings ?? noWhitespaceRendering;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    // #256: a Settings-only change is reflected by reconfiguring the
    // compartment — this tears down and rebuilds just the whitespace
    // marker layer (or installs an empty extension when every category is
    // now off) without recreating the EditorView or any other extension.
    // It dispatches only `effects`, so it is not a document change: no
    // edit, no dirty, no undo entry, no selection/caret move.
    view.dispatch({
      effects: whitespaceCompartment.reconfigure(
        whitespaceMarkerLayer(() => whitespaceSettingsRef.current)
      )
    });
  }, [
    whitespaceSettings?.renderIdeographicSpace,
    whitespaceSettings?.renderAsciiSpace,
    whitespaceSettings?.renderTab,
    whitespaceSettings?.renderOtherUnicodeSpace
  ]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    // #387: a genuine document switch (not an echo of this editor's own
    // typing) now swaps in that OTHER document's own EditorState wholesale
    // via `view.setState(...)` — a cached one (full undo/redo history
    // intact) when this document has been visited before in this
    // MarkdownEditor instance's lifetime, otherwise a freshly built one. The
    // OUTGOING document's live `view.state` (with whatever edits/history it
    // now holds) is captured into the cache first, so switching back to it
    // later restores exactly where it was left — this is the #387 fix for
    // #253's very own `documentSwitchTransactionSpec`, which this path no
    // longer uses: that helper always excluded the switch from Undo history
    // BECAUSE every document shared one continuous EditorState (#250) — a
    // whole-document replace transaction on a per-document EditorState would
    // instead show up as (and be undoable as) an edit to the WRONG document
    // the next time its own history is replayed. `documentSwitchTransactionSpec`
    // remains in use by `syncBufferToDiskContent` below, which intentionally
    // resets a document's own history after an external disk sync — a
    // different, still-valid case of #6 in #387's own plan ("external
    // content update").
    if (documentKeyRef.current !== documentKey) {
      // #272: capture the OUTGOING document's final View State (still shown
      // by the shared view at this instant) before it is replaced. This is
      // an active-editor-switch boundary, not a per-keystroke path.
      onViewStateSnapshotRef.current?.(
        documentKeyRef.current,
        captureEditorViewState(view)
      );
      // #387/#392: cache the OUTGOING document's live EditorState (its full
      // undo history included) under the key it is STILL showing, before
      // that key ref advances below.
      documentStates.set(documentKeyRef.current, {
        state: view.state,
        lineEndingField: lineEndingFieldRef.current!
      });
      documentKeyRef.current = documentKey;

      const resolved = resolveDocumentState(
        documentKey,
        value,
        initialLineEndingBreaks
      );
      view.setState(resolved.documentState.state);
      lineEndingFieldRef.current = resolved.documentState.lineEndingField;

      if (resolved.wasRestoredFromCache) {
        view.dispatch({
          effects: reconcileSettingsEffects(
            resolved.documentState.lineEndingField
          )
        });
      }

      return;
    }

    if (view.state.doc.toString() === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
    // newFileLineEndingFallback is deliberately excluded: it's only
    // consulted by the tracking field's update() via
    // newFileLineEndingFallbackRef (kept fresh by its own effect above),
    // never by this document-switch/content-sync effect itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, documentKey, initialLineEndingBreaks]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !pendingSelection) {
      return;
    }

    const docLength = view.state.doc.length;
    const from = Math.max(0, Math.min(pendingSelection.start, docLength));
    const to = Math.max(from, Math.min(pendingSelection.end, docLength));

    view.dispatch({
      selection: EditorSelection.single(from, to),
      effects: EditorView.scrollIntoView(from, {
        y: pendingSelection.scrollY ?? "nearest"
      })
    });
    view.focus();
    onPendingSelectionApplied?.();
  }, [pendingSelection, onPendingSelectionApplied]);

  // #274: re-apply a persisted #273 View State exactly once for the document
  // this editor is now showing. Declared after the document-switch effect so
  // the content is already in place; `applyEditorViewState` digest-gates
  // internally (mismatch → safe reset), and a failure here never affects the
  // document being open.
  const appliedRestoreViewStateKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const view = viewRef.current;

    if (
      !view ||
      !restoreViewState ||
      restoreViewState.key !== documentKey ||
      appliedRestoreViewStateKeyRef.current === restoreViewState.key
    ) {
      return;
    }

    appliedRestoreViewStateKeyRef.current = restoreViewState.key;

    try {
      applyEditorViewState(view, restoreViewState.viewState);
    } catch {
      // View State restore is strictly best-effort; never fail the open.
    }

    onRestoreViewStateApplied?.(restoreViewState.key);
  }, [restoreViewState, documentKey, onRestoreViewStateApplied]);

  useEffect(() => {
    const view = viewRef.current;

    if (
      !view ||
      !focusRequest ||
      focusRequest.documentKey !== documentKey ||
      appliedFocusRequestIdRef.current === focusRequest.id
    ) {
      return;
    }

    appliedFocusRequestIdRef.current = focusRequest.id;
    view.focus();
    onFocusRequestApplied?.(focusRequest.id);
  }, [focusRequest, documentKey, onFocusRequestApplied]);

  return (
    <div
      className={readOnly ? "editorHost editorHost-readOnly" : "editorHost"}
      ref={hostRef}
      {...(contextSurface
        ? { [pergamumContextSurfaceAttribute]: contextSurface }
        : {})}
    />
  );
}
