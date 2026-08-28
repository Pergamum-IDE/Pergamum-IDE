import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #274 BLOCKER 4: the saved maximize / fullscreen Window mode must be
 * applied to the cold-start BrowserWindow BEFORE the renderer content is
 * loaded, so the renderer's Session restore (layout → documents/editors →
 * #273 View State) can never run ahead of the Window mode being applied.
 *
 * `resolveWindowPlacement` / `applyWindowSessionMode` for the three modes
 * (normal / maximized / fullscreen) are unit-tested in
 * `windowStateRestore.test.ts`; this guards the ordering in `main.ts`.
 */
describe("cold-start Window mode wiring (#274 BLOCKER 4)", () => {
  const main = readFileSync("src/main/main.ts", "utf8");

  it("applies the Window mode before loadURL / loadFile", () => {
    const applyIndex = main.indexOf(
      "applyWindowSessionMode(mainWindow, placement.mode)"
    );
    const loadUrlIndex = main.indexOf("mainWindow.loadURL(");
    const loadFileIndex = main.indexOf("mainWindow.loadFile(");

    expect(applyIndex).toBeGreaterThan(-1);
    expect(loadUrlIndex).toBeGreaterThan(-1);
    expect(loadFileIndex).toBeGreaterThan(-1);

    expect(applyIndex).toBeLessThan(loadUrlIndex);
    expect(applyIndex).toBeLessThan(loadFileIndex);

    // The old "apply after the await load" hook is gone.
    expect(main).not.toContain("applyModeAfterLoad");
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
