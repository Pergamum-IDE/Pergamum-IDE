import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import { GlossaryAtomFlags } from "../../src/shared/glossaryAtomFlags";
import {
  GLOSSARY_TEXT_MAP_CELL_SIZE,
  GLOSSARY_TEXT_MAP_DIALOGUE_COLOR,
  GLOSSARY_TEXT_MAP_ESTIMATED_CHAR_WIDTH_PX,
  GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS,
  GLOSSARY_TEXT_MAP_HIT_COLOR,
  GLOSSARY_TEXT_MAP_NORMAL_COLOR,
  buildGlossaryTextMapPlan,
  buildTextMapLineLayout,
  buildTextMapViewportRect,
  collectGlossaryTextMapOccurrences,
  collectJapaneseDialogueRanges,
  drawGlossaryTextMap,
  isOffsetInGlossaryTextMapOccurrence,
  isOffsetInTextMapRange,
  mapTextOffsetToVisualPosition,
  resolveTextMapCellRect,
  resolveTextMapWrapColumns,
  splitTextIntoLineSpans,
  visualRowForOffset,
  type GlossaryTextMapDrawContext
} from "../../src/renderer/glossaryTextMap";

let atomSeq = 0;

function atom(value: string, matchFlags = 0): GlossaryAtom {
  atomSeq += 1;
  return {
    id: `atom-${atomSeq}`,
    entryId: "e",
    sortOrder: 0,
    value,
    matchFlags,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

function entry(id: string, atoms: GlossaryAtom[]): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atoms.map((a) => ({ ...a, entryId: id })),
    tags: [],
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

describe("resolveTextMapWrapColumns (#375)", () => {
  it("estimates columns from the editor width, not the pixel width itself", () => {
    // 800px / 8px per char = 100 columns.
    expect(resolveTextMapWrapColumns({ editorRect: { width: 800 } })).toBe(100);
    expect(resolveTextMapWrapColumns({ editorRect: { width: 645 } })).toBe(80);
    expect(GLOSSARY_TEXT_MAP_ESTIMATED_CHAR_WIDTH_PX).toBe(8);
  });

  it("falls back when the editor rect is missing or too small", () => {
    expect(resolveTextMapWrapColumns({ editorRect: null })).toBe(
      GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS
    );
    expect(resolveTextMapWrapColumns({ editorRect: { width: 0 } })).toBe(
      GLOSSARY_TEXT_MAP_FALLBACK_WRAP_COLUMNS
    );
    expect(
      resolveTextMapWrapColumns({
        editorRect: { width: Number.NaN },
        fallbackWrapColumns: 60
      })
    ).toBe(60);
  });

  it("honours a custom estimated character width", () => {
    expect(
      resolveTextMapWrapColumns({
        editorRect: { width: 800 },
        estimatedCharWidthPx: 10
      })
    ).toBe(80);
  });
});

describe("splitTextIntoLineSpans (#375)", () => {
  it("splits on \\n, \\r\\n and \\r, keeping each line's startOffset", () => {
    expect(splitTextIntoLineSpans("abc\nde\r\nf\rg")).toEqual([
      { startOffset: 0, length: 3 },
      { startOffset: 4, length: 2 },
      { startOffset: 8, length: 1 },
      { startOffset: 10, length: 1 }
    ]);
  });

  it("yields a single empty line for an empty string", () => {
    expect(splitTextIntoLineSpans("")).toEqual([
      { startOffset: 0, length: 0 }
    ]);
  });

  it("yields a trailing empty line after a trailing newline", () => {
    expect(splitTextIntoLineSpans("a\n")).toEqual([
      { startOffset: 0, length: 1 },
      { startOffset: 2, length: 0 }
    ]);
  });
});

describe("buildTextMapLineLayout (#375)", () => {
  it("keeps real line structure: short lines are one visual row", () => {
    const { lines, totalVisualRows } = buildTextMapLineLayout(
      "abc\n\ndefghijk",
      4
    );

    expect(lines).toEqual([
      {
        lineIndex: 0,
        startOffset: 0,
        length: 3,
        visualRowCount: 1,
        baseVisualRow: 0
      },
      {
        lineIndex: 1,
        startOffset: 4,
        length: 0,
        visualRowCount: 1,
        baseVisualRow: 1
      },
      {
        lineIndex: 2,
        startOffset: 5,
        length: 8,
        visualRowCount: 2,
        baseVisualRow: 2
      }
    ]);
    expect(totalVisualRows).toBe(4);
  });

  it("wraps a long line into ceil(length / wrapColumns) visual rows", () => {
    const { lines, totalVisualRows } = buildTextMapLineLayout(
      "x".repeat(23),
      5
    );
    expect(lines[0].visualRowCount).toBe(5); // ceil(23 / 5)
    expect(totalVisualRows).toBe(5);
  });

  it("an empty document is a single visual row and does not throw", () => {
    expect(buildTextMapLineLayout("", 80)).toEqual({
      lines: [
        {
          lineIndex: 0,
          startOffset: 0,
          length: 0,
          visualRowCount: 1,
          baseVisualRow: 0
        }
      ],
      totalVisualRows: 1
    });
  });
});

describe("mapTextOffsetToVisualPosition (#375)", () => {
  const { lines } = buildTextMapLineLayout("abc\n\ndefghijk", 4);

  it("visualColumn = columnIndex % wrapColumns", () => {
    // offset 5 → line 2, columnIndex 0.
    expect(mapTextOffsetToVisualPosition(5, lines, 4)).toEqual({
      offset: 5,
      lineIndex: 2,
      columnIndex: 0,
      visualRow: 2,
      visualColumn: 0
    });
    // offset 10 → line 2, columnIndex 5 → visualColumn 1, visualRow 2 + 1.
    expect(mapTextOffsetToVisualPosition(10, lines, 4)).toEqual({
      offset: 10,
      lineIndex: 2,
      columnIndex: 5,
      visualRow: 3,
      visualColumn: 1
    });
  });

  it("visualRow = baseVisualRow + floor(columnIndex / wrapColumns)", () => {
    const pos = mapTextOffsetToVisualPosition(12, lines, 4);
    expect(pos).toMatchObject({
      lineIndex: 2,
      columnIndex: 7,
      visualRow: 2 + Math.floor(7 / 4),
      visualColumn: 7 % 4
    });
  });

  it("returns null for a line terminator / out-of-range offset", () => {
    expect(mapTextOffsetToVisualPosition(3, lines, 4)).toBeNull(); // the "\n"
    expect(mapTextOffsetToVisualPosition(4, lines, 4)).toBeNull(); // empty line
    expect(mapTextOffsetToVisualPosition(999, lines, 4)).toBeNull();
  });
});

describe("collectGlossaryTextMapOccurrences (#375)", () => {
  it("returns every atom occurrence range, sorted by start (end exclusive)", () => {
    const occ = collectGlossaryTextMapOccurrences("abc Foo def Foo", [
      entry("e1", [atom("Foo")])
    ]);

    expect(occ).toEqual([
      { start: 4, end: 7 },
      { start: 12, end: 15 }
    ]);
  });

  it("is empty for empty text or no entries", () => {
    expect(
      collectGlossaryTextMapOccurrences("", [entry("e1", [atom("Foo")])])
    ).toEqual([]);
    expect(collectGlossaryTextMapOccurrences("Foo Foo", [])).toEqual([]);
  });

  it("goes through the shared matcher — matchFlags are honoured", () => {
    expect(
      collectGlossaryTextMapOccurrences("z z z", [entry("e1", [atom("z")])])
    ).toEqual([]);

    const optedIn = collectGlossaryTextMapOccurrences("z z z", [
      entry("e1", [atom("z", GlossaryAtomFlags.AllowSingleCharacterMatch)])
    ]);
    expect(optedIn).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 }
    ]);
  });
});

