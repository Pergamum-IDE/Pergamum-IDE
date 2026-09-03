/**
 * #375 Text Map viewport overlay: the ACTIVE Markdown editor's currently
 * on-screen document range, in the same UTF-16 offset unit as everything else
 * (selection, glossary occurrences, the Text Map). Pushed from the editor on
 * viewport / geometry change and consumed by the Text Map to draw a 1px
 * "you are here" rectangle. `null` means "no active Markdown editor" or "the
 * range can't be read yet".
 */
export interface EditorVisibleTextRange {
  /** First visible offset (inclusive). */
  from: number;
  /** Last visible offset (exclusive). */
  to: number;
}
