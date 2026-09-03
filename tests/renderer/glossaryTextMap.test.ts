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
  collectDocumentMapDialogueRanges,
  collectGlossaryTextMapGlossaryOccurrences,
  collectGlossaryTextMapOccurrences,
  collectJapaneseDialogueRanges,
  documentMapDialogueColorAtOffset,
  drawGlossaryTextMap,
  glossaryTextMapHitColorAtOffset,
  isOffsetInGlossaryTextMapOccurrence,
  isOffsetInTextMapRange,
  mapTextOffsetToVisualPosition,
  resolveGlossaryTextMapHitColor,
  resolveTextMapCellRect,
  resolveTextMapWrapColumns,
  splitTextIntoLineSpans,
  visualRowForOffset,
  type GlossaryTextMapDrawContext
} from "../../src/renderer/glossaryTextMap";
import { adjustDocumentMapTagColorForVisibility } from "../../src/shared/documentMapTagColor";
import type { GlossaryTag } from "../../src/shared/glossary";

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

function tag(id: string, backgroundRgb: string): GlossaryTag {
  return {
    id,
    label: id,
    description: null,
    backgroundRgb,
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

function entry(
  id: string,
  atoms: GlossaryAtom[],
  tags: GlossaryTag[] = []
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atoms.map((a) => ({ ...a, entryId: id })),
    tags,
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

describe("resolveGlossaryTextMapHitColor (#375, primary-tag colour)", () => {
  it("uses the PRIMARY (first-assigned) tag's backgroundRgb", () => {
    const e = entry("e1", [atom("Foo")], [
      tag("t-primary", "#00ff00"),
      tag("t-second", "#0000aa")
    ]);
    expect(resolveGlossaryTextMapHitColor(e)).toBe("#00ff00");
  });

  it("falls back to the fixed hit colour for a tagless entry", () => {
    expect(
      resolveGlossaryTextMapHitColor(entry("e1", [atom("Foo")]))
    ).toBe(GLOSSARY_TEXT_MAP_HIT_COLOR);
  });

  it("falls back when the tag colour is not a #rrggbb hex", () => {
    for (const bad of ["red", "#12", "#1234567", "rgb(1,2,3)", ""]) {
      expect(
        resolveGlossaryTextMapHitColor(
          entry("e1", [atom("Foo")], [tag("t", bad)])
        )
      ).toBe(GLOSSARY_TEXT_MAP_HIT_COLOR);
    }
  });

  it("prefers a tagColorCache entry for the primary tag id over its raw backgroundRgb", () => {
    const e = entry("e1", [atom("Foo")], [tag("t-primary", "#00ff00")]);
    const cache = new Map([["t-primary", "#123456"]]);
    expect(resolveGlossaryTextMapHitColor(e, GLOSSARY_TEXT_MAP_HIT_COLOR, cache)).toBe(
      "#123456"
    );
    // A cache miss falls through to the tag's own colour.
    expect(
      resolveGlossaryTextMapHitColor(e, GLOSSARY_TEXT_MAP_HIT_COLOR, new Map())
    ).toBe("#00ff00");
  });
});

describe("collectGlossaryTextMapGlossaryOccurrences (#375)", () => {
  it("tags each occurrence with its owning entry id and primary-tag colour", () => {
    const occ = collectGlossaryTextMapGlossaryOccurrences("x Foo y Foo", [
      entry("e1", [atom("Foo")], [tag("t", "#123456")])
    ]);
    expect(occ).toEqual([
      { entryId: "e1", startOffset: 2, endOffset: 5, color: "#123456" },
      { entryId: "e1", startOffset: 8, endOffset: 11, color: "#123456" }
    ]);
  });

  it("colours per ENTRY, not per atom — every atom of an entry shares the colour", () => {
    const occ = collectGlossaryTextMapGlossaryOccurrences("Foo Bar", [
      entry(
        "e1",
        [atom("Foo"), atom("Bar")],
        [tag("t", "#abcdef")]
      )
    ]);
    expect(occ.map((o) => o.color)).toEqual(["#abcdef", "#abcdef"]);
    expect(occ.every((o) => o.entryId === "e1")).toBe(true);
  });

  it("uses the fallback colour for a tagless entry's hits", () => {
    const occ = collectGlossaryTextMapGlossaryOccurrences("Foo", [
      entry("e1", [atom("Foo")])
    ]);
    expect(occ).toEqual([
      {
        entryId: "e1",
        startOffset: 0,
        endOffset: 3,
        color: GLOSSARY_TEXT_MAP_HIT_COLOR
      }
    ]);
  });

  it("is empty for empty text or no entries, and honours matchFlags", () => {
    expect(
      collectGlossaryTextMapGlossaryOccurrences("", [entry("e1", [atom("Foo")])])
    ).toEqual([]);
    expect(collectGlossaryTextMapGlossaryOccurrences("Foo", [])).toEqual([]);
    // single-char atom without opt-in → no occurrence.
    expect(
      collectGlossaryTextMapGlossaryOccurrences("z z", [
        entry("e1", [atom("z")], [tag("t", "#00ff00")])
      ])
    ).toEqual([]);
  });
});

describe("glossaryTextMapHitColorAtOffset (#375)", () => {
  const occ = [
    { entryId: "e1", startOffset: 4, endOffset: 7, color: "#00ff00" }
  ];

  it("returns the occurrence colour for start <= offset < end, else null", () => {
    expect(glossaryTextMapHitColorAtOffset(3, occ)).toBeNull();
    expect(glossaryTextMapHitColorAtOffset(4, occ)).toBe("#00ff00");
    expect(glossaryTextMapHitColorAtOffset(6, occ)).toBe("#00ff00");
    expect(glossaryTextMapHitColorAtOffset(7, occ)).toBeNull();
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
    expect(plan.dialogues).toEqual([
      {
        startOffset: 1,
        endOffset: 4,
        color: GLOSSARY_TEXT_MAP_DIALOGUE_COLOR,
        pairIndex: 0
      }
    ]);

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

  it("#375: a Glossary hit's pixels take the Entry's PRIMARY tag colour", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "x Foo y",
      entries: [
        entry("e1", [atom("Foo")], [
          tag("primary", "#00ff00"),
          tag("secondary", "#0000aa")
        ])
      ],
      wrapColumns: 80
    });

    const foo = plan.pixels.filter((p) => p.offset >= 2 && p.offset < 5);
    expect(foo.map((p) => p.offset)).toEqual([2, 3, 4]);
    expect(foo.every((p) => p.hit && p.color === "#00ff00")).toBe(true);
    // Non-hit cells are unaffected.
    expect(plan.pixels.find((p) => p.offset === 0)?.color).toBe(
      GLOSSARY_TEXT_MAP_NORMAL_COLOR
    );
    // The plan's occurrences carry the entry + colour.
    expect(plan.occurrences).toEqual([
      { entryId: "e1", startOffset: 2, endOffset: 5, color: "#00ff00" }
    ]);
  });

  it("#375: a tagless Entry's hits use the fallback colour", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foo",
      entries: [entry("e1", [atom("Foo")])],
      wrapColumns: 80
    });
    expect(plan.pixels.every((p) => p.color === GLOSSARY_TEXT_MAP_HIT_COLOR)).toBe(
      true
    );
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

  it("#375: fills each Entry's hits in its own primary-tag colour, after black & blue", () => {
    // "Aa Bb" — "Aa" = green entry, "Bb" = a tagless (fallback red) entry.
    const plan = buildGlossaryTextMapPlan({
      text: "Aa Bb",
      entries: [
        entry("green", [atom("Aa")], [tag("t", "#00ff00")]),
        entry("plain", [atom("Bb")])
      ],
      wrapColumns: 80
    });
    const { context, calls } = fakeContext();

    drawGlossaryTextMap(context, plan);

    const fills = calls.filter((c) => c.type === "fillRect");
    const firstOf = (color: string): number =>
      fills.findIndex((c) => c.fillStyle === color);
    const lastOf = (color: string): number =>
      fills.map((c) => c.fillStyle).lastIndexOf(color);

    // "Aa" → 2 green cells, "Bb" → 2 fallback-red cells, " " → 1 black cell.
    expect(
      fills.filter((c) => c.fillStyle === "#00ff00")
    ).toHaveLength(2);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_HIT_COLOR)
    ).toHaveLength(2);
    expect(
      fills.filter((c) => c.fillStyle === GLOSSARY_TEXT_MAP_NORMAL_COLOR)
    ).toHaveLength(1);

    // Both hit colours are drawn AFTER the black pass.
    expect(firstOf("#00ff00")).toBeGreaterThan(
      lastOf(GLOSSARY_TEXT_MAP_NORMAL_COLOR)
    );
    expect(firstOf(GLOSSARY_TEXT_MAP_HIT_COLOR)).toBeGreaterThan(
      lastOf(GLOSSARY_TEXT_MAP_NORMAL_COLOR)
    );
  });

  it("#375: an unusable tag colour falls back without throwing", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foo",
      entries: [entry("e1", [atom("Foo")], [tag("t", "not-a-color")])],
      wrapColumns: 80
    });
    const { context, calls } = fakeContext();

    expect(() => drawGlossaryTextMap(context, plan)).not.toThrow();
    expect(
      calls
        .filter((c) => c.type === "fillRect")
        .every((c) => c.fillStyle === GLOSSARY_TEXT_MAP_HIT_COLOR)
    ).toBe(true);
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

