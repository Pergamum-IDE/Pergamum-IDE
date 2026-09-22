/**
 * #529: Pure text-transform helper for the Insert Link toolbar command and
 * its keyboard shortcut. MVP scope only — trims the URL but does not
 * validate or URL-encode it, and escapes just the characters that would
 * otherwise break the Markdown link syntax itself.
 */

export interface MarkdownLinkResult {
  readonly text: string;
  /** Offset, from the start of `text`, where the collapsed cursor should
   *  land after the change is applied. */
  readonly selectionOffsetFromInsertStart: number;
}

export function escapeMarkdownLinkLabel(label: string): string {
  return label.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export function buildMarkdownLink(
  labelText: string,
  url: string
): MarkdownLinkResult {
  const trimmedUrl = url.trim();
  const text = `[${escapeMarkdownLinkLabel(labelText)}](${trimmedUrl})`;

  if (labelText.length === 0) {
    // Cursor lands between `[` and `]` so the user can type a label directly.
    return { text, selectionOffsetFromInsertStart: 1 };
  }

  return { text, selectionOffsetFromInsertStart: text.length };
}
