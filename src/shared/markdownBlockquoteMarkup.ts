/**
 * #601: Pure text-transform helper for the Insert Blockquote command and
 * toolbar button. Operates on a single line's text at a time — multi-line
 * application is the caller's responsibility (iterate lines and apply this
 * per line within one CodeMirror transaction).
 */

const BLOCKQUOTE_PREFIX_PATTERN = /^\s*>/;

export function isBlockquoteLine(lineText: string): boolean {
  return BLOCKQUOTE_PREFIX_PATTERN.test(lineText);
}

export function applyBlockquoteToLine(lineText: string): string {
  if (isBlockquoteLine(lineText)) {
    return lineText;
  }
  return `> ${lineText}`;
}