describe("collectDocumentMapDialogueRanges (#375, settings-driven)", () => {
  it("detects each pair's spans, in array order, carrying colour + pairIndex", () => {
    const ranges = collectDocumentMapDialogueRanges("地「A」と『B』", [
      { open: "「", close: "」", color: "#0000ff" },
      { open: "『", close: "』", color: "#7c3aed" }
    ]);
    expect(ranges).toEqual([
      { startOffset: 1, endOffset: 4, color: "#0000ff", pairIndex: 0 },
      { startOffset: 5, endOffset: 8, color: "#7c3aed", pairIndex: 1 }
    ]);
  });

  it("is empty for an empty pair list; an unclosed open runs to the end", () => {
    expect(collectDocumentMapDialogueRanges("「x」", [])).toEqual([]);
    expect(
      collectDocumentMapDialogueRanges("地「未閉じ", [
        { open: "「", close: "」", color: "#0000ff" }
      ])
    ).toEqual([
      { startOffset: 1, endOffset: 5, color: "#0000ff", pairIndex: 0 }
    ]);
  });

  it("supports multi-character delimiters and does not throw on empty ones", () => {
    expect(
      collectDocumentMapDialogueRanges('say "hi" ok', [
        { open: '"', close: '"', color: "#0000ff" }
      ])
    ).toEqual([
      { startOffset: 4, endOffset: 8, color: "#0000ff", pairIndex: 0 }
    ]);
    expect(
      collectDocumentMapDialogueRanges("<<a>>", [
        { open: "<<", close: ">>", color: "#0000ff" }
      ])
    ).toEqual([
      { startOffset: 0, endOffset: 5, color: "#0000ff", pairIndex: 0 }
    ]);
    expect(
      collectDocumentMapDialogueRanges("abc", [
        { open: "", close: "", color: "#0000ff" }
      ])
    ).toEqual([]);
  });
});

