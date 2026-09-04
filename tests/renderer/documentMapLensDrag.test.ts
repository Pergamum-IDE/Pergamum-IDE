import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAP_LENS_DRAG_IDLE,
  DOCUMENT_MAP_LENS_DRAG_THRESHOLD_PX,
  advanceDocumentMapLensDrag,
  beginDocumentMapLensDrag,
  clampDocumentMapLensY,
  endDocumentMapLensDrag,
  hitTestViewportLens,
  resolveDocumentMapLensDragTarget,
  resolveDocumentMapPoint,
  shouldRequestDocumentMapLensDragScroll,
  type DocumentMapLensDragState
} from "../../src/renderer/documentMapLensDrag";
import { resolveDocumentMapVisualRowToLineIndex } from "../../src/renderer/glossaryDocumentMap";

const rect = { x: 0, y: 10, width: 40, height: 20 }; // y in [10, 30]

describe("hitTestViewportLens (#375, Phase 1)", () => {
  it("is true for a point inside the rect", () => {
    expect(hitTestViewportLens({ mapX: 20, mapY: 20, rect })).toBe(true);
  });

  it("is true on the boundary (edges included)", () => {
    for (const p of [
      { mapX: 0, mapY: 10 },
      { mapX: 40, mapY: 10 },
      { mapX: 0, mapY: 30 },
      { mapX: 40, mapY: 30 },
      { mapX: 20, mapY: 10 },
      { mapX: 20, mapY: 30 }
    ]) {
      expect(hitTestViewportLens({ ...p, rect })).toBe(true);
    }
  });

  it("is false for a point outside the rect", () => {
    for (const p of [
      { mapX: 20, mapY: 9 },
      { mapX: 20, mapY: 31 },
      { mapX: -1, mapY: 20 },
      { mapX: 41, mapY: 20 }
    ]) {
      expect(hitTestViewportLens({ ...p, rect })).toBe(false);
    }
  });

  it("is false for a rect with zero / negative width or height", () => {
    expect(
      hitTestViewportLens({ mapX: 0, mapY: 10, rect: { ...rect, width: 0 } })
    ).toBe(false);
    expect(
      hitTestViewportLens({ mapX: 0, mapY: 10, rect: { ...rect, height: 0 } })
    ).toBe(false);
    expect(
      hitTestViewportLens({ mapX: 0, mapY: 10, rect: { ...rect, width: -5 } })
    ).toBe(false);
    expect(
      hitTestViewportLens({ mapX: 0, mapY: 10, rect: { ...rect, height: -5 } })
    ).toBe(false);
  });

  it("is false for a NaN / Infinity point or rect field", () => {
    expect(hitTestViewportLens({ mapX: Number.NaN, mapY: 20, rect })).toBe(
      false
    );
    expect(
      hitTestViewportLens({ mapX: 20, mapY: Number.POSITIVE_INFINITY, rect })
    ).toBe(false);
    expect(
      hitTestViewportLens({
        mapX: 20,
        mapY: 20,
        rect: { ...rect, y: Number.NaN }
      })
    ).toBe(false);
    expect(
      hitTestViewportLens({
        mapX: 20,
        mapY: 20,
        rect: { ...rect, height: Number.POSITIVE_INFINITY }
      })
    ).toBe(false);
  });
});

describe("beginDocumentMapLensDrag (#375, Phase 1)", () => {
  it("creates a candidate carrying the pointer id, start client coords and grabOffsetY", () => {
    const state = beginDocumentMapLensDrag({
      pointerId: 7,
      clientX: 100,
      clientY: 220,
      mapY: 18,
      lensRectY: 10
    });
    expect(state).toEqual({
      kind: "candidate",
      pointerId: 7,
      startClientX: 100,
      startClientY: 220,
      startMapY: 18,
      // grabOffsetY = mapY - lensRectY
      grabOffsetY: 8
    });
  });
});

