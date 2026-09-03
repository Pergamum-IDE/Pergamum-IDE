/**
 * #375 Phase 5 — vertical alignment for a Document Map → editor scroll.
 *
 *   - `"center"` — put the target line near the MIDDLE of the editor viewport.
 *     Used by Document Map *click-to-scroll*: you pointed at a spot and want to
 *     see the text around it.
 *   - `"start"` — put the target line near the TOP of the editor viewport. Used
 *     by viewport-lens *drag*: the lens top marks where the viewport top should
 *     land, so centring would fight the grab and drift noticeably near the
 *     document's first / last lines.
 *
 * Maps 1:1 onto CodeMirror's `EditorView.scrollIntoView` `y` option.
 */
export type EditorScrollAlign = "start" | "center";

/** Alignment assumed when a caller passes none — preserves click-to-scroll. */
export const DEFAULT_EDITOR_SCROLL_ALIGN: EditorScrollAlign = "center";
