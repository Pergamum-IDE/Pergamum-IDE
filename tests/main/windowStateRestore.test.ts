import { describe, expect, it, vi } from "vitest";
import {
  applyWindowSessionMode,
  resolveWindowPlacement,
  type DisplayWorkAreaLike
} from "../../src/main/windowStateRestore";
import type { WindowSessionState } from "../../src/shared/session";

const primary: DisplayWorkAreaLike = {
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};
const secondary: DisplayWorkAreaLike = {
  workArea: { x: 1920, y: 0, width: 1280, height: 1000 }
};

function saved(
  overrides: Partial<WindowSessionState["normalBounds"]> = {},
  mode: WindowSessionState["mode"] = "normal"
): WindowSessionState {
  return {
    normalBounds: { x: 200, y: 150, width: 1000, height: 700, ...overrides },
    mode
  };
}

describe("resolveWindowPlacement (#274)", () => {
  it("no saved state → built-in defaults, normal mode", () => {
    expect(resolveWindowPlacement(null, [primary])).toEqual({
      bounds: null,
      mode: "normal"
    });
  });

  it("on-screen bounds are used verbatim", () => {
    expect(resolveWindowPlacement(saved(), [primary])).toEqual({
      bounds: { x: 200, y: 150, width: 1000, height: 700 },
      mode: "normal"
    });
  });

  it("carries the saved mode (maximized / fullscreen)", () => {
    expect(resolveWindowPlacement(saved({}, "maximized"), [primary]).mode).toBe(
      "maximized"
    );
    expect(
      resolveWindowPlacement(saved({}, "fullscreen"), [primary]).mode
    ).toBe("fullscreen");
  });

  it("off-screen coordinates fall back onto a safe display, preserving size", () => {
    const placement = resolveWindowPlacement(
      saved({ x: -5000, y: -5000, width: 1000, height: 700 }),
      [primary, secondary]
    );

    expect(placement.bounds).not.toBeNull();
    expect(placement.bounds!.width).toBe(1000);
    expect(placement.bounds!.height).toBe(700);
    // Landed within some display's work area.
    const b = placement.bounds!;
    const onPrimary =
      b.x >= 0 && b.x + b.width <= 1920 && b.y >= 0 && b.y + b.height <= 1040;
    const onSecondary =
      b.x >= 1920 &&
      b.x + b.width <= 3200 &&
      b.y >= 0 &&
      b.y + b.height <= 1000;
    expect(onPrimary || onSecondary).toBe(true);
  });

  it("clamps width / height to the work area only when they exceed it", () => {
    const placement = resolveWindowPlacement(
      saved({ x: -5000, y: -5000, width: 4000, height: 3000 }),
      [primary]
    );

    expect(placement.bounds!.width).toBeLessThanOrEqual(1920);
    expect(placement.bounds!.height).toBeLessThanOrEqual(1040);
  });

  it("does not depend on nth-display identity (geometry match only)", () => {
    // The same saved bounds resolve to the same placement regardless of the
    // order displays are listed in.
    const a = resolveWindowPlacement(saved({ x: 2000, y: 100 }), [
      primary,
      secondary
    ]);
    const b = resolveWindowPlacement(saved({ x: 2000, y: 100 }), [
      secondary,
      primary
    ]);
    expect(a).toEqual(b);
  });

  it("with no display topology, trusts the saved bounds", () => {
    expect(resolveWindowPlacement(saved({ x: -9000 }), [])).toEqual({
      bounds: { x: -9000, y: 150, width: 1000, height: 700 },
      mode: "normal"
    });
  });
});

describe("applyWindowSessionMode (#274)", () => {
  it("maximizes for `maximized`", () => {
    const win = { maximize: vi.fn(), setFullScreen: vi.fn() };
    applyWindowSessionMode(win, "maximized");
    expect(win.maximize).toHaveBeenCalledOnce();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  it("goes fullscreen for `fullscreen`", () => {
    const win = { maximize: vi.fn(), setFullScreen: vi.fn() };
    applyWindowSessionMode(win, "fullscreen");
    expect(win.setFullScreen).toHaveBeenCalledWith(true);
  });

  it("`normal` is a no-op (minimized is never a mode)", () => {
    const win = { maximize: vi.fn(), setFullScreen: vi.fn() };
    applyWindowSessionMode(win, "normal");
    expect(win.maximize).not.toHaveBeenCalled();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });
});