describe("documentMapDialogueColorAtOffset (#375, later pair wins)", () => {
  const ranges = [
    { startOffset: 0, endOffset: 6, color: "#0000ff", pairIndex: 0 },
    { startOffset: 3, endOffset: 9, color: "#7c3aed", pairIndex: 1 }
  ];

  it("returns the highest-pairIndex range's colour for an overlap", () => {
    expect(documentMapDialogueColorAtOffset(1, ranges)).toBe("#0000ff");
    expect(documentMapDialogueColorAtOffset(4, ranges)).toBe("#7c3aed"); // overlap
    expect(documentMapDialogueColorAtOffset(8, ranges)).toBe("#7c3aed");
    expect(documentMapDialogueColorAtOffset(9, ranges)).toBeNull();
  });
});

describe("buildGlossaryTextMapPlan (#375, documentMap settings)", () => {
  it("uses narrationColor / glossaryFallbackColor / dialogueDelimiterPairs from settings", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "地『Foo』",
      entries: [entry("e1", [atom("Foo")])], // tagless → fallback colour
      wrapColumns: 80,
      narrationColor: "#101010",
      glossaryFallbackColor: "#00ff00",
      dialogueDelimiterPairs: [
        { open: "『", close: "』", color: "#abcdef" }
      ]
    });
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    // 地(0) 『(1) F(2) o(3) o(4) 』(5)
    expect(byOffset.get(0)?.color).toBe("#101010"); // narration
    expect(byOffset.get(1)?.color).toBe("#abcdef"); // dialogue pair colour
    // Foo is a glossary hit on a tagless entry → the settings fallback colour.
    expect(byOffset.get(2)?.color).toBe("#00ff00");
    expect(byOffset.get(2)?.hit).toBe(true);
    expect(byOffset.get(5)?.color).toBe("#abcdef"); // 』 still dialogue
  });

  it("later dialogue pair wins on overlap; a Glossary hit still overrides both", () => {
    // "「a『x』b」c" — pair0 「」 spans the whole quote, pair1 『』 nested; "x" = hit.
    const plan = buildGlossaryTextMapPlan({
      text: "「a『x』b」c",
      entries: [
        entry("e1", [atom("x", GlossaryAtomFlags.AllowSingleCharacterMatch)])
      ],
      wrapColumns: 80,
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#0000ff" },
        { open: "『", close: "』", color: "#7c3aed" }
      ]
    });
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    // 「(0) a(1) 『(2) x(3) 』(4) b(5) 」(6) c(7)
    expect(byOffset.get(1)?.color).toBe("#0000ff"); // only pair0
    expect(byOffset.get(2)?.color).toBe("#7c3aed"); // pair1 (later) wins
    expect(byOffset.get(3)).toMatchObject({ hit: true }); // glossary hit
    expect(byOffset.get(3)?.color).toBe(GLOSSARY_TEXT_MAP_HIT_COLOR); // hit > dialogue
    expect(byOffset.get(5)?.color).toBe("#0000ff"); // back to pair0
    expect(byOffset.get(7)?.color).toBe(GLOSSARY_TEXT_MAP_NORMAL_COLOR); // narration
  });

  it("without documentMap input it keeps the built-in grey narration / grey dialogue / red hit defaults", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "地「x」",
      entries: [
        entry("e1", [atom("x", GlossaryAtomFlags.AllowSingleCharacterMatch)])
      ],
      wrapColumns: 80
    });
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    expect(byOffset.get(0)?.color).toBe(GLOSSARY_TEXT_MAP_NORMAL_COLOR);
    expect(byOffset.get(1)?.color).toBe(GLOSSARY_TEXT_MAP_DIALOGUE_COLOR);
    expect(byOffset.get(2)?.color).toBe(GLOSSARY_TEXT_MAP_HIT_COLOR);
  });
});

