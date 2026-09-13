export interface NormalizedSourceSpan {
  readonly normalizedStart: number;
  readonly normalizedEnd: number;
  readonly sourceStart: number;
  readonly sourceEnd: number;
}

export interface NormalizedTextWithSourceMap {
  readonly normalizedText: string;
  /**
   * Empty spans mean normalizedText is source-text-identical and ranges map by
   * identity. Non-empty spans cover normalizedText in source order.
   */
  readonly spans: readonly NormalizedSourceSpan[];
}

export interface CreateNormalizedTextWithSourceMapOptions {
  readonly normalizeToNfc: boolean;
}

export interface SourceTextRange {
  readonly start: number;
  readonly end: number;
}

const COMBINING_MARK_PATTERN = /\p{Mark}/u;

export function createNormalizedTextWithSourceMap(
  sourceText: string,
  options: CreateNormalizedTextWithSourceMapOptions
): NormalizedTextWithSourceMap {
  if (!options.normalizeToNfc || sourceText.length === 0) {
    return { normalizedText: sourceText, spans: [] };
  }

  const normalizedText = sourceText.normalize("NFC");
  if (normalizedText === sourceText) {
    return { normalizedText, spans: [] };
  }

  const spans: NormalizedSourceSpan[] = [];
  const normalizedSegments: string[] = [];
  let sourceStart = 0;
  let normalizedStart = 0;

  while (sourceStart < sourceText.length) {
    const sourceEnd = findNextSourceSpanEnd(
      sourceText,
      sourceStart,
      normalizedText,
      normalizedStart
    );
    const normalizedSegment = sourceText
      .slice(sourceStart, sourceEnd)
      .normalize("NFC");
    const normalizedEnd = normalizedStart + normalizedSegment.length;

    normalizedSegments.push(normalizedSegment);
    spans.push({
      normalizedStart,
      normalizedEnd,
      sourceStart,
      sourceEnd
    });

    sourceStart = sourceEnd;
    normalizedStart = normalizedEnd;
  }

  if (
    normalizedStart !== normalizedText.length ||
    normalizedSegments.join("") !== normalizedText
  ) {
    return {
      normalizedText,
      spans: [
        {
          normalizedStart: 0,
          normalizedEnd: normalizedText.length,
          sourceStart: 0,
          sourceEnd: sourceText.length
        }
      ]
    };
  }

  return { normalizedText, spans };
}

export function mapNormalizedRangeToSourceRange(
  sourceMap: NormalizedTextWithSourceMap,
  normalizedStart: number,
  normalizedEnd: number
): SourceTextRange | null {
  if (
    !Number.isInteger(normalizedStart) ||
    !Number.isInteger(normalizedEnd) ||
    normalizedStart < 0 ||
    normalizedEnd > sourceMap.normalizedText.length ||
    normalizedStart >= normalizedEnd
  ) {
    return null;
  }

  if (sourceMap.spans.length === 0) {
    return { start: normalizedStart, end: normalizedEnd };
  }

  let sourceStart: number | null = null;
  let sourceEnd: number | null = null;
  let coveredUntil = normalizedStart;

  for (const span of sourceMap.spans) {
    if (span.normalizedEnd <= normalizedStart) {
      continue;
    }
    if (span.normalizedStart >= normalizedEnd) {
      break;
    }
    if (span.normalizedStart > coveredUntil) {
      return null;
    }

    sourceStart ??= span.sourceStart;
    sourceEnd = span.sourceEnd;
    coveredUntil = Math.max(coveredUntil, span.normalizedEnd);

    if (coveredUntil >= normalizedEnd) {
      break;
    }
  }

  if (sourceStart === null || sourceEnd === null || coveredUntil < normalizedEnd) {
    return null;
  }

  return { start: sourceStart, end: sourceEnd };
}

function findNextSourceSpanEnd(
  sourceText: string,
  sourceStart: number,
  normalizedText: string,
  normalizedStart: number
): number {
  let sourceEnd = consumeSourceCluster(sourceText, sourceStart);
  let normalizedSegment = sourceText
    .slice(sourceStart, sourceEnd)
    .normalize("NFC");

  while (
    sourceEnd < sourceText.length &&
    !normalizedText.startsWith(normalizedSegment, normalizedStart)
  ) {
    sourceEnd = consumeSourceCluster(sourceText, sourceEnd);
    normalizedSegment = sourceText
      .slice(sourceStart, sourceEnd)
      .normalize("NFC");
  }

  return sourceEnd;
}

function consumeSourceCluster(sourceText: string, sourceStart: number): number {
  let sourceEnd = nextCodePointEnd(sourceText, sourceStart);

  while (
    sourceEnd < sourceText.length &&
    isCombiningMarkAt(sourceText, sourceEnd)
  ) {
    sourceEnd = nextCodePointEnd(sourceText, sourceEnd);
  }

  return sourceEnd;
}

function nextCodePointEnd(sourceText: string, sourceStart: number): number {
  const codePoint = sourceText.codePointAt(sourceStart);
  if (codePoint === undefined) {
    return sourceStart;
  }
  return sourceStart + (codePoint > 0xffff ? 2 : 1);
}

function isCombiningMarkAt(sourceText: string, sourceStart: number): boolean {
  const codePoint = sourceText.codePointAt(sourceStart);
  return (
    codePoint !== undefined &&
    COMBINING_MARK_PATTERN.test(String.fromCodePoint(codePoint))
  );
}
