import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #274 BLOCKER 4 (revised by #659): the saved maximize / fullscreen Window
 * mode used to be applied before the renderer load. Electron's `maximize()`
 * / `setFullScreen()` SHOW a hidden window, so with the #659 hidden startup
 * that put a normal-sized unthemed frame on screen. The mode is now applied
 * by `startupWindowReveal` immediately before `show()`, never while the
 * window is hidden.
 *
 * `resolveWindowPlacement` / `applyWindowSessionMode` for the three modes
 * are unit-tested in `windowStateRestore.test.ts`; this guards the wiring.
 */
describe("cold-start Window mode wiring (#274 / #659)", () => {
  const main = readFileSync("src/main/main.ts", "utf8");

  it("never applies the Window mode while the window is hidden", () => {
    expect(main).not.toMatch(/applyWindowSessionMode\w*\(/);
    expect(main).not.toMatch(/\.maximize\(/);
    expect(main).not.toMatch(/\.setFullScreen\(true\)/);
    expect(main).toContain("startupWindowReveal.track(startingWindow, placement.mode)");
  });

  it("only the initial cold-start window gets saved placement + mode", () => {
    // createMainWindow takes an explicit cold-start flag.
    expect(main).toMatch(
      /createMainWindow\(\s*isColdStartWindow:\s*boolean\s*\)/
    );
    expect(main).toContain("void createMainWindow(true)");
    expect(main).toContain("void createMainWindow(false)");
    // Placement is derived from the payload only for the cold-start window.
    expect(main).toMatch(
      /isColdStartWindow && coldStartPayload\s*\n?\s*\?\s*coldStartWindowSessionState/
    );
  });
});
