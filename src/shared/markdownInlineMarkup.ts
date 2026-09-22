/**
 * #529: Pure text-transform helper for the Bold / Italic / Strikethrough
 * toolbar commands and their keyboard shortcuts. Wraps the currently
 * selected text with the given marker, or — when nothing is selected —
 * inserts an empty marker pair with the cursor placed between them.
 *
 * Deliberately no toggle-off behavior (detecting an already-wrapped
 * selection and stripping the marker instead) — out of scope for #529.
 */

export interface InlineMarkupResult {
  readonly text: string;
  /** Offset, from the start of `text`, where the collapsed cursor should
   *  land after the change is applied. */
  readonly selectionOffsetFromInsertStart: number;
}

export function wrapOrInsertInlineMarker(
  selectedText: string,
  marker: string
): InlineMarkupResult {
  if (selectedText.length === 0) {
    return {
      text: `${marker}${marker}`,
      selectionOffsetFromInsertStart: marker.length
    };
  }

  const text = `${marker}${selectedText}${marker}`;
  return {
    text,
    selectionOffsetFromInsertStart: text.length
  };
}
