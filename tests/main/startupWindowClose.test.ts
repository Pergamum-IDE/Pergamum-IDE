import { readFileSync } from "node:fs";
import type { App, BrowserWindow, IpcMain } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStartupWindowReveal,
  installStartupRevealFailsafe,
  STARTUP_REVEAL_FAILSAFE_MS,
  type FailsafeWindow
} from "../../src/main/startupWindowReveal";
import { createWindowLifecycleController } from "../../src/main/windowLifecycle";
import {
  LIFECYCLE_CHANNELS,
  type LifecycleWindowCloseRequest
} from "../../src/shared/api";
import type { WindowSessionMode } from "../../src/shared/session";

/**
 * #659 regression: the startup reveal wiring must not disturb the existing
 * window close handshake (close -> windowCloseRequested -> renderer decision
 * -> approved -> window.close()). These tests drive the REAL lifecycle
 * controller and the REAL reveal / failsafe helpers on one fake window, the
 * way createMainWindow wires them.
 */
class FakeWindow {
  private static nextId = 1;
  private readonly listeners = new Map<
    string,
    Array<(...args: unknown[]) => void>
  >();
  private readonly onceListeners = new Map<string, Array<() => void>>();

  readonly id = FakeWindow.nextId++;
  visible = false;
  destroyed = false;
  readonly shown: string[] = [];
  readonly webContentsListeners = new Map<string, Array<() => void>>();
  readonly webContents = {
    send: vi.fn(),
    isDestroyed: () => false,
    once: (eventName: string, listener: () => void) => {
      const list = this.webContentsListeners.get(eventName) ?? [];
      list.push(listener);
      this.webContentsListeners.set(eventName, list);
    }
  };
  readonly isDestroyed = () => this.destroyed;
  // Electron: maximize() / setFullScreen() show a hidden window.
  readonly maximize = vi.fn(() => {
    this.visible = true;
    this.shown.push("maximize");
  });
  readonly setFullScreen = vi.fn(() => {
    this.visible = true;
    this.shown.push("fullscreen");
  });
  readonly show = vi.fn(() => {
    this.visible = true;
    this.shown.push("show");
  });
  readonly close = vi.fn(() => {
    const event = { preventDefault: vi.fn() };
    this.emit("close", event);
    if (event.preventDefault.mock.calls.length === 0) {
      this.destroyed = true;
      this.visible = false;
      this.emit("closed");
    }
  });

  on(eventName: string, listener: (...args: unknown[]) => void): this {
    const list = this.listeners.get(eventName) ?? [];
    list.push(listener);
    this.listeners.set(eventName, list);
    return this;
  }

  once(eventName: string, listener: () => void): this {
    const list = this.onceListeners.get(eventName) ?? [];
    list.push(listener);
    this.onceListeners.set(eventName, list);
    return this;
  }

  emit(eventName: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(...args);
    }
    const once = this.onceListeners.get(eventName) ?? [];
    this.onceListeners.delete(eventName);
    for (const listener of once) {
      listener();
    }
  }
}

type RevealWindow = FakeWindow & FailsafeWindow;

function setup(mode: WindowSessionMode, registerCount = 1) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipcMain = {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }
  } as unknown as Pick<IpcMain, "handle">;
  const app = { quit: vi.fn(), relaunch: vi.fn() } as unknown as Pick<
    App,
    "quit" | "relaunch"
  >;
  const controller = createWindowLifecycleController({
    app,
    ipcMain,
    getOpenWindowCount: () => 1
  });

  const window = new FakeWindow();
  const reveal = createStartupWindowReveal<RevealWindow>();
  const revealable = window as unknown as RevealWindow;

  // Same order / count as createMainWindow.
  reveal.track(revealable, mode);
  installStartupRevealFailsafe(reveal, revealable);
  for (let i = 0; i < registerCount; i += 1) {
    controller.registerWindow(window as unknown as BrowserWindow);
  }

  const respond = (decision: unknown) =>
    handlers.get(LIFECYCLE_CHANNELS.respondWindowCloseRequest)?.({}, decision);

  return { window, reveal, revealable, respond };
}

