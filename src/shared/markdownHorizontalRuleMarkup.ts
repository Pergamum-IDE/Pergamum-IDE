/**
 * #531: Pure text-transform helper for the Insert Horizontal Rule toolbar
 * command and its keyboard shortcut. The rule always inserts its own
 * trailing blank line so the cursor lands on a fresh line after it —
 * surrounding blank-line separation against existing document content is
 * the caller's responsibility (see MarkdownEditor.tsx's shared block
 * insertion padding helper).
 */

export interface HorizontalRuleInsertionResult {
  readonly text: string;
  /** Offset, from the start of `text`, where the collapsed cursor should
   *  land after the change is applied. */
  readonly selectionOffsetFromInsertStart: number;
}

export function buildHorizontalRuleInsertion(): HorizontalRuleInsertionResult {
  return { text: "---\n\n", selectionOffsetFromInsertStart: 4 };
}
