import MarkdownIt, { type Token } from "markdown-it";
import type { ApplicationEditorCharacterCountExcludeSettings } from "../shared/settings";

export const CHARACTER_COUNT_UPDATE_DEBOUNCE_MS = 250;

const characterCountMarkdown = new MarkdownIt({
  html: true,
  linkify: true
});

interface CharacterCountRange {
  readonly start: number;
  readonly end: number;
}

export interface CharacterCountOptions {
  readonly exclude: ApplicationEditorCharacterCountExcludeSettings;
}

export function codePointCharacterCount(text: string): number {
  return Array.from(text).length;
}

function shouldExcludeCharacter(
  character: string,
  exclude: ApplicationEditorCharacterCountExcludeSettings,
  forceExcludeLineBreaks = false
): boolean {
  if (
    exclude.whitespace &&
    (character === " " || character === "　" || character === "\t")
  ) {
    return true;
  }

  if ((exclude.lineBreaks || forceExcludeLineBreaks) && character === "\n") {
    return true;
  }

  return false;
}

function countTextCodePoints(
  text: string,
  exclude: ApplicationEditorCharacterCountExcludeSettings,
  forceExcludeLineBreaks = false
): number {
  let count = 0;

  for (const character of text) {
    if (shouldExcludeCharacter(character, exclude, forceExcludeLineBreaks)) {
      continue;
    }

    count += 1;
  }

  return count;
}

function mergeRanges(
  ranges: readonly CharacterCountRange[]
): CharacterCountRange[] {
  const sorted = [...ranges]
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: CharacterCountRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];

    if (previous && range.start <= previous.end) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: Math.max(previous.end, range.end)
      };
      continue;
    }

    merged.push(range);
  }

  return merged;
}

function lineStartOffsets(content: string): number[] {
  const offsets = [0];

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      offsets.push(index + 1);
    }
  }

  return offsets;
}

function lineTextEndOffset(
  content: string,
  offsets: readonly number[],
  line: number
): number {
  const nextLineStart = offsets[line + 1];

  return nextLineStart === undefined ? content.length : nextLineStart - 1;
}

function rangeForLineMap(
  content: string,
  offsets: readonly number[],
  map: [number, number] | null
): CharacterCountRange | null {
  if (!map || map[1] <= map[0]) {
    return null;
  }

  const start = offsets[map[0]] ?? content.length;
  const endLine = Math.max(map[0], Math.min(map[1] - 1, offsets.length - 1));
  const end = lineTextEndOffset(content, offsets, endLine);

  return end > start ? { start, end } : null;
}

function isHtmlCommentSource(source: string): boolean {
  const trimmed = source.trim();

  return trimmed.startsWith("<!--") && trimmed.endsWith("-->");
}

function htmlCommentSpans(source: string): CharacterCountRange[] {
  const spans: CharacterCountRange[] = [];
  let searchStart = 0;

  while (searchStart < source.length) {
    const start = source.indexOf("<!--", searchStart);

    if (start === -1) {
      break;
    }

    const endMarker = source.indexOf("-->", start + 4);

    if (endMarker === -1) {
      break;
    }

    const end = endMarker + 3;

    spans.push({ start, end });
    searchStart = end;
  }

  return spans;
}

function tokenContentWithoutTrailingLineEnding(token: Token): string {
  return token.content.endsWith("\n")
    ? token.content.slice(0, token.content.length - 1)
    : token.content;
}

function collectHtmlBlockCommentRanges(
  content: string,
  offsets: readonly number[],
  token: Token,
  ranges: CharacterCountRange[]
): void {
  if (!token.map) {
    return;
  }

  const blockStart = offsets[token.map[0]] ?? content.length;
  const blockEnd = offsets[token.map[1]] ?? content.length;
  const blockSource = content.slice(blockStart, blockEnd);
  const tokenSource = blockSource.includes(token.content)
    ? token.content
    : tokenContentWithoutTrailingLineEnding(token);
  const tokenOffset = blockSource.indexOf(tokenSource);
  const scanSource = tokenOffset === -1 ? blockSource : tokenSource;
  const scanStart = tokenOffset === -1 ? blockStart : blockStart + tokenOffset;

  for (const span of htmlCommentSpans(scanSource)) {
    ranges.push({
      start: scanStart + span.start,
      end: scanStart + span.end
    });
  }
}

function collectInlineCommentRanges(
  content: string,
  offsets: readonly number[],
  token: Token,
  ranges: CharacterCountRange[]
): void {
  if (!token.children || !token.map) {
    return;
  }

  const searchEnd = offsets[token.map[1]] ?? content.length;
  let searchStart = offsets[token.map[0]] ?? 0;

  for (const child of token.children) {
    if (child.type !== "html_inline" || !isHtmlCommentSource(child.content)) {
      continue;
    }

    const commentStart = content.indexOf(child.content, searchStart);

    if (
      commentStart === -1 ||
      commentStart + child.content.length > searchEnd
    ) {
      continue;
    }

    ranges.push({
      start: commentStart,
      end: commentStart + child.content.length
    });
    searchStart = commentStart + child.content.length;
  }
}