/** Ordinary close: the user presses the close button, the renderer approves. */
function closeThroughHandshake(
  window: FakeWindow,
  respond: (decision: unknown) => unknown
) {
  const firstClose = { preventDefault: vi.fn() };
  window.emit("close", firstClose);

  expect(firstClose.preventDefault).toHaveBeenCalledTimes(1);
  expect(window.webContents.send).toHaveBeenCalledTimes(1);
  const [channel, request] = window.webContents.send.mock.calls[0] as [
    string,
    LifecycleWindowCloseRequest
  ];
  expect(channel).toBe(LIFECYCLE_CHANNELS.windowCloseRequested);

  respond({ status: "approved", requestId: request.requestId });
}

describe("startup reveal does not break the window close handshake (#659)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each<[WindowSessionMode, string[]]>([
    ["normal", ["show"]],
    ["maximized", ["maximize", "show"]],
    ["fullscreen", ["fullscreen", "show"]]
  ])("%s: ready -> visible -> ordinary close completes", (mode, steps) => {
    const { window, reveal, revealable, respond } = setup(mode);

    reveal.reveal(revealable);
    expect(window.shown).toEqual(steps);
    expect(window.visible).toBe(true);

    closeThroughHandshake(window, respond);

    // Approved -> exactly one window.close(), which is NOT prevented again,
    // and no second close request is sent.
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(window.destroyed).toBe(true);
    expect(window.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("registering the same window twice re-blocks the approved close (the regression)", () => {
    // Documents the failure mode: a duplicate close listener sees the state
    // reset by the first one and prevents the approved close again, so the
    // window can never close.
    const { window, reveal, revealable, respond } = setup("normal", 2);
    reveal.reveal(revealable);

    window.emit("close", { preventDefault: vi.fn() });
    const [, request] = window.webContents.send.mock.calls[0] as [
      string,
      LifecycleWindowCloseRequest
    ];
    respond({ status: "approved", requestId: request.requestId });

    // The approved window.close() was blocked again and re-requested.
    expect(window.destroyed).toBe(false);
    expect(window.webContents.send).toHaveBeenCalledTimes(2);
  });

  it("never mode-applies or shows a destroyed window", () => {
    const { window, reveal, revealable } = setup("maximized");
    window.destroyed = true;

    expect(reveal.reveal(revealable)).toBe(false);
    expect(window.maximize).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
  });

  it("the failsafe never shows a window that was already closed", () => {
    vi.useFakeTimers();
    const { window, reveal, revealable, respond } = setup("maximized");

    // Closed before the renderer ever reported ready.
    closeThroughHandshake(window, respond);
    expect(window.destroyed).toBe(true);

    vi.advanceTimersByTime(STARTUP_REVEAL_FAILSAFE_MS * 2);
    expect(window.show).not.toHaveBeenCalled();
    expect(window.maximize).not.toHaveBeenCalled();
    expect(reveal.reveal(revealable)).toBe(false);
  });

  it("the failsafe reveals a live window whose renderer never reports ready", () => {
    vi.useFakeTimers();
    const { window } = setup("normal");

    vi.advanceTimersByTime(STARTUP_REVEAL_FAILSAFE_MS);
    expect(window.shown).toEqual(["show"]);
  });

  it("a load failure reveals once; a later ready / failsafe does not re-show", () => {
    vi.useFakeTimers();
    const { window, reveal, revealable } = setup("normal");

    for (const listener of window.webContentsListeners.get("did-fail-load") ??
      []) {
      listener();
    }
    reveal.reveal(revealable);
    vi.advanceTimersByTime(STARTUP_REVEAL_FAILSAFE_MS);

    expect(window.show).toHaveBeenCalledTimes(1);
  });
});

describe("createMainWindow wiring (#659 regression)", () => {
  const main = readFileSync("src/main/main.ts", "utf8");

  it("registers each window with the lifecycle controller and session store exactly once", () => {
    expect(
      main.match(/windowLifecycleController\?\.registerWindow\(/g)
    ).toHaveLength(1);
    expect(
      main.match(/sessionStoreController\?\.attachWindow\(/g)
    ).toHaveLength(1);
  });

  it("registers the lifecycle controller before the renderer load", () => {
    const register = main.indexOf(
      "windowLifecycleController?.registerWindow("
    );
    expect(register).toBeGreaterThan(-1);
    expect(register).toBeLessThan(main.indexOf("mainWindow.loadURL("));
    expect(register).toBeLessThan(main.indexOf("mainWindow.loadFile("));
  });
});