describe("advanceDocumentMapLensDrag (#375, Phase 1)", () => {
  const candidate = beginDocumentMapLensDrag({
    pointerId: 1,
    clientX: 50,
    clientY: 50,
    mapY: 15,
    lensRectY: 10
  });

  it("stays a candidate for a move below the threshold", () => {
    const next = advanceDocumentMapLensDrag(candidate, {
      pointerId: 1,
      clientX: 52,
      clientY: 51
    });
    expect(next.kind).toBe("candidate");
    expect(next).toBe(candidate); // unchanged reference
  });

  it("promotes to dragging once the move reaches the threshold (X or Y)", () => {
    const byY = advanceDocumentMapLensDrag(candidate, {
      pointerId: 1,
      clientX: 50,
      clientY: 50 + DOCUMENT_MAP_LENS_DRAG_THRESHOLD_PX
    });
    expect(byY.kind).toBe("dragging");

    const byX = advanceDocumentMapLensDrag(candidate, {
      pointerId: 1,
      clientX: 50 - DOCUMENT_MAP_LENS_DRAG_THRESHOLD_PX,
      clientY: 50
    });
    expect(byX.kind).toBe("dragging");
  });

  it("keeps the pointer / start data when it promotes", () => {
    const dragging = advanceDocumentMapLensDrag(candidate, {
      pointerId: 1,
      clientX: 50,
      clientY: 80
    });
    expect(dragging).toMatchObject({
      kind: "dragging",
      pointerId: 1,
      startClientX: 50,
      startClientY: 50,
      startMapY: 15,
      grabOffsetY: 5
    });
  });

  it("stays dragging on further moves", () => {
    const dragging = advanceDocumentMapLensDrag(candidate, {
      pointerId: 1,
      clientX: 50,
      clientY: 80
    });
    const again = advanceDocumentMapLensDrag(dragging, {
      pointerId: 1,
      clientX: 50,
      clientY: 200
    });
    expect(again.kind).toBe("dragging");
    expect(again).toBe(dragging); // unchanged reference
  });

  it("ignores a move from a different pointer id", () => {
    expect(
      advanceDocumentMapLensDrag(candidate, {
        pointerId: 999,
        clientX: 50,
        clientY: 999
      })
    ).toBe(candidate);
  });

  it("is a no-op on the idle state", () => {
    expect(
      advanceDocumentMapLensDrag(DOCUMENT_MAP_LENS_DRAG_IDLE, {
        pointerId: 1,
        clientX: 999,
        clientY: 999
      })
    ).toBe(DOCUMENT_MAP_LENS_DRAG_IDLE);
  });

  it("honours a custom threshold", () => {
    const next = advanceDocumentMapLensDrag(
      candidate,
      { pointerId: 1, clientX: 50, clientY: 60 },
      20
    );
    expect(next.kind).toBe("candidate");
    const past = advanceDocumentMapLensDrag(
      candidate,
      { pointerId: 1, clientX: 50, clientY: 71 },
      20
    );
    expect(past.kind).toBe("dragging");
  });
});

describe("endDocumentMapLensDrag (#375, Phase 1 / Phase 3)", () => {
  const candidate = beginDocumentMapLensDrag({
    pointerId: 4,
    clientX: 0,
    clientY: 0,
    mapY: 12,
    lensRectY: 10
  });
  const dragging: DocumentMapLensDragState = advanceDocumentMapLensDrag(
    candidate,
    { pointerId: 4, clientX: 0, clientY: 40 }
  );

  it("returns idle and suppresses the click when a real drag ends", () => {
    const result = endDocumentMapLensDrag(dragging, 4);
    expect(result.state).toEqual({ kind: "idle" });
    expect(result.suppressClick).toBe(true);
  });

  it("also suppresses the click when a sub-threshold candidate ends — the lens is a grab handle, not a jump target (Phase 3)", () => {
    const result = endDocumentMapLensDrag(candidate, 4);
    expect(result.state).toEqual({ kind: "idle" });
    expect(result.suppressClick).toBe(true);
  });

  it("leaves an unrelated pointer id untouched and does not suppress", () => {
    const result = endDocumentMapLensDrag(dragging, 999);
    expect(result.state).toBe(dragging);
    expect(result.suppressClick).toBe(false);
  });

  it("is a harmless no-op on the idle state", () => {
    const result = endDocumentMapLensDrag(DOCUMENT_MAP_LENS_DRAG_IDLE, 1);
    expect(result.state).toBe(DOCUMENT_MAP_LENS_DRAG_IDLE);
    expect(result.suppressClick).toBe(false);
  });
});

