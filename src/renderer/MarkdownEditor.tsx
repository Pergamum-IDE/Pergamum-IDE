import { EditorView } from "@codemirror/view";
import {
  isPreviewToEditorScrollSyncTransaction,
  previewToEditorScrollSyncAnnotation,
  transactionRequestsScrollIntoView
} from "./previewScrollSyncAnnotation";
import { useEffect, useRef } from "react";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type ChangeSpec,
  type AnnotationType,
  type StateField,
  type Text,
  type TransactionSpec
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
import type { EditorScrollSyncAdapter } from "./previewScrollSync";
import type {
  ApplicationEditorWhitespaceSettings,
  ExpectedLineEnding,
  FencedCodeIndentUnit,
  LineEndingMarkerGlyph,
  NewFileLineEnding,
  SelectionHighlightMode,
  TextFilesIndentUnit,
  WorkbenchSoundSettings
} from "../shared/settings";
import {
  fencedCodeIndentUnitFacet,
  indentCommand,
  outdentCommand
} from "./indentCommands";
import { textFileIndentUnitFacet } from "./plainTextIndentCommands";
import { whitespaceMarkerLayer } from "./whitespaceRendering/whitespaceMarkerLayer";
import { createVisibilityExtension } from "./editorVisibility/visibilityFeature";
import { createLineEndingVisibilityFeatures } from "./editorVisibility/lineEndMarkerFeature";
import { documentSwitchTransactionSpec } from "./editorLineEndingField";
import type { LineEndingBreakSet } from "./editorLineEndingField";
import type { LineEndingBreak, LineEndingKind } from "./lineEndingTracking";
import { generateMarkdownTable } from "../shared/markdownTableGenerator";
import { wrapOrInsertInlineMarker } from "../shared/markdownInlineMarkup";
import { applyHeadingToLine } from "../shared/markdownHeadingMarkup";
import { buildMarkdownLink } from "../shared/markdownLinkMarkup";
import { buildFencedCodeBlock } from "../shared/markdownCodeBlockMarkup";
import { buildHorizontalRuleInsertion } from "../shared/markdownHorizontalRuleMarkup";
import {
  buildMarkdownCalloutBlock,
  type MarkdownCalloutType
} from "../shared/markdownCalloutMarkup";
import {
  applyMarkdownListToLines,
  type MarkdownListKind
} from "../shared/markdownListMarkup";
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
  nextActiveFindEditorInstanceId,
  publishCurrentActiveFindConfig,
  unpublishCurrentActiveFindConfig,
  type MarkdownEditorActiveFindConfig
} from "./find/activeFindKeymapExtension";
import {
  activeFindHighlightField,
  clearActiveFindHighlightsEffect,
  setActiveFindHighlightsEffect,
  type ActiveFindHighlightSpec
} from "./find/activeFindHighlightExtension";
import {
  activeFindGutterMarkerField,
  activeFindGutterMarkerCompartment,
  clearActiveFindGutterMarkersEffect,
  createActiveFindGutterMarkerExtension,
  setActiveFindGutterMarkersEffect,
  type ActiveFindGutterMarkerSpec
} from "./find/activeFindGutterMarkerExtension";
import {
  publishCurrentGlossarySelectionShortcutConfig,
  unpublishCurrentGlossarySelectionShortcutConfig,
  type MarkdownEditorGlossarySelectionShortcutConfig
} from "./glossarySelectionShortcutExtension";
import {
  publishCurrentEmphasisMarkShortcutConfig,
  unpublishCurrentEmphasisMarkShortcutConfig,
  type MarkdownEditorEmphasisMarkShortcutConfig
} from "./editorEmphasisShortcuts";
import {
  publishCurrentRubyShortcutConfig,
  unpublishCurrentRubyShortcutConfig,
  type MarkdownEditorRubyShortcutConfig
} from "./editorRubyShortcuts";
import {
  publishCurrentMarkdownToolbarShortcutConfig,
  unpublishCurrentMarkdownToolbarShortcutConfig,
  type MarkdownEditorToolbarShortcutConfig
} from "./editorMarkdownToolbarShortcuts";
import {
  publishCurrentActiveEditorSelectionAccess,
  unpublishCurrentActiveEditorSelectionAccess
} from "./find/activeEditorSelectionAccess";
import {
  createMarkdownEditorDocumentState,
  readOnlyCompartmentContent,
  type MarkdownEditorDocumentState
} from "./markdownEditorDocumentState";
import {
  createSelectionHighlightExtension,
  selectionHighlightCompartment
} from "./selectionHighlightExtension";
import {
  clearPendingImageAttachmentPosition,
  resolvePendingImageAttachmentPosition,
  type PendingImageAttachmentPositionResolution
} from "./markdownImageAttachmentPositionTracker";
import {
  registerEditorViewImageAttachmentPasteOptions,
  unregisterEditorViewImageAttachmentPasteOptions,
  type MarkdownImageAttachmentPasteExtensionOptions,
  type MarkdownImageAttachmentPasteHandler
} from "./markdownImageAttachmentPasteExtension";
import {
  registerEditorViewImageLinkDiagnosticsOptions,
  unregisterEditorViewImageLinkDiagnosticsOptions,
  type MarkdownImageLinkDiagnosticsExtensionOptions
} from "./markdownImageLinkDiagnosticsExtension";
import { createTabCaptureKeymapExtension } from "./tabCaptureKeymapExtension";
import type {
  MarkdownImageLinkDiagnosticReason,
  ProjectLocalImageResolutionContext
} from "../shared/api";

export type { MarkdownEditorGlossaryCompletionConfig };
export type { MarkdownEditorActiveFindConfig };
export type { MarkdownEditorGlossarySelectionShortcutConfig };

