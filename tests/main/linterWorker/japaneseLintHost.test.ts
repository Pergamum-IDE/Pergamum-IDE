import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JapaneseLintWorkerError,
  createJapaneseLintHost,
  type JapaneseLintHost,
  type JapaneseLintHostExitInfo
} from "../../../src/main/linterWorker/japaneseLintHost";
import { createFakeWorkerWorld, type FakeWorkerWorld } from "./fakeWorkerWorld";

interface LoggedEvent {
  readonly level: string;
  readonly event: string;
  readonly details?: Record<string, unknown>;
}

function setup(
  options: Parameters<typeof createFakeWorkerWorld>[0] = {},
  hostOptions: {
    settings?: unknown;
    timeouts?: { startMs: number; requestMs: number; shutdownMs: number };
  } = {}
) {
  const world: FakeWorkerWorld = createFakeWorkerWorld(options);
  const events: LoggedEvent[] = [];
  const exits: JapaneseLintHostExitInfo[] = [];
  let counter = 0;
  const host: JapaneseLintHost = createJapaneseLintHost({
    ...world.deps,
    getSettings: () => hostOptions.settings,
    logger: {
      log: (input: LoggedEvent) => {
        events.push(input);
      }
    } as never,
    newRequestId: () => `req-${++counter}`,
    timeouts: hostOptions.timeouts ?? {
      startMs: 300,
      requestMs: 300,
      shutdownMs: 300
    },
    onExit: (info) => exits.push(info)
  });

  return { world, host, events, exits };
}

const hosts: JapaneseLintHost[] = [];

function tracked<T extends { host: JapaneseLintHost }>(value: T): T {
  hosts.push(value.host);

  return value;
}

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
  vi.restoreAllMocks();
});

describe("Japanese Linter Worker Host: lifecycle (#625 P1a)", () => {
  it("starts the Worker: init -> ready", async () => {
    const { host, world } = tracked(setup());

    expect(host.getState()).toBe("idle");

    await host.start();

    expect(host.getState()).toBe("ready");
    expect(world.children).toHaveLength(1);
    expect(world.children[0]?.sent.map((response) => response.type)).toEqual([
      "ready"
    ]);
  });

  it("matches the ready response to the init request id", async () => {
    const { host, world } = tracked(setup());

    await host.start();

    expect(world.children[0]?.sent[0]).toEqual({
      type: "ready",
      requestId: "req-1"
    });
  });

  it("answers ping with pong, matched by requestId", async () => {
    const { host, world } = tracked(setup());

    await host.start();

    const pong = await host.ping();

    expect(pong.requestId).toBe("req-2");
    expect(pong.roundTripMs).toBeGreaterThanOrEqual(0);
    expect(world.children[0]?.sent.at(-1)).toEqual({
      type: "pong",
      requestId: "req-2"
    });
  });

  it("keeps concurrent pings apart by requestId", async () => {
    const { host } = tracked(setup());

    await host.start();

    const [a, b, c] = await Promise.all([host.ping(), host.ping(), host.ping()]);

    expect(new Set([a.requestId, b.requestId, c.requestId]).size).toBe(3);
  });

  it("shuts the Worker down: shutdown -> shutdown-complete -> exit", async () => {
    const { host, world, exits } = tracked(setup());

    await host.start();
    await host.shutdown();

    expect(host.getState()).toBe("stopped");
    expect(world.children[0]?.sent.at(-1)?.type).toBe("shutdown-complete");
    expect(world.children[0]?.exited).toBe(true);
    // A requested stop is an expected exit, not a crash.
    expect(exits).toEqual([{ code: 0, signal: null, expected: true }]);
  });

  it("start() twice does not fork a second process", async () => {
    const { host, world } = tracked(setup());

    await Promise.all([host.start(), host.start()]);
    await host.start();

    expect(world.children).toHaveLength(1);
  });

  it("can start again after a clean shutdown", async () => {
    const { host, world } = tracked(setup());

    await host.start();
    await host.shutdown();
    await host.start();

    expect(world.children).toHaveLength(2);
    expect(host.getState()).toBe("ready");
    await expect(host.ping()).resolves.toBeDefined();
  });

  it("ping before start is rejected as not-running", async () => {
    const { host } = tracked(setup());

    await expect(host.ping()).rejects.toMatchObject({ kind: "not-running" });
  });
});

