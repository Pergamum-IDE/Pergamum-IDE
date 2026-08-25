import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Transaction,
  type AnnotationType
} from "@codemirror/state";
import {
  pergamumContextSurfaceAttribute,
  type EditableContextSurface
} from "../shared/editContextMenu";
import type { NewFileLineEnding, WorkbenchSoundSettings } from "../shared/settings";
import { createVisibilityExtension } from "./editorVisibility/visibilityFeature";
import { lineEndMarkerFeature } from "./editorVisibility/lineEndMarkerFeature";
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

interface MarkdownEditorPendingSelection {
  start: number;
  end: number;
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
  pendingSelection?: MarkdownEditorPendingSelection | null;
  onPendingSelectionApplied?: () => void;
  contextSurface?: EditableContextSurface;
  soundFeedback?: SoundFeedbackPlayer;
  soundSettings?: WorkbenchSoundSettings;
  readOnly?: boolean;
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
  pendingSelection,
  onPendingSelectionApplied,
  contextSurface,
  soundFeedback,
  soundSettings,
  readOnly = false
}: MarkdownEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const visibilityCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
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

  if (!readOnlyCompartmentRef.current) {
    readOnlyCompartmentRef.current = new Compartment();
  }
  const readOnlyCompartment = readOnlyCompartmentRef.current;

  if (!visibilityCompartmentRef.current) {
    visibilityCompartmentRef.current = new Compartment();
  }
  const visibilityCompartment = visibilityCompartmentRef.current;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
            createVisibilityExtension([lineEndMarkerFeature])
          ),
          lineEndingExtension,
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
          })
        ]
      })
    });

    viewRef.current = view;

    return () => {
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
      effects: EditorView.scrollIntoView(from)
    });
    view.focus();
    onPendingSelectionApplied?.();
  }, [pendingSelection, onPendingSelectionApplied]);

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
