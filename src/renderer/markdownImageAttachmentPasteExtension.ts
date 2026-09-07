import { EditorView } from "@codemirror/view";
import type { EditorState, Extension, TransactionSpec } from "@codemirror/state";
import { createUuidv7 } from "../shared/uuidv7";
import {
  preparePendingImageAttachment,
  selectClipboardImageCandidate,
  type ClipboardDataLike,
  type ImageAttachmentPastePreparationResult
} from "./clipboardImageAttachment";
import {
  addPendingImageAttachmentPosition,
  clearPendingImageAttachmentPosition
} from "./markdownImageAttachmentPositionTracker";

export type MarkdownImageAttachmentPasteHandler = (
  result: ImageAttachmentPastePreparationResult
) => void | Promise<void>;

export interface MarkdownImageAttachmentPasteExtensionOptions {
  readonly getHandler: () => MarkdownImageAttachmentPasteHandler | null;
  readonly getSourceDocumentId: () => string;
  readonly getSourceEditorId?: () => string | undefined;
  readonly isReadOnly?: () => boolean;
  readonly createPendingId?: () => string;
}

export interface MarkdownImageAttachmentPasteEvent {
  readonly clipboardData: ClipboardDataLike | null;
  preventDefault(): void;
}

export interface MarkdownImageAttachmentPasteView {
  readonly state: EditorState;
  dispatch(spec: TransactionSpec): void;
}

export const editorViewImageAttachmentPasteOptionsMap = new WeakMap<
  EditorView,
  MarkdownImageAttachmentPasteExtensionOptions
>();

export function registerEditorViewImageAttachmentPasteOptions(
  view: EditorView,
  options: MarkdownImageAttachmentPasteExtensionOptions
): void {
  editorViewImageAttachmentPasteOptionsMap.set(view, options);
}

export function unregisterEditorViewImageAttachmentPasteOptions(
  view: EditorView
): void {
  editorViewImageAttachmentPasteOptionsMap.delete(view);
}

export function handleMarkdownImageAttachmentPaste(
  event: MarkdownImageAttachmentPasteEvent,
  view: MarkdownImageAttachmentPasteView,
  options: MarkdownImageAttachmentPasteExtensionOptions
): boolean {
  const activeOptions =
    (view instanceof EditorView
      ? editorViewImageAttachmentPasteOptionsMap.get(view)
      : undefined) ?? options;
  const handler = activeOptions.getHandler();
  if (!handler || activeOptions.isReadOnly?.() === true) {
    return false;
  }

  const selected = selectClipboardImageCandidate(event.clipboardData);
  if (selected.kind === "fallback") {
    return false;
  }

  const id = (activeOptions.createPendingId ?? createUuidv7)();
  const initialPosition = view.state.selection.main.from;
  const sourceDocumentId = activeOptions.getSourceDocumentId();
  const sourceEditorId = activeOptions.getSourceEditorId?.();

  view.dispatch({
    effects: addPendingImageAttachmentPosition.of({
      id,
      position: initialPosition
    })
  });

  event.preventDefault();

  void preparePendingImageAttachment({
    id,
    sourceDocumentId,
    sourceEditorId,
    initialPosition,
    candidate: selected.candidate
  })
    .then((result) => handler(result))
    .catch((error) => {
      console.error("Markdown image attachment paste handler failed.", error);
      view.dispatch({
        effects: clearPendingImageAttachmentPosition.of(id)
      });
    });

  return true;
}

export function createMarkdownImageAttachmentPasteExtension(
  options: MarkdownImageAttachmentPasteExtensionOptions
): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) =>
      handleMarkdownImageAttachmentPaste(
        event as MarkdownImageAttachmentPasteEvent,
        view,
        options
      )
  });
}
