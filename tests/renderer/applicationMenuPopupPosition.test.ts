import { describe, expect, it } from "vitest";
import {
  computeSubmenuPopupPosition,
  computeTopLevelPopupPosition
} from "../../src/renderer/applicationMenuPopupPosition";

const viewport = { width: 1000, height: 700 };

describe("application menu popup position (#663)", () => {
  it("places a top-level popup right below its trigger", () => {
    expect(
      computeTopLevelPopupPosition({
        trigger: { left: 40, top: 0, right: 80, bottom: 28 },
        popup: { width: 220, height: 300 },
        viewport
      })
    ).toEqual({ x: 40, y: 28 });
  });

  it("shifts a top-level popup left at the right edge of the viewport", () => {
    const position = computeTopLevelPopupPosition({
      trigger: { left: 950, top: 0, right: 990, bottom: 28 },
      popup: { width: 220, height: 300 },
      viewport
    });

    expect(position.x + 220).toBeLessThanOrEqual(viewport.width);
    expect(position.x).toBeLessThan(950);
  });

  it("clamps a tall popup into the viewport vertically", () => {
    const position = computeTopLevelPopupPosition({
      trigger: { left: 40, top: 0, right: 80, bottom: 28 },
      popup: { width: 220, height: 690 },
      viewport
    });

    expect(position.y + 690).toBeLessThanOrEqual(viewport.height);
  });

  it("opens a submenu to the right of its parent popup", () => {
    expect(
      computeSubmenuPopupPosition({
        parentPopup: { left: 40, top: 28, right: 260, bottom: 328 },
        item: { left: 44, top: 100, right: 256, bottom: 126 },
        popup: { width: 200, height: 60 },
        viewport
      })
    ).toEqual({ x: 260, y: 95 });
  });

  it("flips a submenu to the left when the right side does not fit", () => {
    const position = computeSubmenuPopupPosition({
      parentPopup: { left: 780, top: 28, right: 990, bottom: 328 },
      item: { left: 784, top: 100, right: 986, bottom: 126 },
      popup: { width: 200, height: 60 },
      viewport
    });

    expect(position.x).toBe(580);
  });

  it("clamps a submenu vertically near the bottom edge", () => {
    const position = computeSubmenuPopupPosition({
      parentPopup: { left: 40, top: 28, right: 260, bottom: 690 },
      item: { left: 44, top: 660, right: 256, bottom: 686 },
      popup: { width: 200, height: 120 },
      viewport
    });

    expect(position.y + 120).toBeLessThanOrEqual(viewport.height);
  });
});
