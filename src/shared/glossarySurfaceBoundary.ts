/**
 * #375: boundary acceptance for a raw glossary atom match.
 *
 * Each edge is gated by a boolean the caller derives from that atom's 2-bit
 * boundary policy (`getGlossaryAtomBoundaryStartPolicy` / `...End` +
 * `glossaryBoundaryPolicyChecksBoundary`): when `true` the edge must sit on a
 * character-class boundary, when `false` the edge is accepted
 * unconditionally. `None` → `false`; `Auto` / `Strict` / `Reserved` → `true`
 * (they all run the same concrete check for now).
 */

export interface GlossaryBoundaryContext {
  text: string;
  start: number;
  end: number;
  checkStartBoundary: boolean;
  checkEndBoundary: boolean;
}

type GlossaryBoundaryCharacterClass = "asciiWord" | "katakana" | "other";

function isAsciiWordCodeUnit(codeUnit: number): boolean {
  return (
    (codeUnit >= 0x30 && codeUnit <= 0x39) ||
    (codeUnit >= 0x41 && codeUnit <= 0x5a) ||
    codeUnit === 0x5f ||
    (codeUnit >= 0x61 && codeUnit <= 0x7a)
  );
}

function isKatakanaCodeUnit(codeUnit: number): boolean {
  return (codeUnit >= 0x30a1 && codeUnit <= 0x30fa) || codeUnit === 0x30fc;
}

function boundaryCharacterClass(
  codeUnit: number
): GlossaryBoundaryCharacterClass {
  if (isKatakanaCodeUnit(codeUnit)) {
    return "katakana";
  }

  if (isAsciiWordCodeUnit(codeUnit)) {
    return "asciiWord";
  }

  return "other";
}

function shouldAcceptConcreteBoundary(
  matchedEdgeCodeUnit: number,
  adjacentCodeUnit: number
): boolean {
  const matchedEdgeClass = boundaryCharacterClass(matchedEdgeCodeUnit);

  if (matchedEdgeClass === "other") {
    return true;
  }

  return matchedEdgeClass !== boundaryCharacterClass(adjacentCodeUnit);
}

function shouldAcceptBoundaryEdge(
  text: string,
  matchedEdgeIndex: number,
  adjacentIndex: number,
  check: boolean
): boolean {
  if (!check) {
    return true;
  }

  if (adjacentIndex < 0 || adjacentIndex >= text.length) {
    return true;
  }

  return shouldAcceptConcreteBoundary(
    text.charCodeAt(matchedEdgeIndex),
    text.charCodeAt(adjacentIndex)
  );
}

export function shouldAcceptGlossarySurfaceBoundary(
  context: GlossaryBoundaryContext
): boolean {
  return (
    shouldAcceptBoundaryEdge(
      context.text,
      context.start,
      context.start - 1,
      context.checkStartBoundary
    ) &&
    shouldAcceptBoundaryEdge(
      context.text,
      context.end - 1,
      context.end,
      context.checkEndBoundary
    )
  );
}