describe("Japanese Linter Worker Host: init payload (#625 P1a)", () => {
  it("sends the Host-resolved dictionary path and the settings snapshot", async () => {
    const { host, world } = tracked(
      setup(
        {},
        {
          settings: {
            rules: { "no-nfd": { enabled: false } },
            debounceMs: 1200,
            lineCacheLimit: 7000,
            workerRestartAttempts: 5
          }
        }
      )
    );

    await host.start();

    const init = world.children[0]?.received[0] as {
      type: string;
      requestId: string;
      dictionaryPath: string;
      config: {
        enabledRuleIds: string[];
        rules: { id: string; options: Record<string, number> }[];
        debounceMs: number;
        lineCacheLimit: number;
        workerRestartAttempts: number;
      };
    };

    expect(init.type).toBe("init");
    expect(init.requestId).toBe("req-1");
    expect(init.dictionaryPath).toBe("C:\\fake\\dict");
    expect(init.config.debounceMs).toBe(1200);
    expect(init.config.lineCacheLimit).toBe(7000);
    expect(init.config.workerRestartAttempts).toBe(5);
    expect(init.config.enabledRuleIds).not.toContain("no-nfd");
    expect(init.config.enabledRuleIds).not.toContain("sentence-length");
    expect(init.config.enabledRuleIds).toContain("max-ten");
    expect(
      init.config.rules.find((rule) => rule.id === "max-ten")?.options
    ).toEqual({ max: 5 });
  });

  it("uses the catalog defaults when nothing is stored", async () => {
    const { host, world } = tracked(setup());

    await host.start();

    const init = world.children[0]?.received[0] as {
      config: {
        enabledRuleIds: string[];
        debounceMs: number;
        lineCacheLimit: number;
        workerRestartAttempts: number;
      };
    };

    expect(init.config).toMatchObject({
      debounceMs: 800,
      lineCacheLimit: 5000,
      workerRestartAttempts: 3
    });
    expect(init.config.enabledRuleIds).toHaveLength(11);
  });

  it("falls back to default settings when the stored settings cannot be read", async () => {
    const world = createFakeWorkerWorld();
    const host = createJapaneseLintHost({
      ...world.deps,
      getSettings: () => {
        throw new Error("settings.json unreadable");
      },
      logger: { log: () => undefined } as never,
      timeouts: { startMs: 300, requestMs: 300, shutdownMs: 300 }
    });

    hosts.push(host);
    await expect(host.start()).resolves.toBeUndefined();
  });
});

