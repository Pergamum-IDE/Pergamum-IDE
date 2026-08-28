import type { App, BrowserWindow, IpcMain } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWindowLifecycleController,
  type WindowLifecycleSystemTerminationSource
} from "../../src/main/windowLifecycle";
import {
  LIFECYCLE_CHANNELS,
  type LifecycleCloseDecision,
  type LifecycleWindowCloseRequest,
  type QuitApplicationResult
} from "../../src/shared/api";

type IpcMainMock = Pick<IpcMain, "handle"> & {
  handle: ReturnType<typeof vi.fn>;
};

type AppMock = Pick<App, "quit"> & {
  quit: ReturnType<typeof vi.fn>;
};

type WindowEventName =
  | "close"
  | "closed"
  | "query-session-end"
  | "session-end";

interface PreventableCloseEvent {
  preventDefault: ReturnType<typeof vi.fn>;
}

class BrowserWindowMock {
  private static nextId = 1;
  private readonly listeners = new Map<
    WindowEventName,
    Array<(...args: unknown[]) => void>
  >();

  readonly id = BrowserWindowMock.nextId++;
  readonly webContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false)
  };
  readonly isDestroyed = vi.fn(() => false);
  readonly close = vi.fn();

  on(
    eventName: WindowEventName,
    listener: (...args: unknown[]) => void
  ): this {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  emit(eventName: WindowEventName, ...args: unknown[]): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(...args);
    }
  }

  emitClose(): PreventableCloseEvent {
    const event = { preventDefault: vi.fn() };
    this.emit("close", event);
    return event;
  }
}

function createHarness(options: {
  requestTimeoutMs?: number;
  getOpenWindowCount?: () => number;
  systemTerminationSource?: WindowLifecycleSystemTerminationSource;
} = {}) {
  const app: AppMock = {
    quit: vi.fn()
  };
  const ipcMain: IpcMainMock = {
    handle: vi.fn()
  } as unknown as IpcMainMock;
  const controller = createWindowLifecycleController({
    app,
    ipcMain,
    getOpenWindowCount: options.getOpenWindowCount ?? (() => 1),
    systemTerminationSource: options.systemTerminationSource,
    requestTimeoutMs: options.requestTimeoutMs
  });

  return { app, controller, ipcMain };
}

function asBrowserWindow(window: BrowserWindowMock): BrowserWindow {
  return window as unknown as BrowserWindow;
}

function sentCloseRequests(
  window: BrowserWindowMock
): LifecycleWindowCloseRequest[] {
  return window.webContents.send.mock.calls
    .filter(([channel]) => channel === LIFECYCLE_CHANNELS.windowCloseRequested)
    .map(([, request]) => request as LifecycleWindowCloseRequest);
}

function respondWindowClose(
  ipcMain: IpcMainMock,
  decision: LifecycleCloseDecision
): void {
  const registration = ipcMain.handle.mock.calls.find(
    ([channel]) => channel === LIFECYCLE_CHANNELS.respondWindowCloseRequest
  );

  if (!registration) {
    throw new Error("respondWindowCloseRequest handler was not registered.");
  }

  registration[1]({}, decision);
}

function requestQuitThroughIpc(
  ipcMain: IpcMainMock
): QuitApplicationResult {
  const registration = ipcMain.handle.mock.calls.find(
    ([channel]) => channel === LIFECYCLE_CHANNELS.quitApplication
  );

  if (!registration) {
    throw new Error("quitApplication handler was not registered.");
  }

  return registration[1](
    {},
    {
      requestId: "quit:renderer:1",
      intent: "explicitApplicationQuit"
    }
  ) as QuitApplicationResult;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("windowLifecycle ordinary window close (#271)", () => {
  it("moves idle close attempts to pending renderer decision", () => {
    const { controller } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    const event = window.emitClose();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(sentCloseRequests(window)).toEqual([
      {
        requestId: expect.stringMatching(/^ordinaryWindowClose:/),
        intent: "ordinaryWindowClose",
        isFinalWindow: true
      }
    ]);
  });

  it("prevents repeated close while pending without sending duplicate requests", () => {
    const { controller } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    const firstEvent = window.emitClose();
    const secondEvent = window.emitClose();

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(sentCloseRequests(window)).toHaveLength(1);
    expect(window.close).not.toHaveBeenCalled();
  });

  it("approves a matching request and lets the reentrant close pass", () => {
    const { controller, ipcMain } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));
    window.emitClose();
    const request = sentCloseRequests(window)[0];

    respondWindowClose(ipcMain, {
      status: "approved",
      requestId: request.requestId
    });
    const reentrantEvent = window.emitClose();

    expect(window.close).toHaveBeenCalledTimes(1);
    expect(reentrantEvent.preventDefault).not.toHaveBeenCalled();
    expect(sentCloseRequests(window)).toHaveLength(1);
  });

  it("returns to idle after cancelled and allows a later close request", () => {
    const { controller, ipcMain } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));
    window.emitClose();
    const firstRequest = sentCloseRequests(window)[0];

    respondWindowClose(ipcMain, {
      status: "cancelled",
      requestId: firstRequest.requestId
    });
    const secondEvent = window.emitClose();
    const requests = sentCloseRequests(window);

    expect(window.close).not.toHaveBeenCalled();
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].requestId).not.toBe(firstRequest.requestId);
  });

  it("returns to idle after failed without keeping stale intent", () => {
    const { controller, ipcMain } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));
    window.emitClose();
    const firstRequest = sentCloseRequests(window)[0];

    respondWindowClose(ipcMain, {
      status: "failed",
      requestId: firstRequest.requestId,
      reason: "dirtyResolutionFailed"
    });
    window.emitClose();
    const requests = sentCloseRequests(window);

    expect(window.close).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      intent: "ordinaryWindowClose",
      isFinalWindow: true
    });
    expect(requests[1].requestId).not.toBe(firstRequest.requestId);
  });

  it("ignores unknown or stale requestIds without breaking the current pending state", () => {
    const { controller, ipcMain } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));
    window.emitClose();
    const request = sentCloseRequests(window)[0];

    respondWindowClose(ipcMain, {
      status: "approved",
      requestId: "ordinaryWindowClose:stale"
    });
    const repeatedEvent = window.emitClose();
    respondWindowClose(ipcMain, {
      status: "approved",
      requestId: request.requestId
    });

    expect(repeatedEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(sentCloseRequests(window)).toHaveLength(1);
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("times out pending renderer decisions and rejects stale late approvals", () => {
    vi.useFakeTimers();
    const { controller, ipcMain } = createHarness({ requestTimeoutMs: 10 });
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));
    window.emitClose();
    const firstRequest = sentCloseRequests(window)[0];

    vi.advanceTimersByTime(10);
    respondWindowClose(ipcMain, {
      status: "approved",
      requestId: firstRequest.requestId
    });
    window.emitClose();
    const requests = sentCloseRequests(window);

    expect(window.close).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    expect(requests[1].requestId).not.toBe(firstRequest.requestId);
  });
});

