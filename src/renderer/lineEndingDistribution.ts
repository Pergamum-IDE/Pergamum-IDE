import { lineEndingBreakSetToArray, type LineEndingBreakSet } from "./editorLineEndingField";
import type { LineEndingKind } from "./lineEndingTracking";

/**
 * #252: read-only summary of a document's per-break line-ending kinds,
 * built from #253's `LineEndingBreakSet` (never a separate raw-content
 * reparse). Intended to be computed once when the distribution dialog
 * opens or the command runs — an O(number of breaks) walk is acceptable
 * there, but this must never be wired to run on every keystroke or synced
 * into React state continuously.
 */
export interface LineEndingCounts {
  readonly lf: number;
  readonly crlf: number;
  readonly cr: number;
}

export interface LineEndingDistribution {
  readonly counts: LineEndingCounts;
  /** LF + CRLF + CR. EOF without a terminating break is never counted. */
  readonly total: number;
  /** Each kind's share of `total`, rounded to 1 decimal place. 0 when `total` is 0. */
  readonly percentages: LineEndingCounts;
  readonly expectedKind: LineEndingKind;
  readonly unexpectedCount: number;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeLineEndingDistribution(
  breaks: LineEndingBreakSet,
  expectedKind: LineEndingKind
): LineEndingDistribution {
  let lf = 0;
  let crlf = 0;
  let cr = 0;
  let unexpectedCount = 0;

  for (const lineBreak of lineEndingBreakSetToArray(breaks)) {
    switch (lineBreak.kind) {
      case "lf":
        lf += 1;
        break;
      case "crlf":
        crlf += 1;
        break;
      case "cr":
        cr += 1;
        break;
    }

    if (lineBreak.kind !== expectedKind) {
      unexpectedCount += 1;
    }
  }

  const total = lf + crlf + cr;
  const percentages: LineEndingCounts =
    total === 0
      ? { lf: 0, crlf: 0, cr: 0 }
      : {
          lf: roundToOneDecimal((lf / total) * 100),
          crlf: roundToOneDecimal((crlf / total) * 100),
          cr: roundToOneDecimal((cr / total) * 100)
        };

  return {
    counts: { lf, crlf, cr },
    total,
    percentages,
    expectedKind,
    unexpectedCount
  };
}
