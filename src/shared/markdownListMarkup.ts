/**
 * #533: Pure text-transform helper for the Unordered List / Ordered List /
 * Checklist toolbar commands. Operates on the array of lines touched by the
 * current selection (a single line when the selection is empty) — the
 * caller is responsible for extracting those lines from the document and
 * dispatching the resulting per-line changes as one CodeMirror transaction
 * (mirrors `applyHeadingToLine`'s division of labor).
 *
 * Same-type toggle: if every non-blank touched line is already the target
 * kind, the whole batch toggles OFF (marker stripped, back to a normal
 * paragraph) instead of converting. Blank lines are left untouched and
 * excluded from that classification — EXCEPT when the array holds exactly
 * one (blank) line, which is the "empty current line, no selection" case the
 * issue asks to still receive a marker.
 */

export type MarkdownListKind = "unordered" | "ordered" | "checklist";

interface ParsedListLine {
  readonly indent: string;
  readonly kind: MarkdownListKind | null;
  readonly body: string;
}

const INDENT_PATTERN = /^[ \t]*/;
// Checklist must be tried before the generic unordered pattern below, or
// `- [ ] item` would be misread as unordered body text `[ ] item`.
const CHECKLIST_PATTERN = /^-[ \t]\[([ xX])\][ \t](.*)$/;
const UNORDERED_PATTERN = /^[-+*][ \t](.*)$/;
const ORDERED_PATTERN = /^\d+[.)][ \t](.*)$/;

function parseListLine(line: string): ParsedListLine {
  const indent = line.match(INDENT_PATTERN)?.[0] ?? "";
  const rest = line.slice(indent.length);

  const checklistMatch = rest.match(CHECKLIST_PATTERN);
  if (checklistMatch) {
    return { indent, kind: "checklist", body: checklistMatch[2] };
  }

  const unorderedMatch = rest.match(UNORDERED_PATTERN);
  if (unorderedMatch) {
    return { indent, kind: "unordered", body: unorderedMatch[1] };
  }

  const orderedMatch = rest.match(ORDERED_PATTERN);
  if (orderedMatch) {
    return { indent, kind: "ordered", body: orderedMatch[1] };
  }

  return { indent, kind: null, body: rest };
}

function buildListLine(
  parsed: ParsedListLine,
  kind: MarkdownListKind,
  orderedNumber: number
): string {
  if (kind === "unordered") {
    return `${parsed.indent}- ${parsed.body}`;
  }
  if (kind === "checklist") {
    return `${parsed.indent}- [ ] ${parsed.body}`;
  }
  return `${parsed.indent}${orderedNumber}. ${parsed.body}`;
}

export function applyMarkdownListToLines(
  lines: readonly string[],
  kind: MarkdownListKind
): string[] {
  const isSingleLine = lines.length === 1;
  const participatingIndices = new Set(
    lines
      .map((line, index) => index)
      .filter((index) => isSingleLine || lines[index].trim().length > 0)
  );

  if (participatingIndices.size === 0) {
    return [...lines];
  }

  const allAlreadyTargetKind = [...participatingIndices].every(
    (index) => parseListLine(lines[index]).kind === kind
  );

  let orderedNumber = 1;
  return lines.map((line, index) => {
    if (!participatingIndices.has(index)) {
      return line;
    }

    const parsed = parseListLine(line);

    if (allAlreadyTargetKind) {
      return `${parsed.indent}${parsed.body}`;
    }

    const newLine = buildListLine(parsed, kind, orderedNumber);
    if (kind === "ordered") {
      orderedNumber += 1;
    }
    return newLine;
  });
}