function collectMarkdownExcludedRanges(
  content: string,
  tokens: readonly Token[],
  exclude: ApplicationEditorCharacterCountExcludeSettings
): CharacterCountRange[] {
  const offsets = lineStartOffsets(content);
  const ranges: CharacterCountRange[] = [];

  for (const token of tokens) {
    if (exclude.headings && token.type === "heading_open") {
      const range = rangeForLineMap(content, offsets, token.map);

      if (range) {
        ranges.push(range);
      }
    }

    if (!exclude.markdownComments) {
      continue;
    }

    if (token.type === "html_block") {
      collectHtmlBlockCommentRanges(content, offsets, token, ranges);
      continue;
    }

    if (token.type === "inline") {
      collectInlineCommentRanges(content, offsets, token, ranges);
    }
  }

  return mergeRanges(ranges);
}

function countCodePointsOutsideRanges(
  content: string,
  exclude: ApplicationEditorCharacterCountExcludeSettings,
  ranges: readonly CharacterCountRange[],
  forceExcludeLineBreaks = false
): number {
  let count = 0;
  let rangeIndex = 0;
  const mergedRanges = mergeRanges(ranges);

  for (let index = 0; index < content.length; ) {
    while (
      rangeIndex < mergedRanges.length &&
      mergedRanges[rangeIndex].end <= index
    ) {
      rangeIndex += 1;
    }

    const range = mergedRanges[rangeIndex];

    if (range && index >= range.start && index < range.end) {
      index = range.end;
      continue;
    }

    const codePoint = content.codePointAt(index);

    if (codePoint === undefined) {
      break;
    }

    const character = String.fromCodePoint(codePoint);

    if (!shouldExcludeCharacter(character, exclude, forceExcludeLineBreaks)) {
      count += 1;
    }

    index += character.length;
  }

  return count;
}

function countLineBreaksOutsideRanges(
  content: string,
  ranges: readonly CharacterCountRange[]
): number {
  let count = 0;
  let rangeIndex = 0;
  const mergedRanges = mergeRanges(ranges);

  for (let index = 0; index < content.length; index += 1) {
    while (
      rangeIndex < mergedRanges.length &&
      mergedRanges[rangeIndex].end <= index
    ) {
      rangeIndex += 1;
    }

    const range = mergedRanges[rangeIndex];

    if (range && index >= range.start && index < range.end) {
      index = range.end - 1;
      continue;
    }

    if (content[index] === "\n") {
      count += 1;
    }
  }

  return count;
}

function countInlineVisibleText(
  tokens: readonly Token[],
  exclude: ApplicationEditorCharacterCountExcludeSettings
): number {
  let count = 0;

  for (const token of tokens) {
    if (token.type === "html_inline" && exclude.markdownComments) {
      const commentSpans = htmlCommentSpans(token.content);

      if (commentSpans.length > 0) {
        count += countCodePointsOutsideRanges(
          token.content,
          exclude,
          commentSpans,
          true
        );
        continue;
      }
    }

    if (token.type === "softbreak" || token.type === "hardbreak") {
      continue;
    }

    if (token.type === "image") {
      count += countTextCodePoints(token.content, exclude, true);
      continue;
    }

    if (token.children) {
      count += countInlineVisibleText(token.children, exclude);
      continue;
    }

    if (token.content.length > 0) {
      count += countTextCodePoints(token.content, exclude, true);
    }
  }

  return count;
}

function countMarkdownVisibleText(
  content: string,
  tokens: readonly Token[],
  exclude: ApplicationEditorCharacterCountExcludeSettings,
  excludedRanges: readonly CharacterCountRange[]
): number {
  let count = 0;
  let isInsideExcludedHeading = false;

  for (const token of tokens) {
    if (exclude.headings && token.type === "heading_open") {
      isInsideExcludedHeading = true;
      continue;
    }

    if (isInsideExcludedHeading) {
      if (token.type === "heading_close") {
        isInsideExcludedHeading = false;
      }
      continue;
    }

    if (token.type === "inline" && token.children) {
      count += countInlineVisibleText(token.children, exclude);
      continue;
    }

    if (token.type === "html_block") {
      count += countCodePointsOutsideRanges(
        token.content,
        exclude,
        exclude.markdownComments ? htmlCommentSpans(token.content) : [],
        true
      );
      continue;
    }

    if (token.type === "code_block" || token.type === "fence") {
      count += countTextCodePoints(token.content, exclude, true);
    }
  }

  if (!exclude.lineBreaks) {
    count += countLineBreaksOutsideRanges(content, excludedRanges);
  }

  return count;
}

function requiresMarkdownParsing(
  exclude: ApplicationEditorCharacterCountExcludeSettings
): boolean {
  return exclude.headings || exclude.markdownSyntax || exclude.markdownComments;
}

export function countMarkdownDocumentCharacters(
  content: string,
  options: CharacterCountOptions
): number {
  const { exclude } = options;

  if (!requiresMarkdownParsing(exclude)) {
    return countTextCodePoints(content, exclude);
  }

  const tokens = characterCountMarkdown.parse(content, {});
  const excludedRanges = collectMarkdownExcludedRanges(content, tokens, exclude);

  if (!exclude.markdownSyntax) {
    return countCodePointsOutsideRanges(content, exclude, excludedRanges);
  }

  return countMarkdownVisibleText(content, tokens, exclude, excludedRanges);
}