describe("buildGlossaryTextMapPlan (#375, tag-colour visibility adjustment)", () => {
  const RAW_TAG_COLOR = "#3a7bd5";

  function planWith(adjust: boolean | undefined) {
    return buildGlossaryTextMapPlan({
      text: "x Foo Foo Foo y",
      entries: [
        entry("e1", [atom("Foo")], [tag("primary", RAW_TAG_COLOR)])
      ],
      wrapColumns: 80,
      adjustTagColorsForVisibility: adjust
    });
  }

  it("draws the first-tag hits in the HSL-adjusted colour when ON", () => {
    const plan = planWith(true);
    const expected = adjustDocumentMapTagColorForVisibility(RAW_TAG_COLOR);
    expect(expected).not.toBe(RAW_TAG_COLOR);

    const hits = plan.pixels.filter((p) => p.hit);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((p) => p.color === expected)).toBe(true);
    expect(plan.occurrences.every((o) => o.color === expected)).toBe(true);
    // The correction is cached per tag, not recomputed per pixel.
    expect(plan.tagColorCache.get("primary")).toBe(expected);
    expect(plan.tagColorCache.size).toBe(1);
  });

  it("uses the raw tag backgroundRgb when OFF", () => {
    const plan = planWith(false);
    const hits = plan.pixels.filter((p) => p.hit);
    expect(hits.every((p) => p.color === RAW_TAG_COLOR)).toBe(true);
    expect(plan.tagColorCache.get("primary")).toBe(RAW_TAG_COLOR);
  });

  it("defaults to raw tag colours when the flag is omitted (pre-#375 behaviour)", () => {
    const plan = planWith(undefined);
    expect(plan.pixels.filter((p) => p.hit).every((p) => p.color === RAW_TAG_COLOR)).toBe(
      true
    );
  });

  it("never adjusts the untagged-Entry fallback colour", () => {
    // #909090 is achromatic (s=0) → it WOULD visibly shift if it were run
    // through the saturation adjustment.
    const fallback = "#909090";
    expect(adjustDocumentMapTagColorForVisibility(fallback)).not.toBe(fallback);

    const plan = buildGlossaryTextMapPlan({
      text: "x Bar y",
      entries: [entry("e1", [atom("Bar")])], // no tags
      wrapColumns: 80,
      glossaryFallbackColor: fallback,
      adjustTagColorsForVisibility: true
    });
    expect(
      plan.pixels.filter((p) => p.hit).every((p) => p.color === fallback)
    ).toBe(true);
    expect(plan.occurrences.every((o) => o.color === fallback)).toBe(true);
    expect(plan.tagColorCache.size).toBe(0);
  });

  it("with adjustment ON, narration and dialogue-pair colours are used AS-IS (only the tag colour shifts)", () => {
    // 地(0) 「(1) x(2) 」(3) と(4) 『(5) y(6) 』(7)
    const plan = buildGlossaryTextMapPlan({
      text: "地「x」と『y』",
      entries: [
        entry(
          "e1",
          [atom("x", GlossaryAtomFlags.AllowSingleCharacterMatch)],
          [tag("primary", RAW_TAG_COLOR)]
        )
      ],
      wrapColumns: 80,
      narrationColor: "#3c3c3c",
      glossaryFallbackColor: "#ff0000",
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#909090" },
        { open: "『", close: "』", color: "#123456" }
      ],
      adjustTagColorsForVisibility: true
    });

    // These settings colours are achromatic / distinctive — they would move if
    // they were adjusted.
    expect(adjustDocumentMapTagColorForVisibility("#3c3c3c")).not.toBe("#3c3c3c");
    expect(adjustDocumentMapTagColorForVisibility("#909090")).not.toBe("#909090");

    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    // narration
    expect(byOffset.get(0)?.color).toBe("#3c3c3c");
    expect(byOffset.get(4)?.color).toBe("#3c3c3c");
    // dialogue pair 0 (「」) — unchanged settings colour
    expect(byOffset.get(1)).toMatchObject({ dialogue: true, color: "#909090" });
    expect(byOffset.get(3)?.color).toBe("#909090");
    // dialogue pair 1 (『』) — unchanged settings colour
    expect(byOffset.get(5)?.color).toBe("#123456");
    expect(byOffset.get(7)?.color).toBe("#123456");
    // only the first-tag hit is shifted
    expect(byOffset.get(2)).toMatchObject({
      hit: true,
      color: adjustDocumentMapTagColorForVisibility(RAW_TAG_COLOR)
    });
  });

  it("with adjustment ON, the later dialogue pair still wins an overlap, and a hit still overrides dialogue", () => {
    // 「(0) a(1) 『(2) x(3) 』(4) b(5) 」(6) c(7) — pair0 spans the whole quote,
    // pair1 『』 is nested; "x" is a Glossary hit.
    const plan = buildGlossaryTextMapPlan({
      text: "「a『x』b」c",
      entries: [
        entry(
          "e1",
          [atom("x", GlossaryAtomFlags.AllowSingleCharacterMatch)],
          [tag("primary", RAW_TAG_COLOR)]
        )
      ],
      wrapColumns: 80,
      narrationColor: "#3c3c3c",
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#909090" },
        { open: "『", close: "』", color: "#123456" }
      ],
      adjustTagColorsForVisibility: true
    });
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    expect(byOffset.get(1)?.color).toBe("#909090"); // pair0 only
    expect(byOffset.get(2)?.color).toBe("#123456"); // pair1 (later) wins
    expect(byOffset.get(3)).toMatchObject({
      hit: true,
      color: adjustDocumentMapTagColorForVisibility(RAW_TAG_COLOR)
    }); // hit > dialogue
    expect(byOffset.get(5)?.color).toBe("#909090"); // back to pair0
    expect(byOffset.get(7)?.color).toBe("#3c3c3c"); // narration
  });

  it("with adjustment OFF, the first-tag colour is used raw alongside untouched narration / dialogue", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "地「x」",
      entries: [
        entry(
          "e1",
          [atom("x", GlossaryAtomFlags.AllowSingleCharacterMatch)],
          [tag("primary", RAW_TAG_COLOR)]
        )
      ],
      wrapColumns: 80,
      narrationColor: "#3c3c3c",
      dialogueDelimiterPairs: [{ open: "「", close: "」", color: "#909090" }],
      adjustTagColorsForVisibility: false
    });
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    expect(byOffset.get(0)?.color).toBe("#3c3c3c"); // narration
    expect(byOffset.get(1)?.color).toBe("#909090"); // dialogue
    expect(byOffset.get(2)).toMatchObject({ hit: true, color: RAW_TAG_COLOR }); // raw tag
  });

  it("adjusts each distinct tag once even across many entries", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "Foo Bar Foo Bar",
      entries: [
        entry("e1", [atom("Foo")], [tag("a", "#3a7bd5")]),
        entry("e2", [atom("Bar")], [tag("b", "#d53a3a")]),
        entry("e3", [atom("Baz")], [tag("a", "#3a7bd5")])
      ],
      wrapColumns: 80,
      adjustTagColorsForVisibility: true
    });
    expect([...plan.tagColorCache.keys()].sort()).toEqual(["a", "b"]);
    expect(plan.tagColorCache.get("a")).toBe(
      adjustDocumentMapTagColorForVisibility("#3a7bd5")
    );
  });

  it("a Glossary hit still overrides narration and dialogue with the adjusted colour", () => {
    const plan = buildGlossaryTextMapPlan({
      text: "地「Foo」",
      entries: [
        entry(
          "e1",
          [atom("Foo")],
          [tag("primary", RAW_TAG_COLOR)]
        )
      ],
      wrapColumns: 80,
      adjustTagColorsForVisibility: true
    });
    const expected = adjustDocumentMapTagColorForVisibility(RAW_TAG_COLOR);
    const byOffset = new Map(plan.pixels.map((p) => [p.offset, p]));
    // 地(0) 「(1) F(2) o(3) o(4) 」(5)
    expect(byOffset.get(2)).toMatchObject({ hit: true, color: expected });
    expect(byOffset.get(3)?.color).toBe(expected);
  });
});