describe("shouldRequestDocumentMapLensDragScroll (#375, Phase 3)", () => {
  it("requests a scroll for a resolved line that differs from the last one", () => {
    expect(shouldRequestDocumentMapLensDragScroll(7, null)).toBe(true);
    expect(shouldRequestDocumentMapLensDragScroll(7, 6)).toBe(true);
    expect(shouldRequestDocumentMapLensDragScroll(0, null)).toBe(true);
  });

  it("does NOT request a repeat scroll for the same line (dedupe)", () => {
    expect(shouldRequestDocumentMapLensDragScroll(7, 7)).toBe(false);
    expect(shouldRequestDocumentMapLensDragScroll(0, 0)).toBe(false);
  });

  it("does NOT request a scroll for an unresolved line", () => {
    expect(shouldRequestDocumentMapLensDragScroll(null, null)).toBe(false);
    expect(shouldRequestDocumentMapLensDragScroll(null, 3)).toBe(false);
  });
});

describe("resolveDocumentMapLensDragTarget (#375, Phase 2)", () => {
  const base = {
    grabOffsetY: 10,
    lensHeight: 20,
    mapHeight: 1000,
    cellSize: 2
  };

  it("computes nextLensY = pointerMapY - grabOffsetY and floors the visual row", () => {
    expect(
      resolveDocumentMapLensDragTarget({ ...base, pointerMapY: 100 })
    ).toEqual({ nextLensY: 90, targetVisualRow: 45 });
  });

  it("keeps the grabbed spot: a negative grabOffsetY pushes the lens down", () => {
    expect(
      resolveDocumentMapLensDragTarget({
        ...base,
        grabOffsetY: -10,
        pointerMapY: 50
      })
    ).toEqual({ nextLensY: 60, targetVisualRow: 30 });
  });

  it("clamps nextLensY to 0 when the pointer drags above the map top", () => {
    expect(
      resolveDocumentMapLensDragTarget({
        ...base,
        grabOffsetY: 40,
        pointerMapY: 5
      })
    ).toEqual({ nextLensY: 0, targetVisualRow: 0 });
  });

  it("clamps nextLensY to maxLensY = mapHeight - lensHeight at the bottom", () => {
    expect(
      resolveDocumentMapLensDragTarget({
        ...base,
        grabOffsetY: 0,
        lensHeight: 20,
        mapHeight: 200,
        pointerMapY: 5000
      })
    ).toEqual({ nextLensY: 180, targetVisualRow: 90 });
  });

  it("does not crash when the lens is taller than the map — maxLensY floors at 0", () => {
    expect(
      resolveDocumentMapLensDragTarget({
        ...base,
        grabOffsetY: 0,
        lensHeight: 500,
        mapHeight: 200,
        pointerMapY: 120
      })
    ).toEqual({ nextLensY: 0, targetVisualRow: 0 });
  });

  it("uses the supplied cellSize, not a literal", () => {
    const two = resolveDocumentMapLensDragTarget({
      ...base,
      cellSize: 2,
      pointerMapY: 40
    });
    const four = resolveDocumentMapLensDragTarget({
      ...base,
      cellSize: 4,
      pointerMapY: 40
    });
    // nextLensY is 30 in both; the row halves when the cell doubles.
    expect(two).toEqual({ nextLensY: 30, targetVisualRow: 15 });
    expect(four).toEqual({ nextLensY: 30, targetVisualRow: 7 });
  });

  it("is null for a non-finite pointer / offset / dimension", () => {
    for (const bad of [
      { ...base, pointerMapY: Number.NaN },
      { ...base, pointerMapY: 10, grabOffsetY: Number.POSITIVE_INFINITY },
      { ...base, pointerMapY: 10, lensHeight: Number.NaN },
      { ...base, pointerMapY: 10, mapHeight: Number.POSITIVE_INFINITY },
      { ...base, pointerMapY: 10, cellSize: Number.NaN }
    ]) {
      expect(resolveDocumentMapLensDragTarget(bad)).toBeNull();
    }
  });

  it("is null when the layout is not ready (mapHeight <= 0) or cellSize <= 0", () => {
    expect(
      resolveDocumentMapLensDragTarget({ ...base, pointerMapY: 10, mapHeight: 0 })
    ).toBeNull();
    expect(
      resolveDocumentMapLensDragTarget({
        ...base,
        pointerMapY: 10,
        mapHeight: -5
      })
    ).toBeNull();
    expect(
      resolveDocumentMapLensDragTarget({ ...base, pointerMapY: 10, cellSize: 0 })
    ).toBeNull();
  });

  it("feeds a visual row that resolves to a source document line", () => {
    // 3 source lines, no wrapping: rows 0, 1, 2.
    const lines = [
      { lineIndex: 0, startOffset: 0, length: 4, visualRowCount: 1, baseVisualRow: 0 },
      { lineIndex: 1, startOffset: 5, length: 4, visualRowCount: 1, baseVisualRow: 1 },
      { lineIndex: 2, startOffset: 10, length: 4, visualRowCount: 1, baseVisualRow: 2 }
    ];
    const target = resolveDocumentMapLensDragTarget({
      grabOffsetY: 0,
      lensHeight: 2,
      mapHeight: 6,
      cellSize: 2,
      pointerMapY: 3
    });
    expect(target).toEqual({ nextLensY: 3, targetVisualRow: 1 });
    expect(
      resolveDocumentMapVisualRowToLineIndex(target!.targetVisualRow, lines)
    ).toBe(1);
  });

  it("a bottom-clamped drag still resolves (row past the last line clamps to it)", () => {
    const lines = [
      { lineIndex: 0, startOffset: 0, length: 4, visualRowCount: 1, baseVisualRow: 0 },
      { lineIndex: 1, startOffset: 5, length: 4, visualRowCount: 1, baseVisualRow: 1 }
    ];
    const target = resolveDocumentMapLensDragTarget({
      grabOffsetY: 0,
      lensHeight: 2,
      mapHeight: 4,
      cellSize: 2,
      pointerMapY: 9999
    });
    expect(target).toEqual({ nextLensY: 2, targetVisualRow: 1 });
    expect(
      resolveDocumentMapVisualRowToLineIndex(target!.targetVisualRow, lines)
    ).toBe(1);
  });
});

