/**
 * #387 PoC: builds one open Markdown document's own CodeMirror `EditorState`.
 *
 * Pergamum reuses a single `EditorView` across every open Markdown tab
 * (#250) — inactive tabs previously kept only a `content` string, with no
 * `EditorState` / undo history of their own. Switching the active tab
 * replaced the WHOLE document via a `Transaction.addToHistory.of(false)`
 * transaction (see editorLineEndingField.ts's `documentSwitchTransactionSpec`
 * doc comment), which — confirmed directly against `@codemirror/commands`,
 * not assumed — collapses every existing undo branch entry to a no-op the
 * instant it is dispatched. So Undo never survived a tab switch.
 *
 * This module is the per-document half of the fix: `MarkdownEditor.tsx` now
 * keeps a `Map<documentKey, MarkdownEditorDocumentState>` runtime-only cache
 * (never Session / Recovery / project DB / pergamum.json — see that file's
 * `documentStatesRef` doc comment) and, on a genuine tab switch, calls
 * `view.setState(cached.state)` to swap in that document's own previously
 * live `EditorState` — full undo/redo history included — instead of
 * replacing content within one shared, continuously-reused state. A
 * document with no cached entry yet (first open) gets a fresh one built
 * here.
 *
 * The `EditorView` itself is still never duplicated — #250's "one shared
 * view" design is untouched, only WHICH `EditorState` that one view is
 * currently showing changes per document.
 */

import { markdown } from "@codemirror/lang-markdown";
import {
  EditorState,
  type ChangeSpec,
  type Compartment,
  type Extension,
  type StateField
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph
} from "../shared/settings";
import { whitespaceMarkerLayer } from "./whitespaceRendering/whitespaceMarkerLayer";
import { createVisibilityExtension } from "./editorVisibility/visibilityFeature";
import { createLineEndingVisibilityFeatures } from "./editorVisibility/lineEndMarkerFeature";
import {
  createLineEndingTrackingExtension,
  type LineEndingBreakSet
} from "./editorLineEndingField";
import type { LineEndingBreak, LineEndingKind } from "./lineEndingTracking";
import {
  createGlossaryCompletionExtension,
  type MarkdownEditorGlossaryCompletionConfig
} from "./glossaryCompletionExtension";
import { markdownEditorBaseSetup } from "./markdownEditorCodeMirrorSetup";

/**
 * One open Markdown document's own `EditorState`, kept alongside the exact
 * `lineEndingField` StateField instance its extensions were built with (the
 * updateListener needs this specific reference to read tracked line-ending
 * breaks back out of a `ViewUpdate.state` — see #253's
 * `createLineEndingTrackingExtension`). Runtime-only: safe to hold in a
 * plain in-memory `Map`, never serialized anywhere.
 */
export interface MarkdownEditorDocumentState {
  readonly state: EditorState;
  readonly lineEndingField: StateField<LineEndingBreakSet>;
}

/**
 * A minimal ref-shaped "read `.current` live" type — deliberately NOT
 * React's own `RefObject<T>` (whose `.current` is always `T | null`, for
 * DOM-node refs): every ref this module reads is a `useRef(initialValue)`
 * value ref that is never null.
 */
interface LiveRef<T> {
  readonly current: T;
}

export interface MarkdownEditorDocumentStateOptions {
  readonly doc: string;
  readonly initialLineEndingBreaks: readonly LineEndingBreak[];
  readonly newFileLineEndingFallbackRef: LiveRef<LineEndingKind>;
  readonly readOnlyCompartment: Compartment;
  readonly readOnlyRef: LiveRef<boolean>;
  readonly visibilityCompartment: Compartment;
  readonly markerGlyph: LineEndingMarkerGlyph;
  readonly expectedLineEndingRef: LiveRef<ExpectedLineEnding>;
  readonly markerGlyphRef: LiveRef<LineEndingMarkerGlyph>;
  readonly whitespaceCompartment: Compartment;
  readonly whitespaceSettingsRef: LiveRef<ApplicationEditorWhitespaceSettings>;
  readonly glossaryCompletionRef: LiveRef<MarkdownEditorGlossaryCompletionConfig | null>;
  /** Built last, over the document's OWN `lineEndingField` — the caller
   *  owns the actual listener body (sound feedback, onChange, Document Map
   *  push, ...), all of which is editor-instance-level, not per-document. */
  createUpdateListenerExtension: (
    lineEndingField: StateField<LineEndingBreakSet>
  ) => Extension;
}

