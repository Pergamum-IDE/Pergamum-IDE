import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStartupWindowReveal,
  type RevealableWindow
} from "../../src/main/startupWindowReveal";

function fakeWindow() {
  const calls: string[] = [];
  const state = { destroyed: false };
  const window: RevealableWindow = {
    isDestroyed: () => state.destroyed,
    show: () => {
      calls.push("show");
    },
    maximize: () => {
      calls.push("maximize");
    },
    setFullScreen: (flag) => {
      calls.push(`fullscreen:${flag}`);
    }
  };
  return { window, calls, state };
}

describe("startup window reveal (#659)", () => {
  it("shows a tracked window once and ignores a duplicate ready signal", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const { window, calls } = fakeWindow();
    reveal.track(window, "normal");

    expect(reveal.reveal(window)).toBe(true);
    expect(reveal.reveal(window)).toBe(false);
    expect(calls).toEqual(["show"]);
  });

  it("ignores windows that were never tracked", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const { window, calls } = fakeWindow();

    expect(reveal.reveal(window)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("does not show a destroyed window", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const { window, calls, state } = fakeWindow();
    reveal.track(window, "normal");
    state.destroyed = true;

    expect(reveal.reveal(window)).toBe(false);
    expect(calls).toEqual([]);
  });

  it("reveals each window independently (cold start + macOS activate)", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const first = fakeWindow();
    const second = fakeWindow();
    reveal.track(first.window, "normal");
    reveal.track(second.window, "normal");

    expect(reveal.reveal(first.window)).toBe(true);
    expect(second.calls).toEqual([]);
    expect(reveal.reveal(second.window)).toBe(true);
    expect(second.calls).toEqual(["show"]);
  });

  it("applies the saved mode only at reveal, immediately before show", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const maximized = fakeWindow();
    const fullscreen = fakeWindow();
    const normal = fakeWindow();
    reveal.track(maximized.window, "maximized");
    reveal.track(fullscreen.window, "fullscreen");
    reveal.track(normal.window, "normal");

    // Tracking alone (window still hidden) must not touch the window.
    expect(maximized.calls).toEqual([]);
    expect(fullscreen.calls).toEqual([]);

    reveal.reveal(maximized.window);
    reveal.reveal(fullscreen.window);
    reveal.reveal(normal.window);
    expect(maximized.calls).toEqual(["maximize", "show"]);
    expect(fullscreen.calls).toEqual(["fullscreen:true", "show"]);
    expect(normal.calls).toEqual(["show"]);
  });

  it("does not apply the mode to a destroyed window", () => {
    const reveal = createStartupWindowReveal<RevealableWindow>();
    const { window, calls, state } = fakeWindow();
    reveal.track(window, "maximized");
    state.destroyed = true;

    expect(reveal.reveal(window)).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("startup window reveal wiring in main.ts (#659)", () => {
  const main = readFileSync("src/main/main.ts", "utf8");

  it("creates the Main Window hidden and does not rely on ready-to-show", () => {
    expect(main).toMatch(/show:\s*false,\s*\n\s*webPreferences/);
    expect(main).not.toContain("ready-to-show");
  });

  it("reveals the sender window from the startupVisualReady IPC", () => {
    const handler = main.indexOf("WINDOW_CHANNELS.startupVisualReady");
    expect(handler).toBeGreaterThan(-1);
    const body = main.slice(handler, handler + 400);
    expect(body).toContain("BrowserWindow.fromWebContents(event.sender)");
    expect(body).toContain("startupWindowReveal.reveal(window)");
  });

  it("tracks every created window, not just the cold-start one", () => {
    const create = main.indexOf("async function createMainWindow");
    const track = main.indexOf("startupWindowReveal.track(", create);
    const firstLoad = main.indexOf("mainWindow.loadURL(", create);
    expect(track).toBeGreaterThan(create);
    expect(track).toBeLessThan(firstLoad);
  });
});