describe("windowLifecycle explicit application quit (#271)", () => {
  it("quits once and lets later window close events pass after approval", () => {
    const { app, controller } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    expect(controller.requestApplicationQuit()).toEqual({ status: "quitting" });
    expect(controller.requestApplicationQuit()).toEqual({
      status: "ignored",
      reason: "quitAlreadyApproved"
    });
    const event = window.emitClose();

    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sentCloseRequests(window)).toHaveLength(0);
  });

  it("uses the same quit-approved state through the lifecycle quit IPC", () => {
    const { app, controller, ipcMain } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    expect(requestQuitThroughIpc(ipcMain)).toEqual({ status: "quitting" });
    expect(requestQuitThroughIpc(ipcMain)).toEqual({
      status: "ignored",
      reason: "quitAlreadyApproved"
    });
    const event = window.emitClose();

    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sentCloseRequests(window)).toHaveLength(0);
  });
});

describe("windowLifecycle system termination (#271)", () => {
  it("keeps markSystemTermination as a one-way transition that allows close events through", () => {
    const { controller } = createHarness();
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    controller.markSystemTermination();
    const firstEvent = window.emitClose();
    const secondEvent = window.emitClose();

    expect(firstEvent.preventDefault).not.toHaveBeenCalled();
    expect(secondEvent.preventDefault).not.toHaveBeenCalled();
    expect(sentCloseRequests(window)).toHaveLength(0);
  });

  it("treats powerMonitor shutdown as system termination", () => {
    let shutdownListener: (() => void) | null = null;
    const systemTerminationSource: WindowLifecycleSystemTerminationSource = {
      on: vi.fn((_eventName, listener) => {
        shutdownListener = listener;
      })
    };
    const { controller } = createHarness({ systemTerminationSource });
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    shutdownListener?.();
    const event = window.emitClose();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(sentCloseRequests(window)).toHaveLength(0);
  });

  it.each(["query-session-end", "session-end"] as const)(
    "treats %s as system termination",
    (eventName) => {
      const { controller } = createHarness();
      const window = new BrowserWindowMock();
      controller.registerWindow(asBrowserWindow(window));

      window.emit(eventName);
      const event = window.emitClose();

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(sentCloseRequests(window)).toHaveLength(0);
    }
  );
});

describe("windowLifecycle renderer unavailable close path (#271)", () => {
  it("does not create pending requests or stale timeouts when webContents is unavailable", () => {
    vi.useFakeTimers();
    const { controller, ipcMain } = createHarness({ requestTimeoutMs: 10 });
    const window = new BrowserWindowMock();
    controller.registerWindow(asBrowserWindow(window));

    window.webContents.isDestroyed.mockReturnValue(true);
    const unavailableEvent = window.emitClose();
    const repeatedUnavailableEvent = window.emitClose();
    vi.advanceTimersByTime(10);
    window.webContents.isDestroyed.mockReturnValue(false);
    const recoveredEvent = window.emitClose();
    const request = sentCloseRequests(window)[0];
    respondWindowClose(ipcMain, {
      status: "cancelled",
      requestId: request.requestId
    });

    expect(unavailableEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(repeatedUnavailableEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(recoveredEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(sentCloseRequests(window)).toHaveLength(1);
    expect(window.close).not.toHaveBeenCalled();
  });
});
