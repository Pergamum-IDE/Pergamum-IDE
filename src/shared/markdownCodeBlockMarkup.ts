/**
 * #531: Pure text-transform helper for the Insert Code Block toolbar command
 * and its keyboard shortcut. No language selector — the fence is always
 * plain ``` ```, matching this issue's scope.
 */

export interface FencedCodeBlockResult {
  readonly text: string;
  /** Offset, from the start of `text`, where the collapsed cursor should
   *  land after the change is applied. */
  readonly selectionOffsetFromInsertStart: number;
}

export function buildFencedCodeBlock(
  selectedText: string
): FencedCodeBlockResult {
  const text = `\`\`\`\n${selectedText}\n\`\`\``;

  if (selectedText.length === 0) {
    // Cursor lands on the empty line between the fences.
    return { text, selectionOffsetFromInsertStart: 4 };
  }

  return { text, selectionOffsetFromInsertStart: text.length };
}
