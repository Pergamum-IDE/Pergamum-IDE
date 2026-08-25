import { describe, expect, it, vi } from "vitest";
import {
  createAppShutdownCleanupController,
  installAppShutdownCleanup,
  type AppShutdownCleanupEvent
} from "../../src/main/shutdownCleanup";

function createQuitEvent(): AppShutdownCleanupEvent & {
  preventDefault: ReturnType<typeof vi.fn>;
} {
  return {
    preventDefault: vi.fn()
  };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("app shutdown cleanup", () => {
  it("prevents quit until async cleanup completes, then requests quit again", async () => {
    const cleanupCompletion = deferred();
    const cleanup = vi.fn(() => cleanupCompletion.promise);
    const requestQuit = vi.fn();
    const event = createQuitEvent();
    const controller = createAppShutdownCleanupController({
      cleanup,
      requestQuit
    });

    controller.handleQuitEvent(event);
    await Promise.resolve();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(requestQuit).not.toHaveBeenCalled();

    cleanupCompletion.resolve();
    await cleanupCompletion.promise;
    await Promise.resolve();

    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("runs cleanup once for repeated quit events while cleanup is pending", async () => {
    const cleanupCompletion = deferred();
    const cleanup = vi.fn(() => cleanupCompletion.promise);
    const requestQuit = vi.fn();
    const firstEvent = createQuitEvent();
    const secondEvent = createQuitEvent();
    const controller = createAppShutdownCleanupController({
      cleanup,
      requestQuit
    });

    controller.handleQuitEvent(firstEvent);
    controller.handleQuitEvent(secondEvent);
    await Promise.resolve();

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(requestQuit).not.toHaveBeenCalled();

    cleanupCompletion.resolve();
    await cleanupCompletion.promise;
    await Promise.resolve();

    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("does not prevent the resumed quit event after cleanup completes", async () => {
    const cleanup = vi.fn(async () => undefined);
    const requestQuit = vi.fn();
    const firstEvent = createQuitEvent();
    const resumedEvent = createQuitEvent();
    const controller = createAppShutdownCleanupController({
      cleanup,
      requestQuit
    });

    controller.handleQuitEvent(firstEvent);
    await Promise.resolve();
    await Promise.resolve();

    controller.handleQuitEvent(resumedEvent);

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(resumedEvent.preventDefault).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("resumes quit after a best-effort cleanup failure", async () => {
    const cleanup = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const requestQuit = vi.fn();
    const event = createQuitEvent();
    const controller = createAppShutdownCleanupController({
      cleanup,
      requestQuit
    });

    controller.handleQuitEvent(event);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("runs callback flush cleanup when release cleanup fails", async () => {
    const release = vi.fn(async () => {
      throw new Error("release failed");
    });
    const flush = vi.fn();
    const requestQuit = vi.fn();
    const event = createQuitEvent();
    const controller = createAppShutdownCleanupController({
      cleanup: async () => {
        try {
          await release();
        } finally {
          flush();
        }
      },
      requestQuit
    });

    controller.handleQuitEvent(event);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  it("installs before-quit and will-quit handlers on the app", () => {
    const listeners = new Map<
      "before-quit" | "will-quit",
      (event: AppShutdownCleanupEvent) => void
    >();
    const app = {
      on: vi.fn(
        (
          eventName: "before-quit" | "will-quit",
          listener: (event: AppShutdownCleanupEvent) => void
        ) => {
          listeners.set(eventName, listener);
        }
      ),
      quit: vi.fn()
    };

    installAppShutdownCleanup(app, async () => undefined);

    expect(app.on).toHaveBeenCalledTimes(2);
    expect(listeners.has("before-quit")).toBe(true);
    expect(listeners.has("will-quit")).toBe(true);
  });
});