describe("clampDocumentMapLensY (#375, Phase 4)", () => {
  it("passes an in-range lens Y through unchanged", () => {
    expect(
      clampDocumentMapLensY({ lensY: 40, lensHeight: 20, mapHeight: 200 })
    ).toBe(40);
  });

  it("clamps a negative lens Y to the top (0)", () => {
    expect(
      clampDocumentMapLensY({ lensY: -30, lensHeight: 20, mapHeight: 200 })
    ).toBe(0);
  });

  it("clamps past the bottom to maxLensY = mapHeight - lensHeight", () => {
    expect(
      clampDocumentMapLensY({ lensY: 5000, lensHeight: 20, mapHeight: 200 })
    ).toBe(180);
    // exact boundary
    expect(
      clampDocumentMapLensY({ lensY: 180, lensHeight: 20, mapHeight: 200 })
    ).toBe(180);
  });

  it("pins to the top when the lens is at or taller than the map", () => {
    expect(
      clampDocumentMapLensY({ lensY: 50, lensHeight: 200, mapHeight: 200 })
    ).toBe(0);
    expect(
      clampDocumentMapLensY({ lensY: 50, lensHeight: 999, mapHeight: 200 })
    ).toBe(0);
  });

  it("returns 0 for a non-positive or non-finite mapHeight", () => {
    expect(
      clampDocumentMapLensY({ lensY: 40, lensHeight: 20, mapHeight: 0 })
    ).toBe(0);
    expect(
      clampDocumentMapLensY({ lensY: 40, lensHeight: 20, mapHeight: -10 })
    ).toBe(0);
    expect(
      clampDocumentMapLensY({
        lensY: 40,
        lensHeight: 20,
        mapHeight: Number.NaN
      })
    ).toBe(0);
  });

  it("returns 0 for a non-finite lens Y and never throws", () => {
    expect(
      clampDocumentMapLensY({
        lensY: Number.NaN,
        lensHeight: 20,
        mapHeight: 200
      })
    ).toBe(0);
    expect(
      clampDocumentMapLensY({
        lensY: Number.POSITIVE_INFINITY,
        lensHeight: 20,
        mapHeight: 200
      })
    ).toBe(0);
  });

  it("treats a non-finite / non-positive lensHeight as 0 (max becomes mapHeight)", () => {
    expect(
      clampDocumentMapLensY({
        lensY: 500,
        lensHeight: Number.NaN,
        mapHeight: 200
      })
    ).toBe(200);
    expect(
      clampDocumentMapLensY({ lensY: 500, lensHeight: -5, mapHeight: 200 })
    ).toBe(200);
  });
});

