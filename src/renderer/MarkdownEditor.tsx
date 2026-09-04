import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
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
import {
  buildLineEndingBreakSet,
  createLineEndingTrackingExtension,
  documentSwitchTransactionSpec
} from "./editorLineEndingField";
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
}

export interface MarkdownEditorParagraphIndentController {
  applyParagraphIndentChanges(
    changes: readonly ParagraphIndentChange[]
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
  onFocusRequestApplied
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
  // Set once, at mount, so the settings-reconfigure effect below can build
  // a fresh marker feature against the SAME tracking field instance — the
  // field itself is never recreated (see the mount effect for why).
  const lineEndingFieldRef = useRef<StateField<LineEndingBreakSet> | null>(
    null
  );
  const appliedFocusRequestIdRef = useRef<number | null>(null);

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

    // #253: the tracking field is created once and lives for this
    // EditorView's whole lifetime — a document switch resets its *value*
    // (via resetLineEndingBreaksEffect, dispatched in the document-switch
    // effect below) rather than swapping in a different field instance.
    // (A StateField's own `create()` cannot be reused for re-seeding: were
    // this field re-created via a Compartment reconfigure bundled with a
    // content-replacing change, CodeMirror advances the freshly-`create()`d
    // value through that very same transaction, double-applying its
    // changes to the just-seeded breaks — confirmed directly against
    // `@codemirror/state`, not assumed.)
    const { field: lineEndingField, extension: lineEndingExtension } =
      createLineEndingTrackingExtension(
        initialLineEndingBreaks,
        () => newFileLineEndingFallbackRef.current
      );
    lineEndingFieldRef.current = lineEndingField;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          readOnlyCompartment.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly)
          ]),
          visibilityCompartment.of(
            createVisibilityExtension(
              createLineEndingVisibilityFeatures(
                markerGlyph,
                lineEndingField,
                () => expectedLineEndingRef.current,
                () => markerGlyphRef.current
              )
            )
          ),
          lineEndingExtension,
          whitespaceCompartment.of(
            whitespaceMarkerLayer(() => whitespaceSettingsRef.current)
          ),
          EditorView.updateListener.of((update) => {
            const soundEvent = readOnlyRef.current
              ? null
              : markdownEditorInputSoundEventFromTransactions(
                  update.transactions
                );

            if (
              soundEvent &&
              soundFeedbackRef.current &&
              soundSettingsRef.current
            ) {
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
            // moved, or the viewport scrolled) with NO document edit still
            // needs a coalesced Session flush. A doc edit is already covered
            // by the React state update above, so it is excluded here. This
            // is a bare, cheap signal — no capture / hash / serialization.
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
          })
        ]
      })
    });

    viewRef.current = view;

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
    // document-switch effect below (keyed on documentKey) is what re-seeds
    // it for a genuinely different document, not a re-run of this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!onParagraphIndentControllerChange) {
      return undefined;
    }

    const controller: MarkdownEditorParagraphIndentController = {
      applyParagraphIndentChanges: (changes) => {
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

        view.dispatch({ changes: codeMirrorChanges });
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

    // #253: a genuine document switch (not an echo of this editor's own
    // typing) must reset the line-ending tracking field to the new
    // document's `initialLineEndingBreaks`, bundled into the SAME
    // transaction as the content replace — never as two separate
    // dispatches, which would let the tracking field briefly map its
    // *previous* document's breaks against the *new* document's content.
    // That same transaction is also excluded from Undo history (see
    // documentSwitchTransactionSpec) since this EditorView is reused
    // across every open document (#250) — without the exclusion, Undo
    // right after a switch would revert the text to the previous
    // document while leaving the tracking field at the new document's
    // breaks.
    if (documentKeyRef.current !== documentKey) {
      // #272: capture the OUTGOING document's final View State (still shown
      // by the shared view at this instant) before it is replaced. This is
      // an active-editor-switch boundary, not a per-keystroke path.
      onViewStateSnapshotRef.current?.(
        documentKeyRef.current,
        captureEditorViewState(view)
      );
      documentKeyRef.current = documentKey;

      view.dispatch(
        documentSwitchTransactionSpec(
          view.state.doc.length,
          value,
          buildLineEndingBreakSet(initialLineEndingBreaks)
        )
      );
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
