/**
 * #352: a small, pure ATX-heading extractor for the Markdown Outline pane and
 * the follow-up Command Palette `#` heading search.
 *
 * It is deliberately NOT a Markdown parser: only ATX headings (`# …` through
 * `###### …`) are recognized, fenced code blocks are skipped, and everything
 * else (Setext headings, HTML headings, frontmatter, inline emphasis, …) is
 * left alone. Input is Pergamum's internal `"\n"`-only working text
 * (`CurrentDocument.content`), so line numbers and offsets computed here match
 * CodeMirror's plain-string document model exactly.
 */

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface MarkdownOutlineFlatItem {
  readonly id: string;
  readonly level: MarkdownHeadingLevel;
  readonly text: string;
  /** 0-based line number of the heading line. */
  readonly lineNumber: number;
  /** Character offset of the start of the heading line. */
  readonly from: number;
  /** Character offset of the end of the heading line (before its `"\n"`). */
  readonly to: number;
}

export interface MarkdownOutlineItem extends MarkdownOutlineFlatItem {
  /** Nested headings (a deeper level that follows before any shallower one). */
  readonly children: readonly MarkdownOutlineItem[];
}

export interface MarkdownOutlineParseResult {
  /** Heading tree for the sidebar Outline pane. */
  readonly tree: readonly MarkdownOutlineItem[];
  /** Headings in document order for cross-document heading search. */
  readonly flat: readonly MarkdownOutlineFlatItem[];
}

export const emptyMarkdownOutlineParseResult: MarkdownOutlineParseResult = {
  tree: [],
  flat: []
};

/**
 * ATX heading: 0–3 leading spaces, 1–6 `#`, then either end-of-line or at
 * least one space/tab before the heading text. A leading run of 4+ spaces is
 * an indented code block, not a heading.
 */
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

/** An opening (or closing) fence: 0–3 spaces then 3+ of the same `` ` `` or `~`. */
const FENCE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;

interface OpenFence {
  readonly char: "`" | "~";
  readonly length: number;
}

function matchOpeningFence(line: string): OpenFence | null {
  const match = FENCE.exec(line);

  if (!match) {
    return null;
  }

  const sequence = match[1];
  const char = sequence[0] as "`" | "~";

  // A backtick opening fence's info string must not itself contain a backtick.
  if (char === "`" && match[2].includes("`")) {
    return null;
  }

  return { char, length: sequence.length };
}

function closesFence(line: string, fence: OpenFence): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);

  if (!match) {
    return false;
  }

  return match[1][0] === fence.char && match[1].length >= fence.length;
}

/** `#`-stripped, whitespace-collapsed heading text. */
function normalizeHeadingText(raw: string | undefined): string {
  if (raw === undefined) {
    return "";
  }

  // Drop a trailing closing `#` sequence (with any surrounding spaces).
  return raw.replace(/[ \t]*#+[ \t]*$/, "").trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

interface MutableOutlineItem extends MarkdownOutlineFlatItem {
  children: MutableOutlineItem[];
}

function buildTree(
  flat: readonly MarkdownOutlineFlatItem[]
): MarkdownOutlineItem[] {
  const roots: MutableOutlineItem[] = [];
  const stack: MutableOutlineItem[] = [];

  for (const item of flat) {
    const node: MutableOutlineItem = { ...item, children: [] };

    // Pop every heading that is the same level or deeper — the new heading is
    // a sibling of (or shallower than) them.
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots;
}

export function extractMarkdownOutline(
  text: string
): MarkdownOutlineParseResult {
  const lines = text.split("\n");
  const flat: MarkdownOutlineFlatItem[] = [];
  const usedIds = new Set<string>();

  let offset = 0;
  let openFence: OpenFence | null = null;

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const from = offset;
    const to = offset + line.length;
    offset = to + 1; // account for the "\n" separator

    if (openFence) {
      if (closesFence(line, openFence)) {
        openFence = null;
      }
      continue;
    }

    const fence = matchOpeningFence(line);

    if (fence) {
      openFence = fence;
      continue;
    }

    const heading = ATX_HEADING.exec(line);

    if (!heading) {
      continue;
    }

    const level = heading[1].length as MarkdownHeadingLevel;
    const headingText = normalizeHeadingText(heading[2]);

    let id = `${lineNumber}:${slugify(headingText)}`;

    // `lineNumber` already makes `id` unique; the suffix is a belt-and-braces
    // guard so callers can rely on uniqueness unconditionally.
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) {
        suffix += 1;
      }
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);

    flat.push({ id, level, text: headingText, lineNumber, from, to });
  }

  return { tree: buildTree(flat), flat };
}
