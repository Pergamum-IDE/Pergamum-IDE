import { describe, expect, it } from "vitest";
import {
  calculateUsageTourPlacement,
  USAGE_TOUR_BALLOON_OFFSET,
  USAGE_TOUR_SPOTLIGHT_PADDING,
  USAGE_TOUR_VIEWPORT_MARGIN
} from "../../../src/renderer/usageTour/usageTourPlacement";

describe("calculateUsageTourPlacement", () => {
  const balloonSize = { width: 300, height: 150 };
  const viewport = { width: 1200, height: 800 };

  it("falls back to centered placement without spotlight when target is null", () => {
    const result = calculateUsageTourPlacement(null, balloonSize, viewport, "bottom");

    expect(result.arrowPlacement).toBe("none");
    expect(result.spotlightRect).toBeNull();
    expect(result.balloonPosition.left).toBe(Math.round((1200 - 300) / 2));
    expect(result.balloonPosition.top).toBe(Math.round((800 - 150) / 2));
  });

  it("falls back to centered placement when target has zero dimensions", () => {
    const result = calculateUsageTourPlacement(
      { left: 100, top: 100, width: 0, height: 0 },
      balloonSize,
      viewport,
      "right"
    );

    expect(result.arrowPlacement).toBe("none");
    expect(result.spotlightRect).toBeNull();
  });

  it("calculates spotlight rect with padding around target", () => {
    const target = { left: 100, top: 200, width: 50, height: 40 };
    const result = calculateUsageTourPlacement(target, balloonSize, viewport, "right");

    expect(result.spotlightRect).toEqual({
      left: 100 - USAGE_TOUR_SPOTLIGHT_PADDING,
      top: 200 - USAGE_TOUR_SPOTLIGHT_PADDING,
      width: 50 + USAGE_TOUR_SPOTLIGHT_PADDING * 2,
      height: 40 + USAGE_TOUR_SPOTLIGHT_PADDING * 2
    });
  });

  it("places balloon to the right when preferredPlacement is right and it fits", () => {
    const target = { left: 50, top: 100, width: 40, height: 40 };
    const result = calculateUsageTourPlacement(target, balloonSize, viewport, "right");

    expect(result.arrowPlacement).toBe("left"); // arrow points left toward target
    const expectedLeft =
      target.left +
      target.width +
      USAGE_TOUR_SPOTLIGHT_PADDING +
      USAGE_TOUR_BALLOON_OFFSET;
    expect(result.balloonPosition.left).toBe(expectedLeft);
  });

  it("falls back to the left when preferredPlacement is right but it overflows right viewport", () => {
    // Target is near right edge (left: 1000 in 1200px viewport)
    const target = { left: 1000, top: 100, width: 40, height: 40 };
    const result = calculateUsageTourPlacement(target, balloonSize, viewport, "right");

    expect(result.arrowPlacement).toBe("right"); // arrow points right toward target
    expect(result.balloonPosition.left).toBeLessThan(target.left);
  });

  it("places balloon below when preferredPlacement is bottom and it fits", () => {
    const target = { left: 400, top: 40, width: 200, height: 30 };
    const result = calculateUsageTourPlacement(target, balloonSize, viewport, "bottom");

    expect(result.arrowPlacement).toBe("top"); // arrow points up toward target
    const expectedTop =
      target.top +
      target.height +
      USAGE_TOUR_SPOTLIGHT_PADDING +
      USAGE_TOUR_BALLOON_OFFSET;
    expect(result.balloonPosition.top).toBe(expectedTop);
  });

  it("falls back to above when preferredPlacement is bottom but it overflows bottom viewport", () => {
    // Target is near bottom edge (top: 700 in 800px viewport)
    const target = { left: 400, top: 700, width: 100, height: 30 };
    const result = calculateUsageTourPlacement(target, balloonSize, viewport, "bottom");

    expect(result.arrowPlacement).toBe("bottom"); // arrow points down toward target
    expect(result.balloonPosition.top).toBeLessThan(target.top);
  });

  it("clamps balloon position within viewport margins on small viewport", () => {
    const smallViewport = { width: 400, height: 300 };
    const target = { left: 350, top: 250, width: 40, height: 40 };
    const result = calculateUsageTourPlacement(
      target,
      balloonSize,
      smallViewport,
      "bottom"
    );

    expect(result.balloonPosition.left).toBeGreaterThanOrEqual(
      USAGE_TOUR_VIEWPORT_MARGIN
    );
    expect(result.balloonPosition.left + balloonSize.width).toBeLessThanOrEqual(
      smallViewport.width - USAGE_TOUR_VIEWPORT_MARGIN
    );
    expect(result.balloonPosition.top).toBeGreaterThanOrEqual(
      USAGE_TOUR_VIEWPORT_MARGIN
    );
    expect(result.balloonPosition.top + balloonSize.height).toBeLessThanOrEqual(
      smallViewport.height - USAGE_TOUR_VIEWPORT_MARGIN
    );
  });
});
