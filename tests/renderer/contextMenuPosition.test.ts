import { describe, expect, it } from "vitest";
import { clampContextMenuPosition } from "../../src/renderer/contextMenuPosition";

describe("clampContextMenuPosition (#629)", () => {
  it("keeps the click position when the menu fits comfortably inside the viewport", () => {
    const pos = clampContextMenuPosition({
      clickX: 100,
      clickY: 150,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    expect(pos).toEqual({ x: 100, y: 150 });
  });

  it("adjusts X to the left when opening near the right edge of the viewport", () => {
    const pos = clampContextMenuPosition({
      clickX: 950,
      clickY: 100,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    // maxX = 1000 - 160 - 8 = 832
    expect(pos).toEqual({ x: 832, y: 100 });
  });

  it("adjusts Y upwards when opening near the bottom edge of the viewport", () => {
    const pos = clampContextMenuPosition({
      clickX: 100,
      clickY: 750,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    // maxY = 800 - 200 - 8 = 592
    expect(pos).toEqual({ x: 100, y: 592 });
  });

  it("clamps both X and Y when opening near the bottom-right corner", () => {
    const pos = clampContextMenuPosition({
      clickX: 980,
      clickY: 790,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    expect(pos).toEqual({ x: 832, y: 592 });
  });

  it("never returns coordinates less than the margin", () => {
    const pos = clampContextMenuPosition({
      clickX: 0,
      clickY: 0,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    expect(pos).toEqual({ x: 8, y: 8 });
  });

  it("does not produce negative coordinates even if the menu is taller/wider than the viewport", () => {
    const pos = clampContextMenuPosition({
      clickX: 500,
      clickY: 500,
      menuWidth: 1200,
      menuHeight: 900,
      viewportWidth: 1000,
      viewportHeight: 800
    });

    expect(pos.x).toBeGreaterThanOrEqual(8);
    expect(pos.y).toBeGreaterThanOrEqual(8);
    expect(pos).toEqual({ x: 8, y: 8 });
  });

  it("honors custom margin when provided", () => {
    const pos = clampContextMenuPosition({
      clickX: 950,
      clickY: 750,
      menuWidth: 160,
      menuHeight: 200,
      viewportWidth: 1000,
      viewportHeight: 800,
      margin: 16
    });

    // maxX = 1000 - 160 - 16 = 824
    // maxY = 800 - 200 - 16 = 584
    expect(pos).toEqual({ x: 824, y: 584 });
  });
});