/**
 * Builds a brand-new `EditorState` for one document — used both for the
 * very first document an editor instance shows (mount) and for any later
 * document that has no cached state yet (first-ever switch to it).
 *
 * Compartments are passed in rather than created here: they are shared,
 * editor-instance-wide slots (one `readOnlyCompartment` etc. per
 * `MarkdownEditor` mount, reused across every document's `EditorState` so a
 * live Settings change can `.reconfigure()` whichever document is currently
 * active — see MarkdownEditor.tsx). The `lineEndingField` StateField,
 * in contrast, is created fresh here, once per document: it is that
 * document's own undo-integrated tracked data, not a shared slot.
 */
export function createMarkdownEditorDocumentState(
  options: MarkdownEditorDocumentStateOptions
): MarkdownEditorDocumentState {
  const { field: lineEndingField, extension: lineEndingExtension } =
    createLineEndingTrackingExtension(
      options.initialLineEndingBreaks,
      () => options.newFileLineEndingFallbackRef.current
    );

  const state = EditorState.create({
    doc: options.doc,
    extensions: [
      ...markdownEditorBaseSetup,
      markdown(),
      EditorView.lineWrapping,
      options.readOnlyCompartment.of([
        EditorState.readOnly.of(options.readOnlyRef.current),
        EditorView.editable.of(!options.readOnlyRef.current)
      ]),
      options.visibilityCompartment.of(
        createVisibilityExtension(
          createLineEndingVisibilityFeatures(
            options.markerGlyph,
            lineEndingField,
            () => options.expectedLineEndingRef.current,
            () => options.markerGlyphRef.current
          )
        )
      ),
      lineEndingExtension,
      options.whitespaceCompartment.of(
        whitespaceMarkerLayer(() => options.whitespaceSettingsRef.current)
      ),
      createGlossaryCompletionExtension({
        getConfig: () => options.glossaryCompletionRef.current,
        isReadOnly: () => options.readOnlyRef.current
      }),
      options.createUpdateListenerExtension(lineEndingField)
    ]
  });

  return { state, lineEndingField };
}

/** Result of successfully applying changes to a cached document's
 *  `EditorState` — see {@link applyChangesToCachedMarkdownEditorDocumentState}. */
export interface MarkdownEditorDocumentTransactionResult {
  /** The advanced `MarkdownEditorDocumentState` — write this back into
   *  whatever cache Map the caller owns, under the same document key. */
  readonly nextDocumentState: MarkdownEditorDocumentState;
  /** `nextDocumentState.state.doc.toString()` — the caller's
   *  application-side `content` string MUST be updated to exactly this, so
   *  `EditorState.doc` and application content never diverge (#387/#393). */
  readonly content: string;
  /** `nextDocumentState.state.field(cached.lineEndingField)` — the caller's
   *  application-side tracked breaks MUST be updated to exactly this, for
   *  the same reason as `content`. */
  readonly lineEndingBreaks: LineEndingBreakSet;
}

/**
 * #393: applies `changes` to a document's CACHED `EditorState` (no
 * `EditorView` required — see this module's own doc comment on why a bare
 * `EditorState.update()` still runs every StateField, `history()` included,
 * exactly as a live `view.dispatch()` would) as ONE transaction, i.e. one
 * undo step on top of whatever undo history that document already had.
 *
 * Content-integrity gate (Issue #393's top priority, higher than history
 * preservation): `currentContent` MUST be the caller's authoritative
 * application-side content for this document RIGHT NOW. If it does not
 * match `cached.state.doc.toString()`, `changes`' offsets (computed against
 * `currentContent` by the caller, e.g. Open Documents Replace candidate
 * generation) cannot be trusted against the cached state's own document —
 * applying them anyway could corrupt content or throw. Returns `null` in
 * that case; the caller's documented, safe fallback is a plain
 * content-string update with no undo history for this document (exactly
 * #386's pre-#393 behavior) — never forcing the stale state through.
 */
export function applyChangesToCachedMarkdownEditorDocumentState(
  cached: MarkdownEditorDocumentState,
  currentContent: string,
  changes: readonly ChangeSpec[],
  userEvent: string
): MarkdownEditorDocumentTransactionResult | null {
  if (cached.state.doc.toString() !== currentContent) {
    return null;
  }

  const nextState = cached.state.update({ changes, userEvent }).state;

  return {
    nextDocumentState: {
      state: nextState,
      lineEndingField: cached.lineEndingField
    },
    content: nextState.doc.toString(),
    lineEndingBreaks: nextState.field(cached.lineEndingField)
  };
}