describe("isOffsetInGlossaryTextMapOccurrence (#375)", () => {
  it("treats the range as start <= offset < end", () => {
    const ranges = [{ start: 4, end: 7 }];
    expect(isOffsetInGlossaryTextMapOccurrence(3, ranges)).toBe(false);
    expect(isOffsetInGlossaryTextMapOccurrence(4, ranges)).toBe(true);
    expect(isOffsetInGlossaryTextMapOccurrence(6, ranges)).toBe(true);
    expect(isOffsetInGlossaryTextMapOccurrence(7, ranges)).toBe(false);
  });

  it("stays correct when ranges overlap", () => {
    const overlapping = [
      { start: 0, end: 6 },
      { start: 3, end: 9 }
    ];
    expect(isOffsetInGlossaryTextMapOccurrence(4, overlapping)).toBe(true);
    expect(isOffsetInGlossaryTextMapOccurrence(8, overlapping)).toBe(true);
    expect(isOffsetInGlossaryTextMapOccurrence(9, overlapping)).toBe(false);
  });
});

describe("collectJapaneseDialogueRanges (#375, PoC)", () => {
  it("captures a single 「…」 span, brackets included", () => {
    // 「(0) こ ん に ち は 」(6)  → [0, 7)
    expect(collectJapaneseDialogueRanges("「こんにちは」")).toEqual([
      { startOffset: 0, endOffset: 7 }
    ]);
  });

  it("captures multiple dialogue spans", () => {
    expect(collectJapaneseDialogueRanges("「A」と「B」")).toEqual([
      { startOffset: 0, endOffset: 3 },
      { startOffset: 4, endOffset: 7 }
    ]);
  });

  it("is empty when there is no dialogue", () => {
    expect(collectJapaneseDialogueRanges("ふつうの地の文。")).toEqual([]);
  });

  it("treats an unclosed 「 as running to the end of the text", () => {
    expect(collectJapaneseDialogueRanges("地の文「未閉じ")).toEqual([
      { startOffset: 3, endOffset: 7 }
    ]);
  });

  it("ignores 『』 and \" \" (PoC scope is 「」 only)", () => {
    expect(collectJapaneseDialogueRanges("『これは対象外』")).toEqual([]);
    expect(collectJapaneseDialogueRanges('"also ignored"')).toEqual([]);
  });

  it("does not nest — the first 」 closes the open span, later 「 is ignored", () => {
    // 「(0) 外(1) 「(2) 内(3) 」(4) 外(5) 」(6)
    // The inner 「 at offset 2 is ignored (a span is already open); the first
    // 」 at offset 4 closes → [0, 5). The trailing 」 has no open span.
    expect(collectJapaneseDialogueRanges("「外「内」外」")).toEqual([
      { startOffset: 0, endOffset: 5 }
    ]);
  });
});