interface MarkdownEditorPendingSelection {
  start: number;
  end: number;
  /** #352: `"center"` for an Outline heading jump, otherwise `"nearest"`. */
  scrollY?: "nearest" | "center";
  /**
   * #424: default `true`. `false` keeps DOM focus where it is (used by the
   * Find panel so navigating between matches does not steal focus out of the
   * search box).
   */
  focusEditor?: boolean;
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
   * `markdownFiles.lineEnding` / `textFiles.lineEnding` — the fallback kind for a new line break in
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
   * `editor.undoHistoryMinDepth` (#394 Step 1) — the `history()` extension's
   * `minDepth` for a Markdown document's `EditorState`. Read only at
   * `EditorState` construction time (mount, or a document's first-ever
   * build) — Step 1 deliberately never reconfigures an already-built
   * document's history when this changes later in the same process (see
   * markdownEditorCodeMirrorSetup.ts). Defaults to 100, matching both the
   * Settings Catalog default and `history()`'s own built-in default, so an
   * unset value is behaviorally a no-op.
   */
  undoHistoryMinDepth?: number;
  /**
   * `editor.selectionHighlightMode` (#425) controls only passive selection
   * match highlighting. Active Find / Replace highlights are driven by
   * `activeFindHighlight` below and remain independent.
   */
  selectionHighlightMode?: SelectionHighlightMode;
  /**
   * `editor.findGutterMarkers` (#425): whether Active Find / Replace match
   * lines can show gutter markers. This is independent from passive selection
   * highlighting and from the Find panel's mark-all text highlight toggle.
   */
  findGutterMarkers?: boolean;
  captureTabInEditor?: boolean;
  fencedCodeIndentUnit?: FencedCodeIndentUnit;
  /**
   * #546 (ADR-0014 決定3a / T-12): `true` for a Markdown (`.md`) document,
   * `false` for a plain text (`.txt`) document — a construction-time value
   * (not a live ref, matching `markerGlyph` / `undoHistoryMinDepth` above),
   * since a given `documentKey`'s file extension cannot change while it is
   * open. Threaded to `createMarkdownEditorDocumentState`'s
   * `isMarkdownDocument` option, which sets `documentIsMarkdownFacet` on that
   * document's own `EditorState`. Defaults to `true` so callers that never
   * pass it (e.g. GlossaryEditor's description field) keep today's
   * Markdown-aware indent/outdent behavior unchanged.
   */
  isMarkdownDocument?: boolean;
  /**
   * #546 follow-up: `textFiles.indentUnit` — the configured indent unit for
   * plain text (`.txt`) documents. Live, like `fencedCodeIndentUnit` above
   * (its own compartment/ref + reconfigure effect): a Settings change takes
   * effect on an already-open `.txt` document immediately. Ignored for a
   * Markdown document (`isMarkdownDocument` true). Defaults to `"tab"`,
   * matching the `textFiles.indentUnit` catalog default.
   */
  textFileIndentUnit?: TextFilesIndentUnit;
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
   * #424 Slice 1: Ctrl+F opens the Pergamum active-document Find panel.
   * `undefined` / `null` (the default; the Glossary description field never
   * passes it) leaves Ctrl+F inert. Only EditorSurface's MarkdownEditorSurface
   * supplies it. #425 follow-up: while this component is mounted with a
   * config, it publishes it into the module-level current-Active-Find slot the
   * keymap reads (see find/activeFindKeymapExtension.ts) — so a cached
   * EditorState restored after a remount still reaches the current surface.
   */
  activeFind?: MarkdownEditorActiveFindConfig | null;
  /**
   * #436 Slice 12: Ctrl+G opens/creates a Glossary entry from the current
   * selection. `undefined`/`null` (the default; the Glossary description
   * field never passes it) leaves Ctrl+G inert. Only EditorSurface's
   * MarkdownEditorSurface supplies it. Same module-level-slot publish
   * mechanism as `activeFind` above, for the same reason (a cached
   * EditorState restored after a remount must never call a stale
   * `requestOpen`) — see glossarySelectionShortcutExtension.ts. Whether
   * this prop is present ALSO decides `glossarySelectionShortcutEnabled`
   * passed to `createMarkdownEditorDocumentState` below: only this
   * instance's built document states ever contain the Ctrl+G keydown
   * handler at all, so the description field's states cannot react to
   * whatever config another instance currently has published.
   */
  glossarySelectionShortcut?: MarkdownEditorGlossarySelectionShortcutConfig | null;
  emphasisMarkShortcut?: MarkdownEditorEmphasisMarkShortcutConfig | null;
  rubyShortcut?: MarkdownEditorRubyShortcutConfig | null;
  /**
   * #529: Ctrl+B / Ctrl+I / Ctrl+Shift+X / Ctrl+K / Ctrl+L for the Markdown
   * toolbar commands. `undefined`/`null` (the default; the Glossary
   * description field never passes it) leaves these shortcuts inert. Only
   * EditorSurface's MarkdownEditorSurface supplies it. Same module-level-slot
   * publish mechanism as `emphasisMarkShortcut` above, for the same reason.
   */
  markdownToolbarShortcut?: MarkdownEditorToolbarShortcutConfig | null;
  /**
   * #424: a Find-panel-driven "select + reveal this range" request, kept
   * entirely separate from `pendingSelection` (which App owns for Outline /
   * Go to Line / session restore). A new object is applied once; pass
   * `focusEditor: false` to leave focus in the search box.
   */
  extraPendingSelection?: MarkdownEditorPendingSelection | null;
  onExtraPendingSelectionApplied?: () => void;
  /**
   * #424: a Find-panel-driven "return focus to the editor" request (on panel
   * close). Independent of `focusRequest` (App-owned) so their monotonic id
   * spaces never collide. Applied once per new id for the current document.
   */
  extraFocusRequest?: MarkdownEditorFocusRequest | null;
  /**
   * #424 Slice 2: the "マークする" (mark all) highlight set for the ACTIVE
   * document. `null` clears every highlight (panel closed, mark-all off,
   * empty query, invalid regex, no matches). Ranges are in the current
   * buffer's coordinates.
   */
  activeFindHighlight?: ActiveFindHighlightSpec | null;
  /**
   * #425: line-level gutter markers for active-document Find / Replace
   * matches. `null` clears the marker set. The boolean setting gate is the
   * separate `findGutterMarkers` prop above.
   */
  activeFindGutterMarkers?: ActiveFindGutterMarkerSpec | null;
  /**
   * #407 B3: optional foundation for clipboard image paste. When omitted,
   * the CodeMirror paste handler deliberately returns false before calling
   * `preventDefault()`, so B4's unimplemented orchestration cannot break
   * ordinary text/html paste.
   */
  onImageAttachmentPaste?: MarkdownImageAttachmentPasteHandler;
  onImageAttachmentPositionControllerChange?: (
    controller: MarkdownImageAttachmentPositionController | null
  ) => void;
  imageAttachmentSourceDocumentId?: string;
  imageAttachmentSourceEditorId?: string;
  createImageAttachmentPendingId?: () => string;
  /**
   * #411 / #412: how the edited surface anchors project-local image links for
   * the broken-image-link lint extension (gutter + inline warning).
   * `{ kind: "sourceFile", ... }` for a project Markdown document editor,
   * `{ kind: "projectRoot" }` for the Glossary description editor. `{ kind:
   * "none" }` / omitted (standalone / non-project / read-only) — the lint
   * extension is not added to the EditorState at all.
   */
  imageLinkDiagnosticsResolutionContext?: ProjectLocalImageResolutionContext;
  /** #411: localized hover message for a diagnostic reason + offending src. */
  formatImageLinkDiagnosticMessage?: (
    reason: MarkdownImageLinkDiagnosticReason,
    src: string
  ) => string;
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
  /** #503: callback when the editor view scroller DOM element mounts or unmounts. */
  onScrollerMount?: (scroller: HTMLElement | null) => void;
  /** #503: callback when the EditorView scroll-sync adapter mounts or unmounts. */
  onScrollSyncAdapterMount?: (adapter: EditorScrollSyncAdapter | null) => void;
  /**
   * #505 Phase 1: fired when a dispatched transaction carries an
   * `EditorView.scrollIntoView(...)` effect — an editor-internal jump
   * (incremental find, Quick Open, outline, restoreViewState, #504's own
   * jump, ...) — so it can take editor leadership in the preview<->editor
   * scroll-sync leader tracker. NOT fired for a transaction carrying the
   * #505 preview -> editor sync's own annotation (see
   * previewScrollSyncAnnotation.ts) — that one must not take leadership, or
   * the sync direction would invert into a feedback loop.
   */
  onEditorScrollIntoViewTransaction?: () => void;
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
   * #424 Slice 3: the live buffer text of the shared active EditorView, or
   * `null` when no view is mounted. The active-document Find panel re-reads
   * this immediately before a replace so it never applies match offsets that
   * were computed against a slightly-stale React `content` prop.
   */
  getBufferText(): string | null;
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
  /**
   * #527: Inserts a GFM Markdown table skeleton at current editor selection/cursor.
   */
  insertTable(columns: number, rows: number): boolean;
  /**
   * #529: wraps the current selection with `marker` (or inserts an empty
   * marker pair with the cursor between them when there is no selection).
   * Shared by the Bold (`**`) / Italic (`*`) / Strikethrough (`~~`) toolbar
   * buttons and their keyboard shortcuts.
   */
  applyInlineMarkup(marker: "**" | "*" | "~~"): boolean;
  /**
   * #529: applies (or removes, for `"normal"`) an ATX heading marker to every
   * line touched by the current primary selection (a single line when the
   * selection is empty). Existing heading markers are replaced, not
   * duplicated.
   */
  applyHeading(level: 1 | 2 | 3 | 4 | 5 | 6 | "normal"): boolean;
  /**
   * #529: replaces the current selection with a Markdown link built from
   * `labelText` and `url`. See `src/shared/markdownLinkMarkup.ts` for the
   * exact text/cursor-placement rules.
   */
  insertLink(labelText: string, url: string): boolean;
  /**
   * #531: the current primary selection's document-coordinate range, or
   * `null` when no view is mounted. Lets a toolbar button (which has no
   * direct CodeMirror `view` access, unlike a keymap handler) read the
   * selection it needs before opening the existing Ruby / Emphasis Mark
   * dialogs — mirrors `getBufferText()`'s existing "read live state for
   * App-level orchestration" role. Primary selection only; no multi-cursor
   * support.
   */
  getSelection(): { from: number; to: number } | null;
  /**
   * #531: inserts a Markdown horizontal rule (with its own trailing blank
   * line) at the current selection, padded against surrounding content by
   * the same blank-line rule as `insertTable`.
   */
  insertHorizontalRule(): boolean;
  /**
   * #531: wraps the current selection in a fenced code block (or inserts an
   * empty one with the cursor inside when there is no selection), padded
   * against surrounding content by the same blank-line rule as
   * `insertTable`.
   */
  insertCodeBlock(): boolean;
  /**
   * #570: inserts a `> [!TYPE]` callout (see
   * `markdownCalloutInsertionTransactionSpec`) as one undoable transaction,
   * then focuses the editor so the body can be typed immediately.
   */
  insertCallout(type: MarkdownCalloutType): boolean;
  /**
   * #533: applies (or, for a same-type touched selection, removes) a
   * Markdown list marker on every line touched by the current primary
   * selection (a single line when the selection is empty). See
   * `src/shared/markdownListMarkup.ts` for the exact recognition/toggle
   * rules.
   */
  applyList(kind: MarkdownListKind): boolean;
  /**
   * #533: the Indent / Outdent toolbar buttons' entry point. Calls the
   * existing `Mod+]` / `Mod+[` command functions directly
   * (`indentCommands.ts`) rather than reimplementing their Markdown-aware
   * per-context logic (list sink/lift, blockquote, fenced code, ...).
   */
  indent(): boolean;
  outdent(): boolean;
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

export interface MarkdownImageAttachmentPositionController {
  resolvePendingPosition(
    pendingId: string
  ): PendingImageAttachmentPositionResolution;
  clearPendingPosition(pendingId: string): boolean;
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

/**
 * #531: shared leading/trailing blank-line padding for block-level toolbar
 * insertions (table, horizontal rule, code block) at `from`/`to` in `doc` —
 * extracted from #527's `insertTable` without changing its behavior. Looks
 * at the one or two characters immediately before/after the insertion point
 * and adds just enough newlines so the inserted block sits on its own
 * blank-line-delimited paragraph, never stacking extra blank lines when one
 * already exists (including at the very start/end of the document).
 */
function computeBlockInsertionPadding(
  doc: Text,
  from: number,
  to: number
): { leadingLines: string; trailingLines: string } {
  const docLength = doc.length;

  let leadingLines = "";
  if (from > 0) {
    const charBefore = doc.sliceString(from - 1, from);
    if (charBefore !== "\n") {
      leadingLines = "\n\n";
    } else {
      const char2Before = from >= 2 ? doc.sliceString(from - 2, from - 1) : "";
      if (char2Before !== "\n") {
        leadingLines = "\n";
      }
    }
  }

  let trailingLines = "";
  if (to < docLength) {
    const charAfter = doc.sliceString(to, to + 1);
    if (charAfter !== "\n") {
      trailingLines = "\n\n";
    } else {
      const char2After = to + 2 <= docLength ? doc.sliceString(to + 1, to + 2) : "";
      if (char2After !== "\n") {
        trailingLines = "\n";
      }
    }
  }

  return { leadingLines, trailingLines };
}

/**
 * #570: the single transaction for the callout toolbar command.
 *
 * - Empty selection: inserts the `> [!TYPE]\n> ` template at the cursor and
 *   leaves the cursor after the body line's `> `.
 * - Non-empty selection: line-based — the whole touched line range (a
 *   selection ending at column 0 of a later line does not include that
 *   line) becomes the callout body, each line prefixed with `> `.
 *
 * Both cases use the same blank-line padding as the other block insertions
 * (table / horizontal rule / code block), so the callout never starts
 * mid-line and following text never becomes a lazy continuation of it.
 */
export function markdownCalloutInsertionTransactionSpec(
  state: EditorState,
  type: MarkdownCalloutType
): TransactionSpec {
  const doc = state.doc;
  const selection = state.selection.main;
  let from = selection.from;
  let to = selection.to;
  let bodyLines: string[] = [];

  if (!selection.empty) {
    const firstLine = doc.lineAt(from);
    let lastLine = doc.lineAt(to);
    if (to === lastLine.from && lastLine.number > firstLine.number) {
      lastLine = doc.line(lastLine.number - 1);
    }
    from = firstLine.from;
    to = lastLine.to;
    bodyLines = doc.sliceString(from, to).split("\n");
  }

  const { leadingLines, trailingLines } = computeBlockInsertionPadding(
    doc,
    from,
    to
  );
  const { text, selectionOffsetFromInsertStart } = buildMarkdownCalloutBlock(
    type,
    bodyLines
  );

  return {
    changes: { from, to, insert: leadingLines + text + trailingLines },
    selection: {
      anchor: from + leadingLines.length + selectionOffsetFromInsertStart
    },
    scrollIntoView: true,
    userEvent: "input.replace"
  };
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
  undoHistoryMinDepth = 100,
  selectionHighlightMode = "default",
  findGutterMarkers = false,
  captureTabInEditor = false,
  fencedCodeIndentUnit = "spaces4",
  isMarkdownDocument = true,
  textFileIndentUnit = "tab",
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
  activeFind,
  glossarySelectionShortcut,
  emphasisMarkShortcut,
  rubyShortcut,
  markdownToolbarShortcut,
  extraPendingSelection,
  onExtraPendingSelectionApplied,
  extraFocusRequest,
  activeFindHighlight,
  activeFindGutterMarkers,
  onImageAttachmentPaste,
  onImageAttachmentPositionControllerChange,
  imageAttachmentSourceDocumentId,
  imageAttachmentSourceEditorId,
  createImageAttachmentPendingId,
  imageLinkDiagnosticsResolutionContext = { kind: "none" },
  formatImageLinkDiagnosticMessage,
  documentStates: documentStatesProp,
  onScrollerMount,
  onScrollSyncAdapterMount,
  onEditorScrollIntoViewTransaction
}: MarkdownEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onScrollerMountRef = useRef(onScrollerMount);
  useEffect(() => {
    onScrollerMountRef.current = onScrollerMount;
  }, [onScrollerMount]);
  const onScrollSyncAdapterMountRef = useRef(onScrollSyncAdapterMount);
  useEffect(() => {
    onScrollSyncAdapterMountRef.current = onScrollSyncAdapterMount;
  }, [onScrollSyncAdapterMount]);
  const onEditorScrollIntoViewTransactionRef = useRef(
    onEditorScrollIntoViewTransaction
  );
  useEffect(() => {
    onEditorScrollIntoViewTransactionRef.current =
      onEditorScrollIntoViewTransaction;
  }, [onEditorScrollIntoViewTransaction]);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const visibilityCompartmentRef = useRef<Compartment | null>(null);
  // #256: owns the whitespace-marker layer so a runtime Settings change is
  // a compartment reconfigure (tearing down / rebuilding just this layer),
  // never an EditorView rebuild.
  const whitespaceCompartmentRef = useRef<Compartment | null>(null);
  const tabCaptureCompartmentRef = useRef<Compartment | null>(null);
  const captureTabInEditorRef = useRef(captureTabInEditor);
  const fencedCodeIndentUnitCompartmentRef = useRef<Compartment | null>(null);
  const fencedCodeIndentUnitRef = useRef(fencedCodeIndentUnit);
  const textFileIndentUnitCompartmentRef = useRef<Compartment | null>(null);
  const textFileIndentUnitRef = useRef(textFileIndentUnit);
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
  // #424 / #425 follow-up: the Ctrl+F / Ctrl+H keymap routes through a
  // module-level current-config slot (see find/activeFindKeymapExtension.ts),
  // NOT a mount-local ref — a cached EditorState (and its baked keymap) can
  // outlive this component. The effect below publishes this editor's
  // `activeFind` prop into that slot while mounted. The opaque id is only used
  // for the `activeFind.*` debug logs.
  const activeFindEditorInstanceId = useRef(
    nextActiveFindEditorInstanceId()
  ).current;
  const imageAttachmentPasteHandlerRef =
    useRef<MarkdownImageAttachmentPasteHandler | null>(
      onImageAttachmentPaste ?? null
    );
  const imageAttachmentSourceDocumentIdRef = useRef<string | null>(
    imageAttachmentSourceDocumentId ?? null
  );
  const imageAttachmentSourceEditorIdRef = useRef<string | undefined>(
    imageAttachmentSourceEditorId
  );
  // Only ever set at mount, from that first render's documentKey (see the
  // document-switch effect below for why this must not reset on every
  // render).
  const documentKeyRef = useRef(documentKey);
  const currentImageAttachmentPasteOptionsRef =
    useRef<MarkdownImageAttachmentPasteExtensionOptions>({
      getHandler: () => imageAttachmentPasteHandlerRef.current,
      getSourceDocumentId: () =>
        imageAttachmentSourceDocumentIdRef.current ?? documentKeyRef.current,
      getSourceEditorId: () => imageAttachmentSourceEditorIdRef.current,
      isReadOnly: () => readOnlyRef.current,
      createPendingId: createImageAttachmentPendingId
    });
  // #411: kept fresh so the lint extension baked into a cached EditorState
  // (which can outlive this component's mount — see #392) always resolves the
  // CURRENT active document's path / message formatter, exactly like the
  // paste options above. The extension is only PRESENT in the state at all
  // when this prop was non-null at that document's build time.
  const imageLinkDiagnosticsResolutionContextRef =
    useRef<ProjectLocalImageResolutionContext>(
      imageLinkDiagnosticsResolutionContext
    );
  const formatImageLinkDiagnosticMessageRef = useRef<
    MarkdownEditorProps["formatImageLinkDiagnosticMessage"]
  >(formatImageLinkDiagnosticMessage);
  const currentImageLinkDiagnosticsOptionsRef =
    useRef<MarkdownImageLinkDiagnosticsExtensionOptions>({
      getResolutionContext: () =>
        imageLinkDiagnosticsResolutionContextRef.current,
      validate: (request) =>
        window.pergamum.markdownImageLinkDiagnostics.validate(request),
      formatMessage: (reason, src) =>
        formatImageLinkDiagnosticMessageRef.current?.(reason, src) ??
        `${reason}: ${src}`
    });
  // #253: read fresh by the tracking field's `update()` on every
  // transaction (see createLineEndingTrackingField), so a runtime change
  // to the effective Markdown/Text file line-ending setting takes effect for
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
  const selectionHighlightModeRef =
    useRef<SelectionHighlightMode>(selectionHighlightMode);
  const findGutterMarkersRef = useRef(findGutterMarkers);
  // #387: points at whichever document is CURRENTLY active's own
  // `lineEndingField` instance (each document gets its own — see
  // markdownEditorDocumentState.ts), kept fresh here so the
  // settings-reconfigure effects below can build a marker feature against
  // the right field without needing to know about document switching
  // themselves. Swapped, never mutated in place, on every genuine switch.
  const lineEndingFieldRef = useRef<StateField<LineEndingBreakSet> | null>(
    null
  );
  const activeDocumentStateRef = useRef<MarkdownEditorDocumentState | null>(
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

  if (!tabCaptureCompartmentRef.current) {
    tabCaptureCompartmentRef.current = new Compartment();
  }
  const tabCaptureCompartment = tabCaptureCompartmentRef.current;

  if (!fencedCodeIndentUnitCompartmentRef.current) {
    fencedCodeIndentUnitCompartmentRef.current = new Compartment();
  }
  const fencedCodeIndentUnitCompartment =
    fencedCodeIndentUnitCompartmentRef.current;

  if (!textFileIndentUnitCompartmentRef.current) {
    textFileIndentUnitCompartmentRef.current = new Compartment();
  }
  const textFileIndentUnitCompartment =
    textFileIndentUnitCompartmentRef.current;

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
      // #505 Phase 1: an editor-internal jump (incremental find, Quick
      // Open, outline, restoreViewState, #504's own jump, ...) takes editor
      // leadership too — EXCEPT our own preview -> editor sync write, which
      // must not (see previewToEditorScrollSyncAnnotation's doc comment).
      for (const tr of update.transactions) {
        if (isPreviewToEditorScrollSyncTransaction(tr)) {
          continue;
        }
        if (transactionRequestsScrollIntoView(tr)) {
          onEditorScrollIntoViewTransactionRef.current?.();
          break;
        }
      }

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
  // `undoHistoryMinDepth` (#394 Step 1) is the same kind of construction-time
  // value — read once per document build, never made live via a ref, since
  // Step 1 does not reconfigure an existing document's history extension.
  function buildDocumentState(
    docContent: string,
    docInitialBreaks: readonly LineEndingBreak[]
  ): MarkdownEditorDocumentState {
    return createMarkdownEditorDocumentState({
      doc: docContent,
      initialLineEndingBreaks: docInitialBreaks,
      undoHistoryMinDepth,
      newFileLineEndingFallbackRef,
      readOnlyCompartment,
      readOnlyRef,
      visibilityCompartment,
      markerGlyph,
      expectedLineEndingRef,
      markerGlyphRef,
      whitespaceCompartment,
      whitespaceSettingsRef,
      selectionHighlightCompartment,
      selectionHighlightModeRef,
      findGutterMarkerCompartment: activeFindGutterMarkerCompartment,
      findGutterMarkersRef,
      tabCaptureCompartment,
      captureTabInEditorRef,
      fencedCodeIndentUnitCompartment,
      fencedCodeIndentUnitRef,
      isMarkdownDocument,
      textFileIndentUnitCompartment,
      textFileIndentUnitRef,
      glossaryCompletionRef,
      activeFindDiagnostics: {
        editorInstanceId: activeFindEditorInstanceId,
        expectActiveFindSurface: (activeFind ?? null) !== null
      },
      // #436 Slice 12 remediation: mirrors `expectActiveFindSurface` above —
      // this is a construction-time decision (not a live ref) of whether THIS
      // MarkdownEditor instance is the one that ever publishes
      // `glossarySelectionShortcut`. The Glossary description field never
      // receives that prop, so its built states always get `false` here and
      // never contain the Ctrl+G keydown handler at all.
      glossarySelectionShortcutEnabled: (glossarySelectionShortcut ?? null) !== null,
      emphasisMarkShortcutEnabled: (emphasisMarkShortcut ?? null) !== null,
      rubyShortcutEnabled: (rubyShortcut ?? null) !== null,
      markdownToolbarShortcutEnabled:
        (markdownToolbarShortcut ?? null) !== null,
      imageAttachmentPasteOptions:
        currentImageAttachmentPasteOptionsRef.current,
      // #411 / #412: only add the broken-image-link lint extension when the
      // surface has a real resolution context (`sourceFile` for a project
      // Markdown document editor, `projectRoot` for the Glossary editor). A
      // given documentKey's context KIND is stable for its lifetime, so
      // deciding at build time is safe; the exact context is read live from
      // the ref by the linter.
      imageLinkDiagnosticsOptions:
        imageLinkDiagnosticsResolutionContext.kind !== "none"
          ? currentImageLinkDiagnosticsOptionsRef.current
          : undefined,
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
    documentState: MarkdownEditorDocumentState
  ) {
    return [
      readOnlyCompartment.reconfigure(
        readOnlyCompartmentContent(readOnlyRef.current)
      ),
      documentState.visibilityCompartment.reconfigure(
        createVisibilityExtension(
          createLineEndingVisibilityFeatures(
            markerGlyphRef.current,
            documentState.lineEndingField,
            () => expectedLineEndingRef.current,
            () => markerGlyphRef.current
          )
        )
      ),
      whitespaceCompartment.reconfigure(
        whitespaceMarkerLayer(() => whitespaceSettingsRef.current)
      ),
      selectionHighlightCompartment.reconfigure(
        createSelectionHighlightExtension(selectionHighlightModeRef.current)
      ),
      activeFindGutterMarkerCompartment.reconfigure(
        createActiveFindGutterMarkerExtension(findGutterMarkersRef.current)
      ),
      tabCaptureCompartment.reconfigure(
        createTabCaptureKeymapExtension(captureTabInEditorRef.current)
      ),
      fencedCodeIndentUnitCompartment.reconfigure(
        fencedCodeIndentUnitFacet.of(fencedCodeIndentUnitRef.current)
      ),
      textFileIndentUnitCompartment.reconfigure(
        textFileIndentUnitFacet.of(textFileIndentUnitRef.current)
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

  function cacheActiveDocumentState(view: EditorView): void {
    const activeDocumentState = activeDocumentStateRef.current;

    if (!activeDocumentState) {
      return;
    }

    const nextDocumentState: MarkdownEditorDocumentState = {
      ...activeDocumentState,
      state: view.state,
      lineEndingField: lineEndingFieldRef.current!
    };
    activeDocumentStateRef.current = nextDocumentState;
    documentStates.set(documentKeyRef.current, nextDocumentState);
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

  // #425 follow-up: publish this editor's `activeFind` config into the
  // module-level current-Active-Find slot the Ctrl+F / Ctrl+H keymap reads.
  // Only the one MarkdownEditor that actually gets a config (EditorSurface's
  // MarkdownEditorSurface) publishes; the Glossary description field passes
  // none and stays inert. Cleanup is identity-checked so a remount's publish
  // is never clobbered by the outgoing mount's teardown.
  useEffect(() => {
    if (!activeFind) {
      return undefined;
    }
    publishCurrentActiveFindConfig({
      config: activeFind,
      editorInstanceId: activeFindEditorInstanceId
    });
    return () => {
      unpublishCurrentActiveFindConfig(activeFind);
    };
  }, [activeFind, activeFindEditorInstanceId]);

  // #436 Slice 12: same publish/unpublish shape as `activeFind` above, for
  // the same module-level-slot reason. Only EditorSurface's
  // MarkdownEditorSurface passes `glossarySelectionShortcut`; the Glossary
  // description field passes none and stays inert.
  useEffect(() => {
    if (!glossarySelectionShortcut) {
      return undefined;
    }
    publishCurrentGlossarySelectionShortcutConfig(glossarySelectionShortcut);
    return () => {
      unpublishCurrentGlossarySelectionShortcutConfig(glossarySelectionShortcut);
    };
  }, [glossarySelectionShortcut]);

  useEffect(() => {
    if (!emphasisMarkShortcut) {
      return undefined;
    }
    publishCurrentEmphasisMarkShortcutConfig(emphasisMarkShortcut);
    return () => {
      unpublishCurrentEmphasisMarkShortcutConfig(emphasisMarkShortcut);
    };
  }, [emphasisMarkShortcut]);

  useEffect(() => {
    if (!rubyShortcut) {
      return undefined;
    }
    publishCurrentRubyShortcutConfig(rubyShortcut);
    return () => {
      unpublishCurrentRubyShortcutConfig(rubyShortcut);
    };
  }, [rubyShortcut]);

  useEffect(() => {
    if (!markdownToolbarShortcut) {
      return undefined;
    }
    publishCurrentMarkdownToolbarShortcutConfig(markdownToolbarShortcut);
    return () => {
      unpublishCurrentMarkdownToolbarShortcutConfig(markdownToolbarShortcut);
    };
  }, [markdownToolbarShortcut]);

  // #457: publish this editor's live-selection reader into the module-level
  // slot the Project Search / Replace Ctrl+Shift+F / Ctrl+Shift+H selection
  // resolver reads as its CodeMirror-selection fallback. Reuses `activeFind`
  // (rather than a new prop) as the "this is the main document editor, not
  // the Glossary description field's editor" gate - same shape/reasoning as
  // the two publishes above.
  useEffect(() => {
    if (!activeFind) {
      return undefined;
    }
    const access = {
      getSelectionText: (): string => {
        const view = viewRef.current;
        if (!view) {
          return "";
        }
        const selection = view.state.selection.main;
        return selection.empty
          ? ""
          : view.state.sliceDoc(selection.from, selection.to);
      }
    };
    publishCurrentActiveEditorSelectionAccess(access);
    return () => {
      unpublishCurrentActiveEditorSelectionAccess(access);
    };
  }, [activeFind]);

  useEffect(() => {
    imageAttachmentPasteHandlerRef.current = onImageAttachmentPaste ?? null;
    if (viewRef.current) {
      registerEditorViewImageAttachmentPasteOptions(
        viewRef.current,
        currentImageAttachmentPasteOptionsRef.current
      );
    }
  }, [onImageAttachmentPaste]);

  useEffect(() => {
    imageAttachmentSourceDocumentIdRef.current =
      imageAttachmentSourceDocumentId ?? null;
    imageAttachmentSourceEditorIdRef.current = imageAttachmentSourceEditorId;
    if (viewRef.current) {
      registerEditorViewImageAttachmentPasteOptions(
        viewRef.current,
        currentImageAttachmentPasteOptionsRef.current
      );
    }
  }, [imageAttachmentSourceDocumentId, imageAttachmentSourceEditorId]);

  useEffect(() => {
    imageLinkDiagnosticsResolutionContextRef.current =
      imageLinkDiagnosticsResolutionContext;
    formatImageLinkDiagnosticMessageRef.current =
      formatImageLinkDiagnosticMessage;
    if (viewRef.current) {
      registerEditorViewImageLinkDiagnosticsOptions(
        viewRef.current,
        currentImageLinkDiagnosticsOptionsRef.current
      );
    }
  }, [
    imageLinkDiagnosticsResolutionContext,
    formatImageLinkDiagnosticMessage
  ]);

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
    activeDocumentStateRef.current = resolved.documentState;
    documentStates.set(documentKeyRef.current, resolved.documentState);

    const view = new EditorView({
      parent: hostRef.current,
      state: resolved.documentState.state
    });
    registerEditorViewImageAttachmentPasteOptions(
      view,
      currentImageAttachmentPasteOptionsRef.current
    );
    registerEditorViewImageLinkDiagnosticsOptions(
      view,
      currentImageLinkDiagnosticsOptionsRef.current
    );

    if (resolved.wasRestoredFromCache) {
      view.dispatch({
        effects: reconcileSettingsEffects(resolved.documentState)
      });
    }

    viewRef.current = view;
    onScrollerMountRef.current?.(view.scrollDOM);

    const adapter: EditorScrollSyncAdapter = {
      scroller: view.scrollDOM,
      getTopSourceLine: () => {
        try {
          const topOffset = view.scrollDOM.scrollTop;
          const block = view.lineBlockAtHeight(topOffset);
          return view.state.doc.lineAt(block.from).number;
        } catch {
          return null;
        }
      },
      scrollToSourceLine: (targetLine: number) => {
        try {
          const totalLines = view.state.doc.lines;
          const clamped = Math.max(1, Math.min(Math.floor(targetLine), totalLines));
          const line = view.state.doc.line(clamped);
          view.dispatch({
            effects: EditorView.scrollIntoView(line.from, { y: "start" }),
            // #505 Phase 1: this IS the preview -> editor sync write — must
            // carry this annotation so the update listener above does not
            // treat it as an editor-internal jump and steal leadership back
            // (which would invert the sync direction into a feedback loop).
            annotations: previewToEditorScrollSyncAnnotation.of(true)
          });
        } catch {
          // ignore
        }
      },
      getDocLineCount: () => view.state.doc.lines,
      jumpToSourceLine: (targetLine: number) => {
        try {
          const totalLines = view.state.doc.lines;
          const clamped = Math.max(1, Math.min(Math.floor(targetLine), totalLines));
          const line = view.state.doc.line(clamped);
          view.dispatch({
            selection: { anchor: line.from },
            effects: EditorView.scrollIntoView(line.from, { y: "center" })
          });
          view.focus();
        } catch {
          // ignore
        }
      }
    };
    onScrollSyncAdapterMountRef.current?.(adapter);

    // First push once the initial layout has settled.
    scheduleVisibleRangePush();

    return () => {
      onScrollSyncAdapterMountRef.current?.(null);
      onScrollerMountRef.current?.(null);
      unregisterEditorViewImageAttachmentPasteOptions(view);
      unregisterEditorViewImageLinkDiagnosticsOptions(view);
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
      // #424 Slice 2: as in the switch path, drop transient Find highlights
      // before caching so a later remount never restores them.
      view.dispatch({
        effects: [
          clearActiveFindHighlightsEffect.of(null),
          clearActiveFindGutterMarkersEffect.of(null)
        ]
      });
      cacheActiveDocumentState(view);
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
      getBufferText: () => viewRef.current?.state.doc.toString() ?? null,
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
      },
      insertTable: (columns: number, rows: number): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const selection = view.state.selection.main;
        const { from, to } = selection;
        const doc = view.state.doc;

        const tableText = generateMarkdownTable(columns, rows);
        const { leadingLines, trailingLines } = computeBlockInsertionPadding(
          doc,
          from,
          to
        );

        const insertText = leadingLines + tableText + trailingLines;
        const firstHeaderCellOffset = 2;
        const targetCursorPos = from + leadingLines.length + firstHeaderCellOffset;

        view.dispatch({
          changes: { from, to, insert: insertText },
          selection: { anchor: targetCursorPos },
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      applyInlineMarkup: (marker: "**" | "*" | "~~"): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);
        const { text, selectionOffsetFromInsertStart } =
          wrapOrInsertInlineMarker(selectedText, marker);

        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + selectionOffsetFromInsertStart },
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      applyHeading: (level: 1 | 2 | 3 | 4 | 5 | 6 | "normal"): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const doc = view.state.doc;
        const firstLine = doc.lineAt(from);
        const lastLine = doc.lineAt(to);

        const changes: ChangeSpec[] = [];
        for (
          let lineNumber = firstLine.number;
          lineNumber <= lastLine.number;
          lineNumber++
        ) {
          const line = doc.line(lineNumber);
          const newText = applyHeadingToLine(line.text, level);
          if (newText !== line.text) {
            changes.push({ from: line.from, to: line.to, insert: newText });
          }
        }

        if (changes.length === 0) {
          return true;
        }

        // No explicit `selection`: CodeMirror maps the existing selection
        // through `changes` automatically, which is the right behavior here
        // (per-line prefix edits, not a single replace like the other
        // commands above).
        view.dispatch({
          changes,
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      insertLink: (labelText: string, url: string): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const { text, selectionOffsetFromInsertStart } = buildMarkdownLink(
          labelText,
          url
        );

        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + selectionOffsetFromInsertStart },
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      getSelection: () => {
        const view = viewRef.current;
        if (!view) {
          return null;
        }
        const { from, to } = view.state.selection.main;
        return { from, to };
      },
      insertHorizontalRule: (): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const doc = view.state.doc;
        const { leadingLines, trailingLines } = computeBlockInsertionPadding(
          doc,
          from,
          to
        );
        const { text, selectionOffsetFromInsertStart } =
          buildHorizontalRuleInsertion();

        view.dispatch({
          changes: {
            from,
            to,
            insert: leadingLines + text + trailingLines
          },
          selection: {
            anchor: from + leadingLines.length + selectionOffsetFromInsertStart
          },
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      insertCodeBlock: (): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const doc = view.state.doc;
        const selectedText = view.state.sliceDoc(from, to);
        const { leadingLines, trailingLines } = computeBlockInsertionPadding(
          doc,
          from,
          to
        );
        const { text, selectionOffsetFromInsertStart } =
          buildFencedCodeBlock(selectedText);

        view.dispatch({
          changes: {
            from,
            to,
            insert: leadingLines + text + trailingLines
          },
          selection: {
            anchor: from + leadingLines.length + selectionOffsetFromInsertStart
          },
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      insertCallout: (type: MarkdownCalloutType): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        view.dispatch(markdownCalloutInsertionTransactionSpec(view.state, type));
        view.focus();

        return true;
      },
      applyList: (kind: MarkdownListKind): boolean => {
        const view = viewRef.current;
        if (!view || readOnlyRef.current) {
          return false;
        }

        const { from, to } = view.state.selection.main;
        const doc = view.state.doc;
        const firstLineNumber = doc.lineAt(from).number;
        const lastLineNumber = doc.lineAt(to).number;

        const lineNumbers: number[] = [];
        for (let n = firstLineNumber; n <= lastLineNumber; n++) {
          lineNumbers.push(n);
        }

        const originalLines = lineNumbers.map((n) => doc.line(n).text);
        const newLines = applyMarkdownListToLines(originalLines, kind);

        const changes: ChangeSpec[] = [];
        // Explicit cursor override only for the one case the pure helper's
        // doc comment calls out by position (single blank line, no
        // selection): CodeMirror's default change-mapping of a caret sitting
        // exactly at the start of a replaced empty range is ambiguous, so
        // leaving it to auto-map risks landing the cursor BEFORE the new
        // marker instead of after it. Every other case (real body text, or a
        // multi-line selection) auto-maps through `changes` correctly, same
        // as `applyHeading` above.
        let cursorOverride: number | null = null;

        lineNumbers.forEach((n, i) => {
          if (newLines[i] === originalLines[i]) {
            return;
          }
          const line = doc.line(n);
          changes.push({ from: line.from, to: line.to, insert: newLines[i] });
          if (lineNumbers.length === 1 && originalLines[i].trim().length === 0) {
            cursorOverride = line.from + newLines[i].length;
          }
        });

        if (changes.length === 0) {
          return true;
        }

        view.dispatch({
          changes,
          ...(cursorOverride !== null
            ? { selection: { anchor: cursorOverride } }
            : {}),
          scrollIntoView: true,
          userEvent: "input.replace"
        });

        return true;
      },
      indent: (): boolean => {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        // `indentCommand` itself reads `EditorState.readOnly` — no separate
        // `readOnlyRef` guard needed here.
        return indentCommand(view);
      },
      outdent: (): boolean => {
        const view = viewRef.current;
        if (!view) {
          return false;
        }
        return outdentCommand(view);
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
    if (!onImageAttachmentPositionControllerChange) {
      return undefined;
    }

    const controller: MarkdownImageAttachmentPositionController = {
      resolvePendingPosition: (pendingId) => {
        const view = viewRef.current;

        return view
          ? resolvePendingImageAttachmentPosition(view.state, pendingId)
          : null;
      },
      clearPendingPosition: (pendingId) => {
        const view = viewRef.current;

        if (!view) {
          return false;
        }

        view.dispatch({
          effects: clearPendingImageAttachmentPosition.of(pendingId)
        });
        return true;
      }
    };

    onImageAttachmentPositionControllerChange(controller);

    return () => onImageAttachmentPositionControllerChange(null);
  }, [onImageAttachmentPositionControllerChange]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        readOnlyCompartmentContent(readOnly)
      )
    });
  }, [readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    const activeDocumentState = activeDocumentStateRef.current;

    if (!view || !activeDocumentState) {
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
      effects: activeDocumentState.visibilityCompartment.reconfigure(
        createVisibilityExtension(
          createLineEndingVisibilityFeatures(
            markerGlyphRef.current,
            activeDocumentState.lineEndingField,
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
    selectionHighlightModeRef.current = selectionHighlightMode;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: selectionHighlightCompartment.reconfigure(
        createSelectionHighlightExtension(selectionHighlightMode)
      )
    });
  }, [selectionHighlightMode]);

  useEffect(() => {
    findGutterMarkersRef.current = findGutterMarkers;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: activeFindGutterMarkerCompartment.reconfigure(
        createActiveFindGutterMarkerExtension(findGutterMarkers)
      )
    });
  }, [findGutterMarkers]);

  useEffect(() => {
    captureTabInEditorRef.current = captureTabInEditor;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: tabCaptureCompartment.reconfigure(
        createTabCaptureKeymapExtension(captureTabInEditor)
      )
    });
  }, [captureTabInEditor]);

  useEffect(() => {
    fencedCodeIndentUnitRef.current = fencedCodeIndentUnit;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: fencedCodeIndentUnitCompartment.reconfigure(
        fencedCodeIndentUnitFacet.of(fencedCodeIndentUnit)
      )
    });
  }, [fencedCodeIndentUnit]);

  useEffect(() => {
    textFileIndentUnitRef.current = textFileIndentUnit;

    const view = viewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: textFileIndentUnitCompartment.reconfigure(
        textFileIndentUnitFacet.of(textFileIndentUnit)
      )
    });
  }, [textFileIndentUnit]);

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
      // #424 Slice 2: Find "mark all" highlights are transient panel UI — drop
      // them from the OUTGOING document's state before it is cached, so
      // switching back later never restores stale highlights.
      view.dispatch({
        effects: [
          clearActiveFindHighlightsEffect.of(null),
          clearActiveFindGutterMarkersEffect.of(null)
        ]
      });
      // #387/#392: cache the OUTGOING document's live EditorState (its full
      // undo history included) under the key it is STILL showing, before
      // that key ref advances below.
      cacheActiveDocumentState(view);
      documentKeyRef.current = documentKey;

