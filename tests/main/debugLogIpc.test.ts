import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEBUG_LOG_CHANNELS } from "../../src/shared/api";
import type { DebugLogger } from "../../src/main/debugLogger";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.handle,
    on: electronMock.on
  }
}));

import { registerDebugLogIpc } from "../../src/main/debugLogIpc";

describe("debug log IPC", () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.on.mockClear();
  });

  it("routes renderer logging requests through the main debug logger", () => {
    const logger = {
      logRendererRequest: vi.fn(),
      getSnapshot: vi.fn()
    } as unknown as DebugLogger;
    registerDebugLogIpc(logger);

    const handler = registeredHandler(DEBUG_LOG_CHANNELS.logEvent);
    const request = {
      level: "debug",
      event: "command.invoked",
      details: {
        commandId: "workspace.files.toggle",
        fileName: "must-not-be-trusted.md"
      }
    };

    handler({ sender: {} }, request);

    expect(logger.logRendererRequest).toHaveBeenCalledWith(request);
  });

  it("returns the main-owned debug log snapshot", () => {
    const snapshot = {
      enabled: true,
      sessionId: "018f4b8c-7a2b-4c3d-9e4f-100000000001",
      events: [
        {
          seq: 1,
          timestamp: "2026-08-14T22:00:21.959+09:00",
          level: "info",
          event: "app.start"
        }
      ],
      uiDroppedEventCount: 0,
      uiBufferLimit: 1000
    };
    const logger = {
      logRendererRequest: vi.fn(),
      getSnapshot: vi.fn(() => snapshot)
    } as unknown as DebugLogger;
    registerDebugLogIpc(logger);

    const handler = registeredHandler(DEBUG_LOG_CHANNELS.getSnapshot);

    expect(handler({ sender: {} })).toBe(snapshot);
  });

  it("subscribes, sends sanitized events, and cleans up on unsubscribe", () => {
    let subscriber:
      | ((event: { seq: number; event: string; sessionId?: string }) => void)
      | null = null;
    const unsubscribeFromLogger = vi.fn();
    const logger = {
      logRendererRequest: vi.fn(),
      getSnapshot: vi.fn(),
      subscribe: vi.fn((callback) => {
        let active = true;
        subscriber = (event) => {
          if (active) {
            callback(event);
          }
        };
        return () => {
          active = false;
          unsubscribeFromLogger();
        };
      })
    } as unknown as DebugLogger;
    const sender = createSender();
    registerDebugLogIpc(logger);

    registeredListener(DEBUG_LOG_CHANNELS.subscribe)({ sender });
    subscriber?.({
      seq: 2,
      timestamp: "2026-08-14T22:00:22.000+09:00",
      level: "debug",
      event: "command.invoked",
      details: { commandId: "workspace.files.toggle" }
    });
    registeredListener(DEBUG_LOG_CHANNELS.unsubscribe)({ sender });
    subscriber?.({
      seq: 3,
      timestamp: "2026-08-14T22:00:23.000+09:00",
      level: "debug",
      event: "command.invoked"
    });

    expect(logger.subscribe).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(DEBUG_LOG_CHANNELS.event, {
      seq: 2,
      timestamp: "2026-08-14T22:00:22.000+09:00",
      level: "debug",
      event: "command.invoked",
      details: { commandId: "workspace.files.toggle" }
    });
    expect(sender.send.mock.calls[0][1]).not.toHaveProperty("sessionId");
    expect(unsubscribeFromLogger).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("cleans up the previous subscription when a sender subscribes again", () => {
    const unsubscribeCallbacks = [vi.fn(), vi.fn()];
    const logger = {
      logRendererRequest: vi.fn(),
      getSnapshot: vi.fn(),
      subscribe: vi
        .fn()
        .mockReturnValueOnce(unsubscribeCallbacks[0])
        .mockReturnValueOnce(unsubscribeCallbacks[1])
    } as unknown as DebugLogger;
    const sender = createSender();
    registerDebugLogIpc(logger);
    const subscribe = registeredListener(DEBUG_LOG_CHANNELS.subscribe);

    subscribe({ sender });
    subscribe({ sender });

    expect(unsubscribeCallbacks[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribeCallbacks[1]).not.toHaveBeenCalled();
  });
});

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = electronMock.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  );

  if (!registration) {
    throw new Error(`Handler was not registered for ${channel}.`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}

function registeredListener(channel: string): (...args: unknown[]) => unknown {
  const registration = electronMock.on.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  );

  if (!registration) {
    throw new Error(`Listener was not registered for ${channel}.`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}

function createSender(): {
  id: number;
  send: ReturnType<typeof vi.fn>;
  isDestroyed: () => boolean;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
} {
  return {
    id: 1,
    send: vi.fn(),
    isDestroyed: () => false,
    once: vi.fn(),
    off: vi.fn()
  };
}