describe("isOffsetInTextMapRange (#375)", () => {
  it("treats the range as start <= offset < end", () => {
    const ranges = [{ startOffset: 2, endOffset: 5 }];
    expect(isOffsetInTextMapRange(1, ranges)).toBe(false);
    expect(isOffsetInTextMapRange(2, ranges)).toBe(true);
    expect(isOffsetInTextMapRange(4, ranges)).toBe(true);
    expect(isOffsetInTextMapRange(5, ranges)).toBe(false);
  });
});

describe("resolveTextMapCellRect (#375, 2x2 cells)", () => {
  it("the cell size constant is 2", () => {
    expect(GLOSSARY_TEXT_MAP_CELL_SIZE).toBe(2);
  });

  it("maps a logical (visualColumn, visualRow) to a 2x2 rect at * cellSize", () => {
    expect(resolveTextMapCellRect(0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2
    });
    expect(resolveTextMapCellRect(3, 5)).toEqual({
      x: 6,
      y: 10,
      width: 2,
      height: 2
    });
  });

  it("honours an explicit cell size", () => {
    expect(resolveTextMapCellRect(4, 2, 3)).toEqual({
      x: 12,
      y: 6,
      width: 3,
      height: 3
    });
  });
});

describe("buildGlossaryTextMapPlan (#375, line-aware, 2x2 cells)", () => {
  it("does not throw on empty text and produces no pixels", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "",
      entries: [entry("e1", [atom("Foo")])],
      wrapColumns: 80
    });
    expect(plan.pixels).toEqual([]);
    expect(plan.occurrences).toEqual([]);
    expect(plan.totalVisualRows).toBe(1);
    expect(plan.cellSize).toBe(2);
    // Logical canvas size accounts for the cell size.
    expect(plan.logicalPixelWidth).toBe(80 * 2);
    expect(plan.logicalPixelHeight).toBe(1 * 2);
  });

  it("draws each character as a 2x2 cell at (visualColumn*2, visualRow*2)", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foo\nbar",
      entries: [entry("e1", [atom("Foo")])],
      wrapColumns: 80
    });

    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    // The "\n" at offset 3 is not drawn; offsets are not compacted.
    expect(byOffset.has(3)).toBe(false);

    const first = byOffset.get(0)!;
    expect(first).toMatchObject({
      visualColumn: 0,
      visualRow: 0,
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      hit: true,
      color: GLOSSARY_TEXT_MAP_HIT_COLOR
    });

    // "b" is on the second source line → visualRow 1 → y = 2.
    const b = byOffset.get(4)!;
    expect(b).toMatchObject({
      visualColumn: 0,
      visualRow: 1,
      x: 0,
      y: 2,
      width: 2,
      height: 2,
      hit: false,
      color: GLOSSARY_TEXT_MAP_NORMAL_COLOR
    });
  });

  it("virtually wraps a long line at wrapColumns, then applies the cell size", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "x".repeat(20),
      entries: [],
      wrapColumns: 5
    });

    const seven = plan.pixels.find((p) => p.offset === 7)!;
    expect(seven.visualColumn).toBe(7 % 5);
    expect(seven.visualRow).toBe(Math.floor(7 / 5));
    expect(seven.x).toBe((7 % 5) * 2);
    expect(seven.y).toBe(Math.floor(7 / 5) * 2);
    // 20 chars / 5 columns → 4 visual rows → logical height 8.
    expect(plan.totalVisualRows).toBe(4);
    expect(plan.logicalPixelHeight).toBe(4 * 2);
  });

  it("does not break on overlapping occurrences (all covered chars are hits)", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foobar",
      entries: [entry("e1", [atom("Foobar"), atom("bar")])],
      wrapColumns: 80
    });

    expect(plan.occurrences.length).toBeGreaterThanOrEqual(1);
    expect(plan.pixels.every((p) => p.hit)).toBe(true);
  });

  it("empty lines occupy a visual row without producing pixels", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "a\n\n\nb",
      entries: [],
      wrapColumns: 80
    });

    expect(plan.totalVisualRows).toBe(4);
    // Only "a" and "b" are drawn.
    expect(plan.pixels.map((p) => p.offset)).toEqual([0, 4]);
    expect(plan.pixels[1].visualRow).toBe(3);
    expect(plan.pixels[1].y).toBe(3 * 2);
  });

  it("marks 「…」 cells as dialogue (blue), with Glossary hit taking precedence", () => {
    // 地(0) 「(1) 犬(2) 」(3)  — "犬" is a glossary atom.
    const plan = buildGlossaryTextMapPlan({
      text: "地「犬」",
      entries: [
        entry("e1", [atom("犬", GlossaryAtomFlags.AllowSingleCharacterMatch)])
      ],
      wrapColumns: 80
    });

    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    expect(plan.dialogues).toEqual([{ startOffset: 1, endOffset: 4 }]);

    // 地 — plain text.
    expect(byOffset.get(0)).toMatchObject({
      dialogue: false,
      hit: false,
      color: GLOSSARY_TEXT_MAP_NORMAL_COLOR
    });
    // 「 — inside the dialogue range, not a hit → blue.
    expect(byOffset.get(1)).toMatchObject({
      dialogue: true,
      hit: false,
      color: GLOSSARY_TEXT_MAP_DIALOGUE_COLOR
    });
    // 犬 — dialogue AND glossary hit → hit colour wins.
    expect(byOffset.get(2)).toMatchObject({
      dialogue: true,
      hit: true,
      color: GLOSSARY_TEXT_MAP_HIT_COLOR
    });
    // 」 — still dialogue, blue.
    expect(byOffset.get(3)).toMatchObject({
      dialogue: true,
      hit: false,
      color: GLOSSARY_TEXT_MAP_DIALOGUE_COLOR
    });
  });
});

