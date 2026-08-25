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
import type { WorkbenchSoundSettings } from "../shared/settings";
import { createVisibilityExtension } from "./editorVisibility/visibilityFeature";
import { lineEndMarkerFeature } from "./editorVisibility/lineEndMarkerFeature";
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
  onChange: (value: string) => void;
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

export function MarkdownEditor({
  value,
  onChange,
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
    if (!hostRef.current) {
      return undefined;
    }

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
              onChangeRef.current(update.state.doc.toString());
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

    if (!view || view.state.doc.toString() === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
  }, [value]);

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
