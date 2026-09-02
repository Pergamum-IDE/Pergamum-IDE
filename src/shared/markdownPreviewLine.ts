/**
 * #372: Command Palette file quick open — footer detail preview line.
 *
 * Extracts the string shown in the Command Palette footer detail / ticker for
 * the selected file in prefix-less file quick open mode: the first line of the
 * Markdown body that is non-empty after trimming, returned trimmed.
 *
 * Scope (intentionally minimal, see the Issue's Non-goals):
 *   - Handles `\r\n`, `\n`, and `\r` line breaks.
 *   - Scans from the top; returns the first `trim()`-non-empty line.
 *   - A heading line is returned verbatim — headings are NOT skipped here.
 *   - No Markdown parsing, no frontmatter / code-fence handling, no snippet
 *     generation.
 *   - Returns `null` when every line is blank (whitespace only).
 */
export function firstNonEmptyMarkdownPreviewLine(text: string): string | null {
  let lineStart = 0;

  for (let index = 0; index <= text.length; index += 1) {
    const char = index < text.length ? text[index] : "\n";

    if (char !== "\n" && char !== "\r") {
      continue;
    }

    const line = text.slice(lineStart, index).trim();

    if (line.length > 0) {
      return line;
    }

    // Treat a "\r\n" pair as a single break so the empty run between them is
    // not counted twice.
    if (char === "\r" && text[index + 1] === "\n") {
      index += 1;
    }

    lineStart = index + 1;
  }

  return null;
}