describe("drawGlossaryTextMap (#375, 2x2 cells)", () => {
  interface Call {
    type: "clearRect" | "fillRect";
    x: number;
    y: number;
    w: number;
    h: number;
    fillStyle: string;
  }

  function fakeContext(): {
    context: GlossaryTextMapDrawContext;
    calls: Call[];
  } {
    const calls: Call[] = [];
    const context: GlossaryTextMapDrawContext = {
      fillStyle: "",
      imageSmoothingEnabled: true,
      clearRect(x, y, w, h) {
        calls.push({
          type: "clearRect",
          x,
          y,
          w,
          h,
          fillStyle: String(this.fillStyle)
        });
      },
      fillRect(x, y, w, h) {
        calls.push({
          type: "fillRect",
          x,
          y,
          w,
          h,
          fillStyle: String(this.fillStyle)
        });
      }
    };
    return { context, calls };
  }

  it("disables smoothing, clears the logical canvas, then black then white", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foo bar",
      entries: [entry("e1", [atom("Foo")])],
      wrapColumns: 80
    });
    const { context, calls } = fakeContext();

    drawGlossaryTextMap(context, plan);

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(calls[0]).toMatchObject({
      type: "clearRect",
      x: 0,
      y: 0,
      w: plan.logicalPixelWidth,
      h: plan.logicalPixelHeight
    });

    const fills = calls.filter((c) => c.type === "fillRect");
    // Every fill is a 2x2 cell.
    expect(fills.every((c) => c.w === 2 && c.h === 2)).toBe(true);

    const lastBlack = fills
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.fillStyle === GLOSSARY_TEXT_MAP_NORMAL_COLOR)
      .at(-1)!.i;
    const firstHit = fills.findIndex(
      (c) => c.fillStyle === GLOSSARY_TEXT_MAP_HIT_COLOR
    );

    expect(firstHit).toBeGreaterThan(lastBlack);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_HIT_COLOR)
    ).toHaveLength(3);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_NORMAL_COLOR)
    ).toHaveLength(4);
  });

  it("paints in the order black -> blue (dialogue) -> glossary hit", () => {
    // 地(0) 「(1) 犬(2) 」(3) 地(4)  — dialogue [1,4), "犬" is a glossary hit.
    const plan = buildGlossaryTextMapPlan({
      text: "地「犬」地",
      entries: [
        entry("e1", [atom("犬", GlossaryAtomFlags.AllowSingleCharacterMatch)])
      ],
      wrapColumns: 80
    });
    const { context, calls } = fakeContext();

    drawGlossaryTextMap(context, plan);

    const fills = calls.filter((c) => c.type === "fillRect");
    expect(fills.every((c) => c.w === 2 && c.h === 2)).toBe(true);

    const lastOf = (color: string): number =>
      fills.map((c) => c.fillStyle).lastIndexOf(color);
    const firstOf = (color: string): number =>
      fills.findIndex((c) => c.fillStyle === color);

    // black (地×2) then blue (「 」) then red (犬).
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_NORMAL_COLOR)
    ).toHaveLength(2);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_DIALOGUE_COLOR)
    ).toHaveLength(2);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_HIT_COLOR)
    ).toHaveLength(1);

    expect(lastOf(GLOSSARY_TEXT_MAP_NORMAL_COLOR)).toBeLessThan(
      firstOf(GLOSSARY_TEXT_MAP_DIALOGUE_COLOR)
    );
    expect(lastOf(GLOSSARY_TEXT_MAP_DIALOGUE_COLOR)).toBeLessThan(
      firstOf(GLOSSARY_TEXT_MAP_HIT_COLOR)
    );
  });
});

