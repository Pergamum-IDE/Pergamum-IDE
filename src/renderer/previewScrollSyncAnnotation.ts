import { Annotation, type Transaction } from "@codemirror/state";

/**
 * #505 Phase 1: marks a transaction as OUR OWN preview -> editor scroll-sync
 * write (MarkdownEditor.tsx's `scrollToSourceLine`). Editor-internal jumps
 * (incremental find, Quick Open, outline, restoreViewState, ...) take editor
 * leadership when they move the view — see `transactionRequestsScrollIntoView`
 * below — but our OWN sync write must NOT, or it would invert the sync
 * direction into a feedback loop (preview scrolls editor, which would then
 * "steal" leadership back and scroll preview again).
 */
export const previewToEditorScrollSyncAnnotation = Annotation.define<true>();

export function isPreviewToEditorScrollSyncTransaction(
  tr: Transaction
): boolean {
  return tr.annotation(previewToEditorScrollSyncAnnotation) === true;
}

/**
 * Duck-types the effect value CodeMirror's `EditorView.scrollIntoView(pos,
 * options)` produces (`ScrollTarget`: `{ range, y, x, yMargin, xMargin,
 * isSnapshot }`). `@codemirror/view` does not export the `ScrollTarget`
 * class or the private `StateEffectType` that wraps it, so there is no
 * `effect.is(...)`/`instanceof` check available from outside the package —
 * this structural shape check on `effect.value` is the only externally
 * observable signal that a transaction requested a scroll-into-view. The
 * shape is part of CodeMirror's stable runtime behavior even though the
 * type itself isn't exported, and property names survive minification
 * (unlike the class's `constructor.name`, which this deliberately does NOT
 * rely on).
 */
function isScrollTargetShaped(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "range" in value &&
    "y" in value &&
    "x" in value &&
    "yMargin" in value &&
    "xMargin" in value
  );
}

/**
 * #505 Phase 1: true when `tr` carries an `EditorView.scrollIntoView(...)`
 * effect — used to detect editor-internal jumps (incremental find, Quick
 * Open, outline, restoreViewState, #504's own jump, ...) that move the
 * editor without a keystroke scrolling it, so they can take editor
 * leadership too. See `isPreviewToEditorScrollSyncTransaction` for the one
 * exception (our own preview -> editor write must not take leadership).
 */
export function transactionRequestsScrollIntoView(tr: Transaction): boolean {
  return tr.effects.some((effect) => isScrollTargetShaped(effect.value));
}
