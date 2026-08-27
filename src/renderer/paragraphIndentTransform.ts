export const paragraphIndentCharacter = "\u3000";

export interface ParagraphIndentChange {
  readonly from: number;
  readonly to?: number;
  readonly insert: string;
}

export interface ParagraphIndentCounts {
  readonly changedLineCount: number;
  readonly skippedLineCount: number;
  readonly emptyLineCount: number;
}

export interface ParagraphIndentTransformResult {
  readonly changes: readonly ParagraphIndentChange[];
  readonly counts: ParagraphIndentCounts;
}

function firstCharacter(value: string): string | null {
  return Array.from(value)[0] ?? null;
}

function lineIsExcluded(
  line: string,
  excludeLeadingCharacters: ReadonlySet<string>
): boolean {
  const leadingCharacter = firstCharacter(line);

  return (
    leadingCharacter !== null && excludeLeadingCharacters.has(leadingCharacter)
  );
}

function visitLines(
  content: string,
  visit: (line: string, lineStartOffset: number) => void
): void {
  let lineStartOffset = 0;

  for (let index = 0; index <= content.length; index += 1) {
    if (index !== content.length && content[index] !== "\n") {
      continue;
    }

    visit(content.slice(lineStartOffset, index), lineStartOffset);
    lineStartOffset = index + 1;
  }
}

export function computeParagraphIndentInsertTransform(
  content: string,
  excludeLeadingCharacters: string
): ParagraphIndentTransformResult {
  const changes: ParagraphIndentChange[] = [];
  const excludedLeadingCharacters = new Set(
    Array.from(excludeLeadingCharacters)
  );
  let changedLineCount = 0;
  let skippedLineCount = 0;
  let emptyLineCount = 0;

  visitLines(content, (line, lineStartOffset) => {
    if (line.length === 0) {
      emptyLineCount += 1;
      return;
    }

    if (
      line.startsWith(paragraphIndentCharacter) ||
      lineIsExcluded(line, excludedLeadingCharacters)
    ) {
      skippedLineCount += 1;
      return;
    }

    changes.push({
      from: lineStartOffset,
      insert: paragraphIndentCharacter
    });
    changedLineCount += 1;
  });

  return {
    changes,
    counts: {
      changedLineCount,
      skippedLineCount,
      emptyLineCount
    }
  };
}

export function computeParagraphIndentRemoveTransform(
  content: string
): ParagraphIndentTransformResult {
  const changes: ParagraphIndentChange[] = [];
  let changedLineCount = 0;
  let skippedLineCount = 0;
  let emptyLineCount = 0;

  visitLines(content, (line, lineStartOffset) => {
    if (line.length === 0) {
      emptyLineCount += 1;
      return;
    }

    if (!line.startsWith(paragraphIndentCharacter)) {
      skippedLineCount += 1;
      return;
    }

    changes.push({
      from: lineStartOffset,
      to: lineStartOffset + paragraphIndentCharacter.length,
      insert: ""
    });
    changedLineCount += 1;
  });

  return {
    changes,
    counts: {
      changedLineCount,
      skippedLineCount,
      emptyLineCount
    }
  };
}