describe("visualRowForOffset (#375, viewport overlay)", () => {
  // "abc\n\ndefghijk" @ wrap 4 → line0 rows[0], line1(empty) rows[1],
  // line2 rows[2..3].
  const { lines } = buildTextMapLineLayout("abc\n\ndefghijk", 4);

  it("resolves an in-line offset to its (possibly wrapped) visual row", () => {
    expect(visualRowForOffset(0, lines, 4)).toBe(0);
    expect(visualRowForOffset(5, lines, 4)).toBe(2); // "d" — line2 row 0
    expect(visualRowForOffset(10, lines, 4)).toBe(3); // 6th char of line2 → wrap
  });

  it("clamps a line terminator / out-of-range offset to a real row", () => {
    expect(visualRowForOffset(-5, lines, 4)).toBe(0);
    expect(visualRowForOffset(3, lines, 4)).toBe(0); // the "\n" after line0
    expect(visualRowForOffset(999, lines, 4)).toBe(3); // past the end → last row
  });

  it("returns 0 for an empty line model", () => {
    expect(visualRowForOffset(42, [], 4)).toBe(0);
  });
});

describe("buildTextMapViewportRect (#375, viewport overlay)", () => {
  const plan = buildGlossaryTextMapPlan({
    text: Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"),
    entries: [],
    wrapColumns: 40
  });

  it("returns null when there is no visible range", () => {
    expect(buildTextMapViewportRect(plan, null, 200)).toBeNull();
  });

  it("returns null for an empty / inverted range (to <= from)", () => {
    expect(
      buildTextMapViewportRect(plan, { from: 10, to: 10 }, 200)
    ).toBeNull();
    expect(
      buildTextMapViewportRect(plan, { from: 30, to: 10 }, 200)
    ).toBeNull();
  });

  it("spans the visual rows of from..to, full width, 1px-stroke ready", () => {
    // Lines are "line 0".."line 19", each 6-7 chars, one visual row each.
    const rect = buildTextMapViewportRect(plan, { from: 0, to: 7 }, plan.lines.at(-1)!.startOffset + 7)!;
    expect(rect).not.toBeNull();
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(plan.logicalPixelWidth);
    expect(rect.y).toBe(0);
    // from row 0, to-1 (offset 6) still row 0 → 1 row tall = cellSize.
    expect(rect.height).toBe(plan.cellSize);
  });

  it("clamps out-of-range endpoints into the document", () => {
    const textLength = plan.lines.at(-1)!.startOffset + 7;
    const rect = buildTextMapViewportRect(
      plan,
      { from: -100, to: textLength + 9999 },
      textLength
    )!;
    expect(rect.y).toBe(0);
    // Covers the whole document → tall band, still within content height.
    expect(rect.y + rect.height).toBeLessThanOrEqual(plan.logicalPixelHeight);
    expect(rect.height).toBeGreaterThanOrEqual(plan.cellSize);
  });

  it("never produces a zero-height rectangle", () => {
    const rect = buildTextMapViewportRect(plan, { from: 3, to: 4 }, 200)!;
    expect(rect.height).toBeGreaterThanOrEqual(plan.cellSize);
  });
});

describe("glossaryTextMap source (#375)", () => {
  it("no longer uses one-dimensional offset-modulo-width rasterisation", () => {
    const source = readFileSync("src/renderer/glossaryTextMap.ts", "utf8");
    // Drop comments so the retired-pattern checks see code only.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    // The retired 1-D raster keyed pixels off the raw offset / a pixel width.
    expect(code).not.toMatch(/offset\s*%/);
    expect(code).not.toMatch(/%\s*(logical|display|editor|pixel)Width/i);
    expect(code).not.toContain("resolveTextMapLogicalRect");
    expect(code).not.toContain("mapTextOffsetToTextMapPixel");

    // The new model is line + column based.
    expect(code).toContain("columnIndex % wrapColumns");
    expect(code).toContain("buildTextMapLineLayout");
    expect(code).toContain("splitTextIntoLineSpans");
  });
});
