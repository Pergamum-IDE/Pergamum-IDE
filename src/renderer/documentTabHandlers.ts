import type { EditorId } from "../shared/editorId";

/**
 * Right-side trailing slot content for a document tab (#184). The close
 * button shows only while the tab is active or hovered; otherwise the slot is
 * an empty placeholder that keeps the tab's width stable.
 *
 * #342: the inactive-tab dirty pen icon was removed from the tab bar — unsaved
 * state now surfaces on the File Explorer file row instead. The tab's own
 * `title` still carries the unsaved suffix for hover discovery.
 */
export type DocumentTabTrailingSlotKind = "close" | "empty";

export function documentTabTrailingSlotKind(
  isActive: boolean,
  isHovered: boolean
): DocumentTabTrailingSlotKind {
  return isActive || isHovered ? "close" : "empty";
}

/**
 * Close button clicks must not bubble to the tab's own click handler
 * (which would select the tab) — `stopPropagation` is what actually matters
 * here; `preventDefault` is included for consistency with the confirm
 * dialog's key handling (#182 precedent) and costs nothing since a button
 * click has no default action to suppress.
 */
export function handleDocumentTabCloseButtonClick(
  event: { preventDefault: () => void; stopPropagation: () => void },
  editorId: EditorId,
  onClose: (editorId: EditorId) => void
): void {
  event.preventDefault();
  event.stopPropagation();
  onClose(editorId);
}

/**
 * Middle-click / wheel-click (mouse button 1) closes the clicked tab.
 * Handled on `mousedown` rather than `click`: the DOM `click` event only
 * fires for the primary button, and `mousedown` lets us suppress the
 * browser's middle-click autoscroll cursor via `preventDefault` (#184).
 */
export function handleDocumentTabMiddleClick(
  event: {
    button: number;
    preventDefault: () => void;
    stopPropagation: () => void;
  },
  editorId: EditorId,
  onClose: (editorId: EditorId) => void
): boolean {
  if (event.button !== 1) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  onClose(editorId);
  return true;
}