      const resolved = resolveDocumentState(
        documentKey,
        value,
        initialLineEndingBreaks
      );
      view.setState(resolved.documentState.state);
      lineEndingFieldRef.current = resolved.documentState.lineEndingField;
      activeDocumentStateRef.current = resolved.documentState;

      if (resolved.wasRestoredFromCache) {
        view.dispatch({
          effects: reconcileSettingsEffects(resolved.documentState)
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

  // #424: the Find panel's "select + reveal this match" request. Same shape as
  // the effect above but its own prop, so App's pendingSelection flow is
  // untouched, and `focusEditor: false` keeps focus in the search box.
  useEffect(() => {
    const view = viewRef.current;

    if (!view || !extraPendingSelection) {
      return;
    }

    const docLength = view.state.doc.length;
    const from = Math.max(0, Math.min(extraPendingSelection.start, docLength));
    const to = Math.max(from, Math.min(extraPendingSelection.end, docLength));

    view.dispatch({
      selection: EditorSelection.single(from, to),
      effects: EditorView.scrollIntoView(from, {
        y: extraPendingSelection.scrollY ?? "nearest"
      })
    });
    if (extraPendingSelection.focusEditor !== false) {
      view.focus();
    }
    onExtraPendingSelectionApplied?.();
  }, [extraPendingSelection, onExtraPendingSelectionApplied]);

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

  // #424: the Find panel's "return focus to the editor" request on close.
  // Kept separate from `focusRequest` so the two monotonic id spaces never
  // collide; applied once per new id for the current document.
  const appliedExtraFocusRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    const view = viewRef.current;

    if (
      !view ||
      !extraFocusRequest ||
      extraFocusRequest.documentKey !== documentKey ||
      appliedExtraFocusRequestIdRef.current === extraFocusRequest.id
    ) {
      return;
    }

    appliedExtraFocusRequestIdRef.current = extraFocusRequest.id;
    view.focus();
  }, [extraFocusRequest, documentKey]);

  // #424 Slice 2: push the Find panel's "mark all" set into the active
  // document's highlight StateField. `null` clears it. The panel recomputes
  // and re-dispatches on every query / option / content change, so this
  // effect just mirrors the latest prop value.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    if (
      !activeFindHighlight &&
      view.state.field(activeFindHighlightField).size === 0
    ) {
      // Nothing painted and nothing to paint — skip the no-op transaction
      // (this is the common case: every Markdown editor mount with the panel
      // closed).
      return;
    }
    view.dispatch({
      effects: activeFindHighlight
        ? setActiveFindHighlightsEffect.of(activeFindHighlight)
        : clearActiveFindHighlightsEffect.of(null)
    });
  }, [activeFindHighlight]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view || !findGutterMarkers) {
      return;
    }

    const currentMarkerCount =
      view.state.field(activeFindGutterMarkerField, false)?.size ?? 0;

    if (!activeFindGutterMarkers && currentMarkerCount === 0) {
      return;
    }

    view.dispatch({
      effects: activeFindGutterMarkers
        ? setActiveFindGutterMarkersEffect.of(activeFindGutterMarkers)
        : clearActiveFindGutterMarkersEffect.of(null)
    });
  }, [activeFindGutterMarkers, findGutterMarkers]);

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