describe("drawGlossaryTextMap (#375, settings colours, narration -> dialogue -> hit)", () => {
  function fakeContext(): {
    context: GlossaryTextMapDrawContext;
    fills: { fillStyle: string }[];
  } {
    const fills: { fillStyle: string }[] = [];
    const context: GlossaryTextMapDrawContext = {
      fillStyle: "",
      imageSmoothingEnabled: true,
      clearRect() {},
      fillRect() {
        fills.push({ fillStyle: String(this.fillStyle) });
      }
    };
    return { context, fills };
  }

  it("draws narration, then every dialogue colour, then every hit colour", () => {
    // "地『g』n" : g = green-tagged glossary hit; narration #101010; dialogue #abcdef.
    const plan = buildGlossaryTextMapPlan({
      text: "地『g』n",
      entries: [
        entry(
          "e1",
          [atom("g", GlossaryAtomFlags.AllowSingleCharacterMatch)],
          [tag("t", "#00ff00")]
        )
      ],
      wrapColumns: 80,
      narrationColor: "#101010",
      dialogueDelimiterPairs: [{ open: "『", close: "』", color: "#abcdef" }]
    });
    const { context, fills } = fakeContext();
    drawGlossaryTextMap(context, plan);

    const styles = fills.map((f) => f.fillStyle);
    const lastOf = (c: string) => styles.lastIndexOf(c);
    const firstOf = (c: string) => styles.indexOf(c);

    expect(styles.filter((s) => s === "#101010")).toHaveLength(2); // 地, n
    expect(styles.filter((s) => s === "#abcdef")).toHaveLength(2); // 『 』
    expect(styles.filter((s) => s === "#00ff00")).toHaveLength(1); // g

    expect(lastOf("#101010")).toBeLessThan(firstOf("#abcdef"));
    expect(lastOf("#abcdef")).toBeLessThan(firstOf("#00ff00"));
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