describe("resolveDocumentMapPoint (#375, Phase 4)", () => {
  it("subtracts the host origin from the client point", () => {
    expect(
      resolveDocumentMapPoint({
        clientX: 120,
        clientY: 80,
        hostRect: { left: 20, top: 10 }
      })
    ).toEqual({ mapX: 100, mapY: 70 });
  });

  it("handles a scrolled-up host (negative rect top) — getBoundingClientRect already folds in scrollTop", () => {
    expect(
      resolveDocumentMapPoint({
        clientX: 50,
        clientY: 30,
        hostRect: { left: 0, top: -400 }
      })
    ).toEqual({ mapX: 50, mapY: 430 });
  });

  it("accepts a zero-origin rect (valid — host flush against the viewport)", () => {
    expect(
      resolveDocumentMapPoint({
        clientX: 7,
        clientY: 13,
        hostRect: { left: 0, top: 0 }
      })
    ).toEqual({ mapX: 7, mapY: 13 });
  });

  it("returns null (never throws) for a non-finite client point or host origin", () => {
    expect(
      resolveDocumentMapPoint({
        clientX: Number.NaN,
        clientY: 10,
        hostRect: { left: 0, top: 0 }
      })
    ).toBeNull();
    expect(
      resolveDocumentMapPoint({
        clientX: 10,
        clientY: Number.POSITIVE_INFINITY,
        hostRect: { left: 0, top: 0 }
      })
    ).toBeNull();
    expect(
      resolveDocumentMapPoint({
        clientX: 10,
        clientY: 10,
        hostRect: { left: Number.NaN, top: 0 }
      })
    ).toBeNull();
  });
});

describe("lens drag top / bottom edge → source line (#375, Phase 5)", () => {
  // 10 source lines, no wrapping: visual rows 0..9, cellSize 2, mapHeight 20.
  const lines = Array.from({ length: 10 }, (_, i) => ({
    lineIndex: i,
    startOffset: i * 3,
    length: 2,
    visualRowCount: 1,
    baseVisualRow: i
  }));
  const cellSize = 2;
  const mapHeight = 20;
  // A lens covering ~3 visible rows.
  const lensHeight = 6;

  it("clamps a drag above the top to lensY 0 → visual row 0 → the first source line", () => {
    const target = resolveDocumentMapLensDragTarget({
      pointerMapY: -50,
      grabOffsetY: 0,
      lensHeight,
      mapHeight,
      cellSize
    });
    expect(target).toEqual({ nextLensY: 0, targetVisualRow: 0 });
    expect(
      resolveDocumentMapVisualRowToLineIndex(target!.targetVisualRow, lines)
    ).toBe(0);
  });

  it("clamps a drag past the bottom to lensY = maxLensY and resolves near the last line", () => {
    const maxLensY = Math.max(0, mapHeight - lensHeight); // 14
    const target = resolveDocumentMapLensDragTarget({
      pointerMapY: 100_000,
      grabOffsetY: 0,
      lensHeight,
      mapHeight,
      cellSize
    });
    expect(target).toEqual({
      nextLensY: maxLensY,
      targetVisualRow: maxLensY / cellSize // 7
    });
    // row 7 → line 7; the last three rows (7,8,9) stay on-screen below it.
    expect(
      resolveDocumentMapVisualRowToLineIndex(target!.targetVisualRow, lines)
    ).toBe(7);
  });

  it("a lens taller than the map pins to the top (maxLensY = 0) → first line, no throw", () => {
    const target = resolveDocumentMapLensDragTarget({
      pointerMapY: 12,
      grabOffsetY: 0,
      lensHeight: 999,
      mapHeight,
      cellSize
    });
    expect(target).toEqual({ nextLensY: 0, targetVisualRow: 0 });
    expect(
      resolveDocumentMapVisualRowToLineIndex(target!.targetVisualRow, lines)
    ).toBe(0);
  });

  it("is a no-op (null) for an unprepared layout — mapHeight 0 / cellSize 0", () => {
    expect(
      resolveDocumentMapLensDragTarget({
        pointerMapY: 5,
        grabOffsetY: 0,
        lensHeight,
        mapHeight: 0,
        cellSize
      })
    ).toBeNull();
    expect(
      resolveDocumentMapLensDragTarget({
        pointerMapY: 5,
        grabOffsetY: 0,
        lensHeight,
        mapHeight,
        cellSize: 0
      })
    ).toBeNull();
  });
});
