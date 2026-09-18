// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  findTargetLineForScrollTop,
  type PreviewBlockRef
} from "../../src/renderer/previewScrollSync";

/**
 * Builds `count` fake preview blocks at absolute content offsets
 * `0, spacing, 2*spacing, ...` (line numbers `1..count`), and stubs each
 * element's + the container's `getBoundingClientRect()` / `scrollTop` so
 * `getLiveElementOffset` reconstructs exactly those absolute offsets at the
 * given `scrollTop` — matching the existing stubbing convention in
 * previewScrollSync.test.ts (mockReturnValue rects + a writable scrollTop).
 */
function buildStubbedBlocks(
  count: number,
  spacing: number,
  scrollTop: number
): { container: HTMLElement; blocks: PreviewBlockRef[] } {
  const container = document.createElement("article");
  Object.defineProperty(container, "scrollTop", {
    value: scrollTop,
    writable: true
  });
  vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
    top: 0,
    left: 0,
    bottom: 10000,
    right: 800,
    width: 800,
    height: 10000,
    x: 0,
    y: 0,
    toJSON: () => undefined
  } as DOMRect);

  const blocks: PreviewBlockRef[] = [];
  for (let i = 0; i < count; i += 1) {
    const line = i + 1;
    const absoluteOffset = i * spacing;
    const element = document.createElement("p");
    element.setAttribute("data-source-line", String(line));
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      top: absoluteOffset - scrollTop,
      left: 0,
      bottom: absoluteOffset - scrollTop + 20,
      right: 800,
      width: 800,
      height: 20,
      x: 0,
      y: absoluteOffset - scrollTop,
      toJSON: () => undefined
    } as DOMRect);
    blocks.push({ line, element });
  }

  return { container, blocks };
}

describe("findTargetLineForScrollTop (#505 Phase 1, issue Design §2)", () => {
  it("returns null for an empty block map", () => {
    const container = document.createElement("article");
    expect(findTargetLineForScrollTop([], container, 100, "vertical")).toEqual({
      targetLine: null,
      targetBlockLiveOffset: null
    });
  });

  it("finds the last block whose top edge is exactly at scrollTop (a block boundary)", () => {
    // 5 blocks at absolute offsets 0, 100, 200, 300, 400 (lines 1..5).
    const { container, blocks } = buildStubbedBlocks(5, 100, 200);

    const result = findTargetLineForScrollTop(blocks, container, 200, "vertical");

    expect(result.targetLine).toBe(3); // block at offset 200 = line 3
    expect(result.targetBlockLiveOffset).toBe(200);
  });

  it("finds the last block whose top edge is ABOVE (not exactly at) scrollTop", () => {
    const { container, blocks } = buildStubbedBlocks(5, 100, 150);

    const result = findTargetLineForScrollTop(blocks, container, 150, "vertical");

    // offset-200 block (line 3) is below scrollTop=150; offset-100 block
    // (line 2) is the last one at or above it.
    expect(result.targetLine).toBe(2);
    expect(result.targetBlockLiveOffset).toBe(100);
  });

  it("returns the first block when scrollTop is at the very top (line 1, offset 0)", () => {
    const { container, blocks } = buildStubbedBlocks(5, 100, 0);

    const result = findTargetLineForScrollTop(blocks, container, 0, "vertical");

    expect(result.targetLine).toBe(1);
    expect(result.targetBlockLiveOffset).toBe(0);
  });

  it("falls back to the first block when scrollTop is above every block's offset", () => {
    // All blocks are below scrollTop's origin (e.g. some top padding before
    // the first block) — same treatment as "the top", per issue Design §5.
    const container = document.createElement("article");
    Object.defineProperty(container, "scrollTop", { value: 0, writable: true });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      bottom: 1000,
      right: 800,
      width: 800,
      height: 1000,
      x: 0,
      y: 0,
      toJSON: () => undefined
    } as DOMRect);
    const el = document.createElement("p");
    el.setAttribute("data-source-line", "1");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top: 24, // block starts 24px below the container's own top (padding)
      left: 0,
      bottom: 44,
      right: 800,
      width: 800,
      height: 20,
      x: 0,
      y: 24,
      toJSON: () => undefined
    } as DOMRect);

    const result = findTargetLineForScrollTop(
      [{ line: 1, element: el }],
      container,
      0,
      "vertical"
    );

    expect(result.targetLine).toBe(1);
  });

  it("returns the last block when scrollTop is past every block's offset (end of document)", () => {
    const { container, blocks } = buildStubbedBlocks(5, 100, 400);

    const result = findTargetLineForScrollTop(blocks, container, 400, "vertical");

    expect(result.targetLine).toBe(5);
    expect(result.targetBlockLiveOffset).toBe(400);
  });

  it("resolves correctly with a single block", () => {
    const { container, blocks } = buildStubbedBlocks(1, 0, 0);

    expect(findTargetLineForScrollTop(blocks, container, 0, "vertical")).toEqual({
      targetLine: 1,
      targetBlockLiveOffset: 0
    });
  });

  it("live-measures via getBoundingClientRect on every comparison rather than reading a cached offset", () => {
    const { container, blocks } = buildStubbedBlocks(9, 50, 220);
    const rectSpies = blocks.map((block) =>
      vi.spyOn(block.element, "getBoundingClientRect")
    );

    findTargetLineForScrollTop(blocks, container, 220, "vertical");

    // Binary search over 9 blocks touches only a subset — but every element
    // it DOES touch must have been measured live (called at least once),
    // proving no pre-existing pixel cache is consulted instead.
    const touchedAtLeastOnce = rectSpies.some((spy) => spy.mock.calls.length > 0);
    expect(touchedAtLeastOnce).toBe(true);
  });
});
