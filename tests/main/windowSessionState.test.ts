import { describe, expect, it } from "vitest";
import {
  captureWindowSessionState,
  type WindowSessionSource
} from "../../src/main/windowSessionState";

function fakeWindow(
  overrides: Partial<{
    destroyed: boolean;
    minimized: boolean;
    maximized: boolean;
    fullScreen: boolean;
    normalBounds: { x: number; y: number; width: number; height: number };
  }> = {}
): WindowSessionSource {
  const state = {
    destroyed: false,
    minimized: false,
    maximized: false,
    fullScreen: false,
    normalBounds: { x: 100, y: 120, width: 1024, height: 768 },
    ...overrides
  };

  return {
    isDestroyed: () => state.destroyed,
    isMinimized: () => state.minimized,
    isMaximized: () => state.maximized,
    isFullScreen: () => state.fullScreen,
    getNormalBounds: () => state.normalBounds
  };
}

describe("captureWindowSessionState (#272)", () => {
  it("captures a normal window", () => {
    expect(captureWindowSessionState(fakeWindow())).toEqual({
      normalBounds: { x: 100, y: 120, width: 1024, height: 768 },
      mode: "normal"
    });
  });

  it("captures maximized mode while keeping the normal (restore-down) bounds", () => {
    expect(
      captureWindowSessionState(
        fakeWindow({
          maximized: true,
          normalBounds: { x: 40, y: 50, width: 900, height: 640 }
        })
      )
    ).toEqual({
      normalBounds: { x: 40, y: 50, width: 900, height: 640 },
      mode: "maximized"
    });
  });

  it("captures fullscreen mode (fullscreen wins over maximized)", () => {
    expect(
      captureWindowSessionState(
        fakeWindow({ maximized: true, fullScreen: true })
      )
    ).toMatchObject({ mode: "fullscreen" });
  });

  it("never persists minimized as a mode — reports normal with the normal bounds", () => {
    expect(
      captureWindowSessionState(
        fakeWindow({
          minimized: true,
          normalBounds: { x: 10, y: 10, width: 800, height: 600 }
        })
      )
    ).toEqual({
      normalBounds: { x: 10, y: 10, width: 800, height: 600 },
      mode: "normal"
    });
  });

  it("returns null for a destroyed / missing window", () => {
    expect(captureWindowSessionState(fakeWindow({ destroyed: true }))).toBeNull();
    expect(captureWindowSessionState(null)).toBeNull();
    expect(captureWindowSessionState(undefined)).toBeNull();
  });

  it("returns null when the bounds are unusable", () => {
    expect(
      captureWindowSessionState(
        fakeWindow({ normalBounds: { x: 0, y: 0, width: 0, height: 600 } })
      )
    ).toBeNull();
  });

  it("rounds fractional bounds to integers", () => {
    expect(
      captureWindowSessionState(
        fakeWindow({
          normalBounds: { x: 10.6, y: 20.2, width: 800.7, height: 600.4 }
        })
      )
    ).toEqual({
      normalBounds: { x: 11, y: 20, width: 801, height: 600 },
      mode: "normal"
    });
  });
});
