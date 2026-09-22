/**
 * #529: Pure text-transform helper for the Insert Heading toolbar command
 * and its keyboard shortcut. Operates on a single line's text at a time —
 * multi-line application is the caller's responsibility (iterate lines and
 * apply this per line within one CodeMirror transaction).
 */

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6 | "normal";

const ATX_HEADING_PREFIX_PATTERN = /^#{1,6}\s+/;

export function applyHeadingToLine(
  lineText: string,
  level: HeadingLevel
): string {
  const withoutHeading = lineText.replace(ATX_HEADING_PREFIX_PATTERN, "");

  if (level === "normal") {
    return withoutHeading;
  }

  return `${"#".repeat(level)} ${withoutHeading}`;
}