describe("Japanese Linter Worker Host: failures (#625 P1a)", () => {
  it("survives a Worker that reports a missing dictionary", async () => {
    const { host, events } = tracked(setup({ dictionaryExists: false }));

    await expect(host.start()).rejects.toMatchObject({
      kind: "worker-error",
      workerError: { kind: "dictionary-missing" }
    });
    expect(host.getState()).toBe("failed");
    expect(
      events.some((event) => event.event === "japaneseLint.worker.error")
    ).toBe(true);
  });

  it("does not leave a process behind after a failed start", async () => {
    const { host, world } = tracked(setup({ dictionaryExists: false }));

    await host.start().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(world.children[0]?.killed).toBe(true);
  });

  it("times out a start when the Worker never answers", async () => {
    const { host } = tracked(
      setup(
        { silent: true },
        { timeouts: { startMs: 60, requestMs: 60, shutdownMs: 60 } }
      )
    );

    await expect(host.start()).rejects.toMatchObject({ kind: "timeout" });
    expect(host.getState()).toBe("failed");
  });

  it("fails a ping in flight when the Worker dies, without throwing elsewhere", async () => {
    const { host, world, exits } = tracked(
      setup({}, { timeouts: { startMs: 300, requestMs: 2000, shutdownMs: 300 } })
    );
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };

    process.on("unhandledRejection", onUnhandled);

    try {
      await host.start();

      // The Worker swallows the ping (never replies), then crashes.
      world.children[0]!.core = {
        handleMessage: async () => undefined,
        reportFatal: () => undefined
      };

      const ping = host.ping();

      world.children[0]!.crash(-1073741819);

      await expect(ping).rejects.toMatchObject({ kind: "worker-exited" });
      expect(host.getState()).toBe("failed");
      expect(exits).toEqual([
        { code: -1073741819, signal: null, expected: false }
      ]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("marks the Host failed after a crash and rejects later pings as not-running", async () => {
    const { host, world } = tracked(setup());

    await host.start();
    world.children[0]!.crash(1);

    await expect(host.ping()).rejects.toMatchObject({ kind: "not-running" });
  });

  it("the JapaneseLintWorkerError message is only its kind, never Worker text", async () => {
    const { host } = tracked(setup({ dictionaryExists: false }));
    const error = await host.start().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(JapaneseLintWorkerError);
    expect((error as Error).message).toBe("worker-error");
  });

  it("a listener that throws on exit does not break the Host", async () => {
    const world = createFakeWorkerWorld();
    const host = createJapaneseLintHost({
      ...world.deps,
      getSettings: () => undefined,
      logger: { log: () => undefined } as never,
      timeouts: { startMs: 300, requestMs: 300, shutdownMs: 300 },
      onExit: () => {
        throw new Error("listener bug");
      }
    });

    hosts.push(host);
    await host.start();
    world.children[0]!.crash(1);

    expect(host.getState()).toBe("failed");
  });

  it("ignores malformed and unsolicited messages from the Worker", async () => {
    const { host, world, events } = tracked(setup());

    await host.start();

    for (const garbage of [
      "text",
      42,
      null,
      { type: "nope" },
      { type: "pong" },
      { type: "pong", requestId: "no-such-request" },
      { type: "error", error: "not an object" }
    ]) {
      world.children[0]!.sendRaw(garbage);
    }

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(host.getState()).toBe("ready");
    // Still fully functional afterwards.
    await expect(host.ping()).resolves.toBeDefined();
    expect(
      events.filter((event) => event.event === "japaneseLint.worker.error").length
    ).toBeGreaterThan(0);
  });

  it("logs an unsolicited Worker error (sanitized) without failing pending work", async () => {
    const { host, world, events } = tracked(setup());

    await host.start();
    world.children[0]!.sendRaw({
      type: "error",
      error: {
        kind: "uncaught-exception",
        name: "TypeError",
        stack: ["    at tokenize (app.asar/dist/worker.js:120:15)"]
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const logged = events.find(
      (event) => event.event === "japaneseLint.worker.error"
    );

    expect(logged?.details).toMatchObject({
      errorName: "TypeError",
      workerErrorKind: "uncaught-exception",
      sanitizedStack: ["    at tokenize (app.asar/dist/worker.js:120:15)"]
    });
    expect(host.getState()).toBe("ready");
  });
});

describe("Japanese Linter Worker Host: shutdown safety (#625 P1a)", () => {
  it("a second shutdown is harmless (same result, no second exit)", async () => {
    const { host, exits } = tracked(setup());

    await host.start();
    await Promise.all([host.shutdown(), host.shutdown()]);
    await host.shutdown();

    expect(host.getState()).toBe("stopped");
    expect(exits).toHaveLength(1);
  });

  it("shutdown before start and after a crash does nothing and does not throw", async () => {
    const first = tracked(setup());

    await expect(first.host.shutdown()).resolves.toBeUndefined();

    const second = tracked(setup());

    await second.host.start();
    second.world.children[0]!.crash(1);
    await expect(second.host.shutdown()).resolves.toBeUndefined();
  });

  it("kills a Worker that ignores shutdown", async () => {
    const { host, world } = tracked(
      setup({}, { timeouts: { startMs: 300, requestMs: 300, shutdownMs: 60 } })
    );

    await host.start();
    world.children[0]!.core = {
      handleMessage: async () => undefined,
      reportFatal: () => undefined
    };
    await host.shutdown();

    expect(world.children[0]?.killed).toBe(true);
    expect(host.getState()).toBe("stopped");
  });

  it("dispose() is idempotent and rejects further use", async () => {
    const { host } = tracked(setup());

    await host.start();
    await host.dispose();
    await host.dispose();

    expect(host.getState()).toBe("disposed");
    await expect(host.start()).rejects.toMatchObject({ kind: "disposed" });
    await expect(host.ping()).rejects.toMatchObject({ kind: "not-running" });
  });

  it("dispose() while starting leaves no process running", async () => {
    const { host, world } = tracked(setup());
    const starting = host.start();

    await host.dispose();
    await starting.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(world.children.every((child) => child.exited)).toBe(true);
  });
});
